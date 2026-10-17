import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { novoId } from './id.js'
import {
  funilFases,
  funis,
  motivos,
  origens,
  papeisDecisao,
  tagGrupos,
  tags,
  tenantConfiguracoes,
  tiposAtividade,
} from './schema/index.js'
import type { Db } from './seeds/upsert.js'

type Tx = Pick<Db, 'insert' | 'update' | 'select'>

type Cor = (typeof tags.$inferInsert)['cor']

const STATUS: { nome: string; cor: Cor; chave: string }[] = [
  { nome: 'Lead', cor: 'teal', chave: 'lead' },
  { nome: 'Prospect', cor: 'amber', chave: 'prospect' },
  { nome: 'Cliente', cor: 'green', chave: 'cliente' },
  { nome: 'Inativo', cor: 'gray', chave: 'inativo' },
]
const VISITACAO: { nome: string; cor: Cor; chave: string }[] = [
  { nome: 'Visitada', cor: 'orange', chave: 'visitada' },
  { nome: 'Contactada', cor: 'blue', chave: 'contactada' },
]
const TIPOS: {
  nome: string
  chave: string
  icone: string
  cor: Cor
  contaComo: 'visita' | 'contato' | 'nenhum'
  exigeEmpresa?: boolean
}[] = [
  { nome: 'Ligação', chave: 'ligacao', icone: 'phone', cor: 'blue', contaComo: 'contato' },
  {
    nome: 'WhatsApp',
    chave: 'whatsapp',
    icone: 'message-circle',
    cor: 'green',
    contaComo: 'contato',
  },
  { nome: 'E-mail', chave: 'email', icone: 'mail', cor: 'indigo', contaComo: 'contato' },
  { nome: 'Visita', chave: 'visita', icone: 'map-pin', cor: 'orange', contaComo: 'visita' },
  { nome: 'Reunião', chave: 'reuniao', icone: 'users', cor: 'purple', contaComo: 'contato' },
  {
    nome: 'Tarefa',
    chave: 'tarefa',
    icone: 'square-check',
    cor: 'gray',
    contaComo: 'nenhum',
    exigeEmpresa: false,
  },
]
const FASES: { nome: string; cor: Cor; probabilidade: number }[] = [
  { nome: 'Qualificação', cor: 'teal', probabilidade: 10 },
  { nome: 'Diagnóstico', cor: 'blue', probabilidade: 25 },
  { nome: 'Proposta', cor: 'indigo', probabilidade: 50 },
  { nome: 'Negociação', cor: 'amber', probabilidade: 75 },
]
const ORIGENS: { nome: string; chave?: string }[] = [
  { nome: 'Indicação' },
  { nome: 'Site' },
  { nome: 'Evento' },
  { nome: 'Prospecção ativa' },
  { nome: 'Importação', chave: 'importacao' },
]
const MOTIVOS: Record<'perdido' | 'cancelado' | 'suspenso', string[]> = {
  perdido: [
    'Preço',
    'Concorrência',
    'Sem orçamento',
    'Sem retorno do cliente',
    'Escolheu solução interna',
  ],
  cancelado: ['Cliente desistiu do projeto', 'Duplicada', 'Cadastro errado'],
  suspenso: [
    'Aguardando orçamento do cliente',
    'Mudança de prioridade',
    'Parada da fábrica',
    'Troca de gestor',
  ],
}
const DIAS_ALERTA_PARADA = 14

/** Papéis na decisão que toda empresa começa tendo (Módulo 3). */
const PAPEIS_DE_DECISAO = ['Decisor', 'Influenciador', 'Usuário', 'Financeiro', 'Técnico']

/**
 * Cria, UMA ÚNICA VEZ por empresa, os papéis na decisão padrão. Marca própria
 * (`tenant_configuracoes.papeis_decisao_criados_em`), à parte dos demais padrões, porque os papéis
 * chegaram depois (Módulo 3) e as empresas que já existiam também precisam deles. Devolve `true` se criou.
 */
export async function criarPapeisDoTenant(
  tx: Tx,
  tenantId: string,
  membroId: string | null = null,
): Promise<boolean> {
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ papeisDecisaoCriadosEm: new Date() })
    .where(
      and(
        eq(tenantConfiguracoes.tenantId, tenantId),
        isNull(tenantConfiguracoes.papeisDecisaoCriadosEm),
      ),
    )
    .returning({ tenantId: tenantConfiguracoes.tenantId })
  if (reservado.length === 0) return false
  await tx.insert(papeisDecisao).values(
    PAPEIS_DE_DECISAO.map((nome, ordem) => ({
      tenantId,
      nome,
      ordem,
      criadoPor: membroId,
      atualizadoPor: membroId,
    })),
  )
  return true
}

/** Tag de sistema da geolocalização (G1): aplicada e retirada pelo sistema, sempre buscada por `chave_sistema`. */
export const CHAVE_GRUPO_CADASTRO = 'cadastro'
export const CHAVE_TAG_ENDERECO_A_CONFIRMAR = 'endereco_a_confirmar'

/**
 * Cria, UMA ÚNICA VEZ por empresa, o grupo de sistema "Cadastro" (tag "Endereço a confirmar") e acerta as
 * flags do mapa das tags de Status (Inativo não aparece; Inativo e Prospect não vêm ligados ao abrir).
 * Marca própria (`geo_padroes_criados_em`), à parte dos demais padrões, porque chegou depois (G1) e as
 * empresas que já existiam também precisam. Devolve `true` se criou.
 */
export async function criarPadroesGeoDoTenant(
  tx: Tx,
  tenantId: string,
  membroId: string | null = null,
): Promise<boolean> {
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ geoPadroesCriadosEm: new Date() })
    .where(
      and(
        eq(tenantConfiguracoes.tenantId, tenantId),
        isNull(tenantConfiguracoes.geoPadroesCriadosEm),
      ),
    )
    .returning({ tenantId: tenantConfiguracoes.tenantId })
  if (reservado.length === 0) return false

  const autoria = { tenantId, criadoPor: membroId, atualizadoPor: membroId }
  const [ultimo] = await tx
    .select({ ordem: sql<number>`coalesce(max(${tagGrupos.ordem}), -1)::int` })
    .from(tagGrupos)
    .where(and(eq(tagGrupos.tenantId, tenantId), isNull(tagGrupos.excluidoEm)))
  const [homonimo] = await tx
    .select({ id: tagGrupos.id })
    .from(tagGrupos)
    .where(
      and(
        eq(tagGrupos.tenantId, tenantId),
        isNull(tagGrupos.excluidoEm),
        sql`lower(${tagGrupos.nome}) = 'cadastro'`,
      ),
    )
  const grupoId = novoId()
  await tx.insert(tagGrupos).values({
    ...autoria,
    id: grupoId,
    // Se o administrador já tinha criado um grupo "Cadastro", o de sistema não pode repetir o nome
    nome: homonimo ? 'Cadastro (sistema)' : 'Cadastro',
    ordem: (ultimo?.ordem ?? -1) + 1,
    selecao: 'multipla',
    sistema: true,
    automatico: true,
    chaveSistema: CHAVE_GRUPO_CADASTRO,
  })
  await tx.insert(tags).values({
    ...autoria,
    tagGrupoId: grupoId,
    nome: 'Endereço a confirmar',
    cor: 'purple',
    chaveSistema: CHAVE_TAG_ENDERECO_A_CONFIRMAR,
    ordem: 0,
    // Não é status de venda: nunca vira chip do mapa
    apareceNoMapa: false,
    visivelAoAbrir: false,
  })

  await tx
    .update(tags)
    .set({ apareceNoMapa: false, visivelAoAbrir: false })
    .where(and(eq(tags.tenantId, tenantId), eq(tags.chaveSistema, 'inativo')))
  await tx
    .update(tags)
    .set({ visivelAoAbrir: false })
    .where(and(eq(tags.tenantId, tenantId), inArray(tags.chaveSistema, ['prospect'])))
  return true
}

/**
 * Cria, UMA ÚNICA VEZ por empresa, os cadastros padrão (tags Status e Visitação, tipos de atividade,
 * funil com fases, origens e motivos). A marca `tenant_configuracoes.padroes_criados_em` é gravada na
 * mesma transação, antes de tudo: com ela preenchida a função não faz nada, para nunca recriar um
 * padrão que o administrador excluiu de propósito (e para duas execuções simultâneas não duplicarem).
 *
 * Precisa rodar numa transação com o tenant ativo (`app.tenant_id`) e com a linha de
 * `tenant_configuracoes` já criada. Devolve `true` se criou, `false` se já estava feito.
 */
export async function criarPadroesDoTenant(
  tx: Tx,
  tenantId: string,
  membroId: string | null = null,
): Promise<boolean> {
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ padroesCriadosEm: new Date() })
    .where(
      and(eq(tenantConfiguracoes.tenantId, tenantId), isNull(tenantConfiguracoes.padroesCriadosEm)),
    )
    .returning({ tenantId: tenantConfiguracoes.tenantId })
  if (reservado.length === 0) return false

  const autoria = { tenantId, criadoPor: membroId, atualizadoPor: membroId }

  const statusId = novoId()
  const visitacaoId = novoId()
  await tx.insert(tagGrupos).values([
    {
      ...autoria,
      id: statusId,
      nome: 'Status',
      ordem: 0,
      selecao: 'unica',
      obrigatorio: true,
      sistema: true,
      chaveSistema: 'status',
    },
    {
      ...autoria,
      id: visitacaoId,
      nome: 'Visitação',
      ordem: 1,
      selecao: 'multipla',
      sistema: true,
      automatico: true,
      chaveSistema: 'visitacao',
    },
  ])
  await tx.insert(tags).values([
    ...STATUS.map((t, ordem) => ({
      ...autoria,
      tagGrupoId: statusId,
      nome: t.nome,
      cor: t.cor,
      chaveSistema: t.chave,
      ordem,
    })),
    ...VISITACAO.map((t, ordem) => ({
      ...autoria,
      tagGrupoId: visitacaoId,
      nome: t.nome,
      cor: t.cor,
      chaveSistema: t.chave,
      ordem,
    })),
  ])

  await tx.insert(tiposAtividade).values(
    TIPOS.map((t, ordem) => ({
      ...autoria,
      nome: t.nome,
      chaveSistema: t.chave,
      icone: t.icone,
      cor: t.cor,
      contaComo: t.contaComo,
      exigeEmpresa: t.exigeEmpresa ?? true,
      ordem,
    })),
  )

  const funilId = novoId()
  await tx.insert(funis).values({ ...autoria, id: funilId, nome: 'Vendas', padrao: true })
  await tx.insert(funilFases).values(
    FASES.map((f, ordem) => ({
      ...autoria,
      funilId,
      nome: f.nome,
      cor: f.cor,
      probabilidadePadrao: f.probabilidade,
      diasAlertaParada: DIAS_ALERTA_PARADA,
      ordem,
    })),
  )

  await tx.insert(origens).values(
    ORIGENS.map((o, ordem) => ({
      ...autoria,
      nome: o.nome,
      chaveSistema: o.chave ?? null,
      ordem,
    })),
  )
  let ordem = 0
  await tx
    .insert(motivos)
    .values(
      (Object.keys(MOTIVOS) as (keyof typeof MOTIVOS)[]).flatMap((status) =>
        MOTIVOS[status].map((nome) => ({ ...autoria, nome, aplicaA: [status], ordem: ordem++ })),
      ),
    )
  await criarPapeisDoTenant(tx, tenantId, membroId)
  await criarPadroesGeoDoTenant(tx, tenantId, membroId)
  return true
}
