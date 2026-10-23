import { z } from 'zod'

import {
  type CampoDeVisita,
  campoDeVisitaSchema,
  chaveDeResultadoDeVisitaSchema,
  modoDeCheckinSchema,
} from './visitas.js'

// Visitas no campo: check-in, relatório e sincronização (G3b; docs/funcionalidades.md, seção 3C, e
// docs/plano_geolocalizacao.md, seção 9.2).

export const posicaoDoAparelhoSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    /** Precisão informada pelo aparelho, em metros */
    precisaoM: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .meta({ id: 'PosicaoDoAparelho' })
export type PosicaoDoAparelho = z.infer<typeof posicaoDoAparelhoSchema>

// ---- Respostas ----

export const contatoDaRespostaSchema = z.union([
  z.object({ contatoId: z.uuid() }).strict(),
  z
    .object({
      novo: z
        .object({
          nome: z.string().trim().min(2, 'informe o nome do contato').max(200),
          cargo: z.string().trim().max(100).optional(),
          telefone: z.string().trim().max(30).optional(),
          email: z.email('e-mail inválido').max(200).optional(),
        })
        .strict(),
    })
    .strict(),
])
export type ContatoDaResposta = z.infer<typeof contatoDaRespostaSchema>

export const proximoPassoDaRespostaSchema = z
  .object({
    tipoAtividadeId: z.uuid(),
    titulo: z.string().trim().min(1, 'informe o próximo passo').max(200),
    /** Quando: data e hora (ISO) ou, com `diaInteiro`, a meia-noite do dia */
    data: z.iso.datetime({ offset: true }),
    diaInteiro: z.boolean(),
  })
  .strict()
export type ProximoPassoDaResposta = z.infer<typeof proximoPassoDaRespostaSchema>

/** Uma resposta como o aparelho envia: o valor depende do tipo do campo (validado por `validarRespostas`). */
export const respostaDeVisitaSchema = z
  .object({ campoId: z.uuid(), valor: z.unknown() })
  .strict()
  .meta({ id: 'RespostaDeVisita' })
export type RespostaDeVisita = z.infer<typeof respostaDeVisitaSchema>

/** A resposta gravada: com o rótulo do campo na época (o modelo pode mudar depois). */
export const respostaGravadaSchema = z
  .object({ campoId: z.uuid(), rotulo: z.string(), valor: z.unknown() })
  .meta({ id: 'RespostaGravada' })
export type RespostaGravada = z.infer<typeof respostaGravadaSchema>

const vazio = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0)

/** O schema do valor de cada tipo de campo (o valor vazio é tratado à parte: "sem resposta"). */
function valorDoCampo(campo: CampoDeVisita): z.ZodType {
  switch (campo.tipo) {
    case 'texto_curto':
      return z.string().max(200, 'use até 200 caracteres')
    case 'texto_longo':
      return z.string().max(5000, 'use até 5.000 caracteres')
    case 'numero':
      return z.number().finite('informe um número')
    case 'data':
      return z.iso.date('use uma data válida')
    case 'sim_nao':
    case 'tag':
      return z.boolean()
    case 'nota':
      return z.number().int().min(1).max(5)
    case 'escolha_unica':
      return z.enum(campo.opcoes.map((o) => o.id) as [string, ...string[]])
    case 'multipla_escolha':
      return z.array(z.enum(campo.opcoes.map((o) => o.id) as [string, ...string[]])).max(30)
    case 'contato':
      return contatoDaRespostaSchema
    case 'proximo_passo':
      return proximoPassoDaRespostaSchema
    case 'dados_empresa':
      return campo.campoEmpresa === 'numero_funcionarios'
        ? z.number().int().min(0).max(10_000_000)
        : campo.campoEmpresa === 'vertical_id'
          ? z.uuid()
          : z
              .string()
              .trim()
              .max(campo.campoEmpresa === 'website' ? 300 : 200)
  }
}

export interface ErroDaResposta {
  campoId: string
  mensagem: string
}

/**
 * Confere as respostas contra os campos da versão do modelo: campo desconhecido, valor que não é do
 * tipo e (ao concluir) obrigatório sem resposta. Devolve as respostas limpas (sem as vazias), na ordem
 * dos campos e com o rótulo da época.
 */
export function validarRespostas(
  campos: readonly CampoDeVisita[],
  respostas: readonly RespostaDeVisita[],
  concluir: boolean,
): { respostas: RespostaGravada[]; erros: ErroDaResposta[] } {
  const erros: ErroDaResposta[] = []
  const porCampo = new Map<string, unknown>()
  for (const r of respostas) {
    if (!campos.some((c) => c.id === r.campoId)) {
      erros.push({ campoId: r.campoId, mensagem: 'campo que não existe neste modelo' })
    } else if (porCampo.has(r.campoId)) {
      erros.push({ campoId: r.campoId, mensagem: 'resposta repetida' })
    } else porCampo.set(r.campoId, r.valor)
  }
  const limpas: RespostaGravada[] = []
  for (const campo of campos) {
    const valor = porCampo.get(campo.id)
    if (vazio(valor)) {
      if (concluir && campo.obrigatorio) {
        erros.push({ campoId: campo.id, mensagem: `responda "${campo.rotulo}"` })
      }
      continue
    }
    const v = valorDoCampo(campo).safeParse(valor)
    if (!v.success) {
      erros.push({
        campoId: campo.id,
        mensagem: `"${campo.rotulo}": ${v.error.issues[0]?.message ?? 'valor inválido'}`,
      })
      continue
    }
    limpas.push({ campoId: campo.id, rotulo: campo.rotulo, valor: v.data })
  }
  return { respostas: limpas, erros }
}

// ---- Salvar (o PUT idempotente) ----

export const checkinDaVisitaSchema = z
  .object({
    /** Quando o check-in foi feito no aparelho */
    em: z.iso.datetime({ offset: true }),
    posicao: posicaoDoAparelhoSchema,
    /** Feito sem sinal: o modo foi aplicado no aparelho; o servidor recalcula e só marca */
    offline: z.boolean(),
  })
  .strict()
  .meta({ id: 'CheckinDaVisita' })
export type CheckinDaVisita = z.infer<typeof checkinDaVisitaSchema>

export const salvarVisitaSchema = z
  .object({
    empresaId: z.uuid(),
    /** Só vale na criação; `null` = "registrar depois" (sem check-in e sem posição) */
    checkin: checkinDaVisitaSchema.nullable(),
    resultadoId: z.uuid().nullable(),
    respostas: z.array(respostaDeVisitaSchema).max(60),
    /** `true` conclui: valida os obrigatórios, a atividade vira Realizada e os efeitos rodam */
    concluir: z.boolean(),
    /** Quando a visita aconteceu (padrão: o check-in, ou agora) */
    realizadaEm: z.iso.datetime({ offset: true }).optional(),
    /** Longe do endereço: grava a posição do check-in como a posição da empresa */
    atualizarPosicaoDaEmpresa: z.boolean().optional(),
    /** Resultado "Empresa encerrada": muda o Status para Inativo */
    inativarEmpresa: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'SalvarVisitaEntrada' })
export type SalvarVisitaEntrada = z.infer<typeof salvarVisitaSchema>

// ---- Leitura ----

export const situacaoDoRelatorioSchema = z.enum(['rascunho', 'concluido'])
export type SituacaoDoRelatorio = z.infer<typeof situacaoDoRelatorioSchema>

export const relatorioDeVisitaSchema = z
  .object({
    id: z.uuid(),
    empresa: z.object({ id: z.uuid(), nome: z.string() }),
    atividadeId: z.uuid(),
    responsavel: z.object({ id: z.uuid(), nome: z.string() }),
    situacao: situacaoDoRelatorioSchema,
    semCheckin: z.boolean(),
    checkinEm: z.string().nullable(),
    checkinOffline: z.boolean(),
    foraDoLimite: z.boolean(),
    /** Só para quem tem `visitas.ver_localizacao`; para os demais, sempre null */
    distanciaM: z.number().int().nullable(),
    posicao: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
    /** Quem vê a localização dos check-ins (a tela decide se mostra o bloco) */
    localizacaoVisivel: z.boolean(),
    resultado: z
      .object({
        id: z.uuid(),
        nome: z.string(),
        chaveSistema: chaveDeResultadoDeVisitaSchema.nullable(),
      })
      .nullable(),
    modeloVersao: z
      .object({ id: z.uuid(), numero: z.number().int(), campos: z.array(campoDeVisitaSchema) })
      .nullable(),
    respostas: z.array(respostaGravadaSchema),
    concluidoEm: z.string().nullable(),
    criadoEm: z.string(),
    atualizadoEm: z.string(),
  })
  .meta({ id: 'RelatorioDeVisita' })
export type RelatorioDeVisita = z.infer<typeof relatorioDeVisitaSchema>

export const itemDeVisitaSchema = relatorioDeVisitaSchema
  .pick({
    id: true,
    empresa: true,
    atividadeId: true,
    responsavel: true,
    situacao: true,
    semCheckin: true,
    checkinEm: true,
    foraDoLimite: true,
    resultado: true,
    concluidoEm: true,
    criadoEm: true,
  })
  .meta({ id: 'ItemDeVisita' })
export type ItemDeVisita = z.infer<typeof itemDeVisitaSchema>

export const consultaDeVisitasSchema = z
  .object({
    empresaId: z.uuid().optional(),
    /** `pendentes`: só os rascunhos da pessoa (a lista do celular e o card do Dashboard) */
    so: z.enum(['pendentes']).optional(),
  })
  .strict()

export const distanciaDoCheckinSchema = z
  .object({
    empresaTemPosicao: z.boolean(),
    distanciaM: z.number().int().nullable(),
    limiteM: z.number().int(),
    modo: modoDeCheckinSchema,
    foraDoLimite: z.boolean(),
    /** No modo "bloquear", além do limite o check-in não é aceito */
    bloqueado: z.boolean(),
  })
  .meta({ id: 'DistanciaDoCheckin' })
export type DistanciaDoCheckin = z.infer<typeof distanciaDoCheckinSchema>

/** Como o aparelho decide o check-in (o servidor aplica a mesma regra online). */
export function decidirCheckin(
  distanciaM: number | null,
  modo: 'avisar' | 'bloquear' | 'so_gravar',
  limiteM: number,
): { foraDoLimite: boolean; bloqueado: boolean; avisar: boolean } {
  const fora = distanciaM !== null && distanciaM > limiteM
  return {
    foraDoLimite: fora,
    bloqueado: fora && modo === 'bloquear',
    avisar: fora && modo === 'avisar',
  }
}

// ---- Offline ----

/** "Levar para offline": até 300 empresas por vez (decisão do Ale), válidas por 7 dias no aparelho. */
export const MAX_EMPRESAS_OFFLINE = 300
export const DIAS_DE_VALIDADE_OFFLINE = 7

export const levarParaOfflineSchema = z
  .object({
    empresaIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_EMPRESAS_OFFLINE, `leve até ${MAX_EMPRESAS_OFFLINE} empresas por vez`),
  })
  .strict()
  .meta({ id: 'LevarParaOfflineEntrada' })
export type LevarParaOfflineEntrada = z.infer<typeof levarParaOfflineSchema>

/**
 * O mínimo de uma empresa para visitar sem sinal (docs/lgpd.md, 3.2): nome, endereço, posição, telefone,
 * tags e contatos ativos. Sem CNPJ, observações nem histórico.
 */
export const empresaOfflineSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    endereco: z.string().nullable(),
    posicao: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
    telefone: z.string().nullable(),
    tags: z.array(z.object({ id: z.uuid(), nome: z.string(), cor: z.string() })),
    contatos: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        cargo: z.string().nullable(),
        telefone: z.string().nullable(),
      }),
    ),
    /** A pessoa pode registrar visita nela (a empresa está na carteira que ela edita) */
    podeVisitar: z.boolean(),
  })
  .meta({ id: 'EmpresaOffline' })
export type EmpresaOffline = z.infer<typeof empresaOfflineSchema>

export const pacoteOfflineSchema = z
  .object({
    empresas: z.array(empresaOfflineSchema),
    /** As que não vieram: fora da carteira que a pessoa vê, ou excluídas */
    ignoradas: z.number().int(),
    geradoEm: z.string(),
  })
  .meta({ id: 'PacoteOffline' })
export type PacoteOffline = z.infer<typeof pacoteOfflineSchema>
