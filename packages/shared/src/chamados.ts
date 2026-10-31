import { z } from 'zod'

import { TAMANHO_MAXIMO_DE_PAGINA } from './paginacao.js'

// Central de chamados — lado da equipe (Fase 2; docs/funcionalidades.md, seção 3E). O portal do cliente
// (fase seguinte) usa as mesmas regras sobre as mesmas tabelas.

export const STATUS_DO_CHAMADO = [
  'aguardando_triagem',
  'pendente',
  'em_atendimento',
  'aguardando_cliente',
  'resolvido',
  'fechado',
] as const
export const statusDoChamadoSchema = z.enum(STATUS_DO_CHAMADO).meta({ id: 'StatusDoChamado' })
export type StatusDoChamado = z.infer<typeof statusDoChamadoSchema>

export const ROTULO_DO_STATUS_DO_CHAMADO: Record<StatusDoChamado, string> = {
  aguardando_triagem: 'Aguardando triagem',
  pendente: 'Pendente de atendimento',
  em_atendimento: 'Em atendimento',
  aguardando_cliente: 'Aguardando cliente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

/** Ainda não terminou: conta como aberto nas métricas e no cartão do painel. */
export const STATUS_ABERTOS: readonly StatusDoChamado[] = [
  'aguardando_triagem',
  'pendente',
  'em_atendimento',
  'aguardando_cliente',
]
export const estaAberto = (s: StatusDoChamado): boolean => STATUS_ABERTOS.includes(s)

export const PRIORIDADES_DO_CHAMADO = ['baixa', 'normal', 'alta', 'urgente'] as const
export const prioridadeDoChamadoSchema = z
  .enum(PRIORIDADES_DO_CHAMADO)
  .meta({ id: 'PrioridadeDoChamado' })
export type PrioridadeDoChamado = z.infer<typeof prioridadeDoChamadoSchema>

export const ROTULO_DA_PRIORIDADE: Record<PrioridadeDoChamado, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

/** Reabrir só vale até 7 dias depois de Resolvido (constante única, usada pela API e pela tela). */
export const PRAZO_DE_REABERTURA_DIAS = 7

/** Anexos: até 25 MB por arquivo e 5 por mensagem (varredura do antivírus antes de baixar). */
export const TAMANHO_MAXIMO_DO_ANEXO = 25 * 1024 * 1024
export const MAXIMO_DE_ANEXOS_POR_MENSAGEM = 5

/** Código exibido do chamado: CH-0042. */
export const codigoDoChamado = (numero: number): string => `CH-${String(numero).padStart(4, '0')}`

/**
 * Mudanças de estado que a equipe faz pelo seletor (a triagem, a reabertura e o fechamento
 * automático têm ações próprias). Resolvido só vai a Fechado; reabrir volta a Em atendimento.
 */
export const TRANSICOES_DO_CHAMADO: Record<StatusDoChamado, readonly StatusDoChamado[]> = {
  aguardando_triagem: [],
  pendente: ['em_atendimento', 'aguardando_cliente', 'resolvido'],
  em_atendimento: ['pendente', 'aguardando_cliente', 'resolvido'],
  aguardando_cliente: ['em_atendimento', 'pendente', 'resolvido'],
  resolvido: ['fechado'],
  fechado: [],
}
export const transicaoPermitida = (de: StatusDoChamado, para: StatusDoChamado): boolean =>
  TRANSICOES_DO_CHAMADO[de].includes(para)

/** Dentro do prazo para reabrir? `resolvidoEm` e `agora` em ISO ou Date. */
export function podeReabrir(
  status: StatusDoChamado,
  resolvidoEm: string | Date | null,
  agora: Date = new Date(),
): boolean {
  if (status !== 'resolvido' || resolvidoEm === null) return false
  const limite = new Date(resolvidoEm).getTime() + PRAZO_DE_REABERTURA_DIAS * 86_400_000
  return agora.getTime() <= limite
}

const assuntoSchema = z.string().trim().min(3, 'descreva o assunto em poucas palavras').max(200)
const textoSchema = z
  .string()
  .trim()
  .min(1, 'escreva a mensagem')
  .max(10_000, 'use até 10.000 caracteres')

// ---- Abrir e consultar ----

export const abrirChamadoSchema = z
  .object({
    assunto: assuntoSchema,
    descricao: z.string().trim().max(10_000).nullable().optional(),
    /** Nulo = "não sei a área": vai para a triagem (que, desligada, recusa com 400 `area_obrigatoria`) */
    areaId: z.uuid().nullable().optional(),
    prioridade: prioridadeDoChamadoSchema.default('normal'),
    /** Empresa da carteira a que o chamado se refere */
    empresaClienteId: z.uuid().nullable().optional(),
  })
  .strict()
  .meta({ id: 'AbrirChamadoEntrada' })
export type AbrirChamadoEntrada = z.infer<typeof abrirChamadoSchema>

export const ABAS_DE_CHAMADOS = ['triagem', 'pendentes', 'meus', 'todos'] as const
export const abaDeChamadosSchema = z.enum(ABAS_DE_CHAMADOS)
export type AbaDeChamados = z.infer<typeof abaDeChamadosSchema>

export const consultaDeChamadosSchema = z
  .object({
    aba: abaDeChamadosSchema.default('todos'),
    status: statusDoChamadoSchema.optional(),
    areaId: z.uuid().optional(),
    prioridade: prioridadeDoChamadoSchema.optional(),
    responsavelId: z.uuid().optional(),
    empresaClienteId: z.uuid().optional(),
    /** `true` = só os abertos (nem resolvidos nem fechados): a aba Chamados da ficha da empresa usa */
    abertos: z.enum(['true', 'false']).optional(),
    /** `portal` = só os abertos pelo cliente no portal (o hub do portal usa) */
    origem: z.enum(['interna', 'portal']).optional(),
    /** Número (CH-0042 ou 42) ou parte do assunto */
    busca: z.string().trim().max(100).optional(),
    de: z.iso.date().optional(),
    ate: z.iso.date().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(25),
  })
  .strict()
export type ConsultaDeChamados = z.infer<typeof consultaDeChamadosSchema>

const pessoaSchema = z.object({ id: z.uuid(), nome: z.string() })

/** Um prazo (resposta ou resolução): meta em minutos úteis e quando vence. Ausente = sem meta. */
export const prazoDoChamadoSchema = z
  .object({
    metaMin: z.number().int(),
    /** Minutos úteis já consumidos (a pausa de Aguardando cliente não conta) */
    consumidoMin: z.number(),
    /** Quando vence; nulo com o prazo pausado ou sem expediente configurado */
    venceEm: z.iso.datetime().nullable(),
    atrasado: z.boolean(),
    /** Cumprido: a primeira resposta saiu / o chamado foi resolvido (dentro da meta ou não) */
    cumpridoEm: z.iso.datetime().nullable(),
    pausado: z.boolean(),
  })
  .meta({ id: 'PrazoDoChamado' })
export type PrazoDoChamado = z.infer<typeof prazoDoChamadoSchema>

export const itemDeChamadoSchema = z
  .object({
    id: z.uuid(),
    numero: z.number().int(),
    codigo: z.string(),
    assunto: z.string(),
    status: statusDoChamadoSchema,
    prioridade: prioridadeDoChamadoSchema,
    area: pessoaSchema.nullable(),
    responsavel: pessoaSchema.nullable(),
    /** Quem abriu: o membro da equipe ou o contato do cliente */
    solicitante: z.object({ tipo: z.enum(['membro', 'contato']), nome: z.string() }),
    empresaCliente: pessoaSchema.nullable(),
    origem: z.enum(['interna', 'portal']),
    criadoEm: z.iso.datetime(),
    atualizadoEm: z.iso.datetime(),
    statusAlteradoEm: z.iso.datetime(),
    primeiraRespostaEm: z.iso.datetime().nullable(),
    resolvidoEm: z.iso.datetime().nullable(),
    prazoResposta: prazoDoChamadoSchema.nullable(),
    prazoResolucao: prazoDoChamadoSchema.nullable(),
    /** Nota (1 a 5) que o cliente deu pelo portal; nulo se não avaliou (Fase 4A, B-10) */
    notaDoCliente: z.number().int().min(1).max(5).nullable(),
  })
  .meta({ id: 'ItemDeChamado' })
export type ItemDeChamado = z.infer<typeof itemDeChamadoSchema>

export const listaDeChamadosSchema = z
  .object({
    itens: z.array(itemDeChamadoSchema),
    total: z.number().int(),
    /** Quantos há em cada aba (a contagem das abas e do cartão "Chamados pendentes") */
    abas: z.object({
      triagem: z.number().int(),
      pendentes: z.number().int(),
      meus: z.number().int(),
      todos: z.number().int(),
    }),
  })
  .meta({ id: 'ListaDeChamados' })
export type ListaDeChamados = z.infer<typeof listaDeChamadosSchema>

// ---- Detalhe: conversa, notas, anexos e linha do tempo ----

export const ESTADOS_DE_ANEXO = ['pendente_varredura', 'limpo', 'infectado'] as const
export const estadoDeAnexoSchema = z.enum(ESTADOS_DE_ANEXO).meta({ id: 'EstadoDeAnexo' })
export type EstadoDeAnexo = z.infer<typeof estadoDeAnexoSchema>

export const ROTULO_DO_ESTADO_DE_ANEXO: Record<EstadoDeAnexo, string> = {
  pendente_varredura: 'Verificando',
  limpo: 'Verificado',
  infectado: 'Bloqueado (vírus)',
}

export const anexoDoChamadoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    mime: z.string(),
    tamanho: z.number().int(),
    estado: estadoDeAnexoSchema,
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'AnexoDoChamado' })
export type AnexoDoChamado = z.infer<typeof anexoDoChamadoSchema>

export const mensagemDoChamadoSchema = z
  .object({
    id: z.uuid(),
    autor: z.object({ tipo: z.enum(['membro', 'contato']), id: z.uuid(), nome: z.string() }),
    corpo: z.string(),
    anexos: z.array(anexoDoChamadoSchema),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'MensagemDoChamado' })
export type MensagemDoChamado = z.infer<typeof mensagemDoChamadoSchema>

export const notaInternaSchema = z
  .object({
    id: z.uuid(),
    autor: pessoaSchema,
    corpo: z.string(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'NotaInterna' })
export type NotaInterna = z.infer<typeof notaInternaSchema>

export const TIPOS_DE_EVENTO_DO_CHAMADO = [
  'aberto',
  'triado',
  'atribuido',
  'assumido',
  'status_alterado',
  'prioridade_alterada',
  'area_alterada',
  'primeira_resposta',
  'mensagem',
  'nota_interna',
  'anexo',
  'resolvido',
  'reaberto',
  'fechado',
] as const
export const tipoDeEventoDoChamadoSchema = z.enum(TIPOS_DE_EVENTO_DO_CHAMADO)
export type TipoDeEventoDoChamado = z.infer<typeof tipoDeEventoDoChamadoSchema>

export const eventoDoChamadoSchema = z
  .object({
    id: z.uuid(),
    tipo: tipoDeEventoDoChamadoSchema,
    ator: z.object({ tipo: z.enum(['membro', 'contato', 'sistema']), nome: z.string().nullable() }),
    statusDe: statusDoChamadoSchema.nullable(),
    statusPara: statusDoChamadoSchema.nullable(),
    areaDe: z.string().nullable(),
    areaPara: z.string().nullable(),
    responsavelDe: z.string().nullable(),
    responsavelPara: z.string().nullable(),
    prioridadeDe: prioridadeDoChamadoSchema.nullable(),
    prioridadePara: prioridadeDoChamadoSchema.nullable(),
    em: z.iso.datetime(),
  })
  .meta({ id: 'EventoDoChamado' })
export type EventoDoChamado = z.infer<typeof eventoDoChamadoSchema>

/** O que a pessoa pode fazer neste chamado (a tela só mostra os botões; o servidor decide de novo). */
export const acoesDoChamadoSchema = z
  .object({
    responder: z.boolean(),
    notaInterna: z.boolean(),
    triar: z.boolean(),
    atribuir: z.boolean(),
    assumir: z.boolean(),
    alterarStatus: z.boolean(),
    reabrir: z.boolean(),
    /** Statuses que o seletor pode oferecer agora */
    statusPossiveis: z.array(statusDoChamadoSchema),
  })
  .meta({ id: 'AcoesDoChamado' })
export type AcoesDoChamado = z.infer<typeof acoesDoChamadoSchema>

export const chamadoSchema = itemDeChamadoSchema
  .extend({
    descricao: z.string().nullable(),
    fechadoEm: z.iso.datetime().nullable(),
    reaberturas: z.number().int(),
    mensagens: z.array(mensagemDoChamadoSchema),
    /** Só para quem atende o chamado; nunca para o solicitante comum nem para o cliente */
    notasInternas: z.array(notaInternaSchema),
    eventos: z.array(eventoDoChamadoSchema),
    acoes: acoesDoChamadoSchema,
    /** A avaliação do cliente pelo portal (nota de 1 a 5 e comentário), uma por chamado */
    avaliacao: z
      .object({
        nota: z.number().int().min(1).max(5),
        comentario: z.string().nullable(),
        avaliadoEm: z.iso.datetime(),
      })
      .nullable(),
  })
  .meta({ id: 'Chamado' })
export type Chamado = z.infer<typeof chamadoSchema>

// ---- Ações ----

export const triarChamadoSchema = z
  .object({
    areaId: z.uuid(),
    prioridade: prioridadeDoChamadoSchema.optional(),
    responsavelId: z.uuid().nullable().optional(),
  })
  .strict()
  .meta({ id: 'TriarChamadoEntrada' })
export type TriarChamadoEntrada = z.infer<typeof triarChamadoSchema>

export const atribuirChamadoSchema = z
  .object({ responsavelId: z.uuid().nullable() })
  .strict()
  .meta({ id: 'AtribuirChamadoEntrada' })
export type AtribuirChamadoEntrada = z.infer<typeof atribuirChamadoSchema>

export const alterarStatusDoChamadoSchema = z
  .object({ status: statusDoChamadoSchema })
  .strict()
  .meta({ id: 'AlterarStatusDoChamadoEntrada' })
export type AlterarStatusDoChamadoEntrada = z.infer<typeof alterarStatusDoChamadoSchema>

/** Muda a prioridade e/ou passa o chamado para outra área (esta, para quem tria ou atribui). */
export const alterarChamadoSchema = z
  .object({
    prioridade: prioridadeDoChamadoSchema.optional(),
    areaId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (d) => d.prioridade !== undefined || d.areaId !== undefined,
    'informe a prioridade ou a área',
  )
  .meta({ id: 'AlterarChamadoEntrada' })
export type AlterarChamadoEntrada = z.infer<typeof alterarChamadoSchema>

export const enviarMensagemSchema = z
  .object({
    corpo: textoSchema,
    anexoIds: z.array(z.uuid()).max(MAXIMO_DE_ANEXOS_POR_MENSAGEM).default([]),
  })
  .strict()
  .meta({ id: 'EnviarMensagemEntrada' })
export type EnviarMensagemEntrada = z.infer<typeof enviarMensagemSchema>

export const criarNotaInternaSchema = z
  .object({ corpo: textoSchema })
  .strict()
  .meta({ id: 'CriarNotaInternaEntrada' })
export type CriarNotaInternaEntrada = z.infer<typeof criarNotaInternaSchema>

// ---- Anexos: envio direto ao Garage por URL pré-assinada ----

export const pedirEnvioDeAnexoSchema = z
  .object({
    nome: z.string().trim().min(1).max(200),
    mime: z.string().trim().min(3).max(150),
    tamanho: z.number().int().min(1, 'arquivo vazio').max(TAMANHO_MAXIMO_DO_ANEXO, 'use até 25 MB'),
  })
  .strict()
  .meta({ id: 'PedirEnvioDeAnexoEntrada' })
export type PedirEnvioDeAnexoEntrada = z.infer<typeof pedirEnvioDeAnexoSchema>

export const envioDeAnexoSchema = z
  .object({
    anexoId: z.uuid(),
    /** URL pré-assinada (PUT) para enviar o arquivo direto ao armazenamento */
    url: z.url(),
    /** Cabeçalhos que o PUT precisa levar (tipo do conteúdo) */
    cabecalhos: z.record(z.string(), z.string()),
    expiraEm: z.iso.datetime(),
  })
  .meta({ id: 'EnvioDeAnexo' })
export type EnvioDeAnexo = z.infer<typeof envioDeAnexoSchema>

export const downloadDeAnexoSchema = z
  .object({ url: z.url(), expiraEm: z.iso.datetime() })
  .meta({ id: 'DownloadDeAnexo' })
export type DownloadDeAnexo = z.infer<typeof downloadDeAnexoSchema>

/** Quem pode receber os chamados de uma área (para escolher o responsável ao triar ou atribuir). */
export const consultaDeAtendentesSchema = z.object({ areaId: z.uuid() }).strict()
export type ConsultaDeAtendentes = z.infer<typeof consultaDeAtendentesSchema>

export const atendenteSchema = z
  .object({ id: z.uuid(), nome: z.string() })
  .meta({ id: 'AtendenteDoChamado' })
export type AtendenteDoChamado = z.infer<typeof atendenteSchema>
