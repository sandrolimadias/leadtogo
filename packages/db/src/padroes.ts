import { and, eq, isNull } from 'drizzle-orm'

import { novoId } from './id.js'
import {
  funilFases,
  funis,
  motivos,
  origens,
  tagGrupos,
  tags,
  tenantConfiguracoes,
  tiposAtividade,
} from './schema/index.js'
import type { Db } from './seeds/upsert.js'

type Tx = Pick<Db, 'insert' | 'update'>

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
  return true
}
