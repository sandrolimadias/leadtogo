import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { novoId } from './id.js'
import {
  areasAtendimento,
  calendarioExpediente,
  configTriagem,
  feriados,
  funilFases,
  funis,
  motivos,
  origens,
  papeisDecisao,
  tagGrupos,
  tags,
  tenantConfiguracoes,
  tiposAtividade,
  visitaModelos,
  visitaModeloVersoes,
  visitaResultados,
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
 * Campo do relatório de visita como fica no jsonb `visita_modelo_versoes.campos`. A validação por tipo é
 * do `campoDeVisitaSchema` do @leadtogo/shared (um teste da API confere o modelo de fábrica contra ele);
 * a ordem dos campos é a posição na lista.
 */
export interface CampoDeVisitaGravado {
  id: string
  rotulo: string
  tipo: string
  obrigatorio: boolean
  opcoes?: { id: string; rotulo: string }[]
  tagId?: string
  campoEmpresa?: string
}

const opcoes = (...rotulos: string[]) => rotulos.map((rotulo) => ({ id: novoId(), rotulo }))

/** Modelo de fábrica do relatório de visita (plano do G3, seção 9.1). Ids novos a cada empresa. */
export const camposDoModeloDeFabrica = (): CampoDeVisitaGravado[] => [
  { id: novoId(), rotulo: 'Contato', tipo: 'contato', obrigatorio: false },
  {
    id: novoId(),
    rotulo: 'Número de funcionários',
    tipo: 'dados_empresa',
    obrigatorio: false,
    campoEmpresa: 'numero_funcionarios',
  },
  {
    id: novoId(),
    rotulo: 'Interesse',
    tipo: 'escolha_unica',
    obrigatorio: false,
    opcoes: opcoes('Alto', 'Médio', 'Baixo', 'Nenhum'),
  },
  { id: novoId(), rotulo: 'Demandas', tipo: 'texto_longo', obrigatorio: false },
  {
    id: novoId(),
    rotulo: 'Ações feitas',
    tipo: 'multipla_escolha',
    obrigatorio: false,
    opcoes: opcoes('WhatsApp', 'E-mail', 'Material'),
  },
  { id: novoId(), rotulo: 'Próximo passo', tipo: 'proximo_passo', obrigatorio: false },
  { id: novoId(), rotulo: 'Resumo', tipo: 'texto_longo', obrigatorio: false },
]

const RESULTADOS_DE_VISITA: { nome: string; chave?: 'nao_localizada' | 'encerrada' }[] = [
  { nome: 'Visita realizada' },
  { nome: 'Retornar depois' },
  { nome: 'Sem interesse' },
  { nome: 'Responsável ausente' },
  { nome: 'Não localizada', chave: 'nao_localizada' },
  { nome: 'Empresa encerrada', chave: 'encerrada' },
]

/**
 * Cria, UMA ÚNICA VEZ por empresa, o modelo padrão do relatório de visita (versão 1) e os seis
 * resultados apontando para ele (G3a). Marca própria (`visitas_padroes_criados_em`), porque chegou
 * depois e as empresas que já existiam também precisam. Devolve `true` se criou.
 */
export async function criarPadroesVisitaDoTenant(
  tx: Tx,
  tenantId: string,
  membroId: string | null = null,
): Promise<boolean> {
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ visitasPadroesCriadosEm: new Date() })
    .where(
      and(
        eq(tenantConfiguracoes.tenantId, tenantId),
        isNull(tenantConfiguracoes.visitasPadroesCriadosEm),
      ),
    )
    .returning({ tenantId: tenantConfiguracoes.tenantId })
  if (reservado.length === 0) return false

  const autoria = { tenantId, criadoPor: membroId, atualizadoPor: membroId }
  const [homonimo] = await tx
    .select({ id: visitaModelos.id })
    .from(visitaModelos)
    .where(
      and(
        eq(visitaModelos.tenantId, tenantId),
        isNull(visitaModelos.excluidoEm),
        sql`lower(${visitaModelos.nome}) = 'relatório de visita'`,
      ),
    )
  const modeloId = novoId()
  const versaoId = novoId()
  await tx.insert(visitaModelos).values({
    ...autoria,
    id: modeloId,
    nome: homonimo ? 'Relatório de visita (padrão)' : 'Relatório de visita',
    padrao: true,
  })
  await tx.insert(visitaModeloVersoes).values({
    ...autoria,
    id: versaoId,
    modeloId,
    numero: 1,
    campos: camposDoModeloDeFabrica(),
  })
  await tx
    .update(visitaModelos)
    .set({ versaoAtualId: versaoId })
    .where(eq(visitaModelos.id, modeloId))
  await tx.insert(visitaResultados).values(
    RESULTADOS_DE_VISITA.map((r, ordem) => ({
      ...autoria,
      nome: r.nome,
      chaveSistema: r.chave ?? null,
      modeloId,
      ordem,
    })),
  )
  return true
}

/** Áreas de atendimento criadas por padrão em cada empresa (Fase 2). */
const AREAS_DE_CHAMADO: { nome: string; chave: string }[] = [
  { nome: 'Jurídico', chave: 'juridico' },
  { nome: 'Financeiro', chave: 'financeiro' },
  { nome: 'Comercial', chave: 'comercial' },
  { nome: 'Administrativo', chave: 'administrativo' },
]

/** Feriados nacionais de data fixa (valem todo ano). */
const FERIADOS_FIXOS: { mes: number; dia: number; nome: string }[] = [
  { mes: 1, dia: 1, nome: 'Confraternização Universal' },
  { mes: 4, dia: 21, nome: 'Tiradentes' },
  { mes: 5, dia: 1, nome: 'Dia do Trabalho' },
  { mes: 9, dia: 7, nome: 'Independência do Brasil' },
  { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida' },
  { mes: 11, dia: 2, nome: 'Finados' },
  { mes: 11, dia: 15, nome: 'Proclamação da República' },
  { mes: 11, dia: 20, nome: 'Dia da Consciência Negra' },
  { mes: 12, dia: 25, nome: 'Natal' },
]

const doisDigitos = (n: number) => String(n).padStart(2, '0')
const dataIso = (ano: number, mes: number, dia: number) =>
  `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como `{ mes, dia }`. */
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return { mes, dia }
}

/**
 * Feriados nacionais móveis do ano (Carnaval, Sexta-feira Santa e Corpus Christi), em `AAAA-MM-DD`.
 * Não recorrem: cada ano é gravado à parte (`gerarFeriadosMoveis`).
 */
export function feriadosNacionaisMoveis(ano: number): { data: string; nome: string }[] {
  const { mes, dia } = pascoa(ano)
  const base = Date.UTC(ano, mes - 1, dia)
  const em = (dias: number, nome: string) => {
    const d = new Date(base + dias * 86_400_000)
    return { data: dataIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), nome }
  }
  return [
    em(-48, 'Segunda-feira de Carnaval'),
    em(-47, 'Terça-feira de Carnaval'),
    em(-2, 'Sexta-feira Santa'),
    em(60, 'Corpus Christi'),
  ]
}

/**
 * Grava os feriados nacionais móveis do ano que ainda não existem na empresa. Idempotente (não repete
 * a data, nem recria o que o administrador excluiu: a exclusão é lógica e a data continua ocupada só
 * enquanto não excluída; aqui só se acrescenta o que falta).
 */
export async function gerarFeriadosMoveis(
  tx: Tx,
  tenantId: string,
  ano: number,
  membroId: string | null = null,
): Promise<number> {
  const linhas = feriadosNacionaisMoveis(ano).map((f) => ({
    tenantId,
    data: f.data,
    nome: f.nome,
    recorrente: false,
    criadoPor: membroId,
    atualizadoPor: membroId,
  }))
  const criadas = await tx
    .insert(feriados)
    .values(linhas)
    .onConflictDoNothing()
    .returning({ id: feriados.id })
  return criadas.length
}

/**
 * Cria, UMA ÚNICA VEZ por empresa, as áreas de atendimento padrão (Jurídico, Financeiro, Comercial,
 * Administrativo; sem metas), o expediente (segunda a sexta, 8h às 18h), os feriados nacionais (os de
 * data fixa, recorrentes, e os móveis do ano e do seguinte) e a triagem desligada (Fase 2: chamados).
 * Marca própria (`chamados_padroes_criados_em`), porque chegou depois e as empresas que já existiam
 * também precisam. Devolve `true` se criou.
 */
export async function criarPadroesChamadosDoTenant(
  tx: Tx,
  tenantId: string,
  membroId: string | null = null,
  hoje: Date = new Date(),
): Promise<boolean> {
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ chamadosPadroesCriadosEm: new Date() })
    .where(
      and(
        eq(tenantConfiguracoes.tenantId, tenantId),
        isNull(tenantConfiguracoes.chamadosPadroesCriadosEm),
      ),
    )
    .returning({ tenantId: tenantConfiguracoes.tenantId })
  if (reservado.length === 0) return false

  const autoria = { tenantId, criadoPor: membroId, atualizadoPor: membroId }
  await tx.insert(areasAtendimento).values(
    AREAS_DE_CHAMADO.map((a, ordem) => ({
      ...autoria,
      nome: a.nome,
      chaveSistema: a.chave,
      ordem,
    })),
  )
  await tx.insert(calendarioExpediente).values(
    [1, 2, 3, 4, 5].map((diaSemana) => ({
      tenantId,
      diaSemana,
      inicio: '08:00',
      fim: '18:00',
      atualizadoPor: membroId,
    })),
  )
  const ano = hoje.getUTCFullYear()
  await tx.insert(feriados).values(
    FERIADOS_FIXOS.map((f) => ({
      ...autoria,
      data: dataIso(ano, f.mes, f.dia),
      nome: f.nome,
      recorrente: true,
    })),
  )
  await gerarFeriadosMoveis(tx, tenantId, ano, membroId)
  await gerarFeriadosMoveis(tx, tenantId, ano + 1, membroId)
  await tx
    .insert(configTriagem)
    .values({ tenantId, ativa: false, atualizadoPor: membroId })
    .onConflictDoNothing()
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
  await criarPadroesVisitaDoTenant(tx, tenantId, membroId)
  await criarPadroesChamadosDoTenant(tx, tenantId, membroId)
  return true
}
