import { z } from 'zod'

import { cnpjValido, normalizarCnpj } from './cnpj.js'
import { cpfValido } from './cpf.js'

// Portal, Fase 4E (docs/plano_portal_formularios_e_eventos.md, seção 7): construtor de formulários com
// condicionais, botões com ações (webhook e e-mail) e preenchimento automático para quem está logado.
// A definição é um JSON versionado; a MESMA validação roda no navegador e no servidor (o servidor sempre refaz).

// ------------------------------------------------------------------------------------------- campos

export const TIPOS_DE_CAMPO = [
  'texto',
  'texto_longo',
  'email',
  'telefone',
  'cnpj',
  'cpf',
  'numero',
  'moeda',
  'data',
  'hora',
  'selecao',
  'multipla',
  'sim_nao',
  'avaliacao',
  'nps',
  'aceite',
  'oculto',
  // Só apresentação (não guardam resposta)
  'titulo',
  'informativo',
  'quebra_de_pagina',
] as const
export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number]

/** Tipos que não guardam resposta. */
export const TIPOS_DE_APRESENTACAO: readonly TipoDeCampo[] = [
  'titulo',
  'informativo',
  'quebra_de_pagina',
]

export const ROTULO_DO_CAMPO_DO_FORMULARIO: Record<TipoDeCampo, string> = {
  texto: 'Texto curto',
  texto_longo: 'Texto longo',
  email: 'E-mail',
  telefone: 'Telefone',
  cnpj: 'CNPJ',
  cpf: 'CPF',
  numero: 'Número',
  moeda: 'Valor em R$',
  data: 'Data',
  hora: 'Hora',
  selecao: 'Escolha única',
  multipla: 'Múltipla escolha',
  sim_nao: 'Sim ou não',
  avaliacao: 'Avaliação (1 a 5 estrelas)',
  nps: 'Nota de 0 a 10',
  aceite: 'Aceite (caixa de marcar)',
  oculto: 'Campo oculto',
  titulo: 'Título de seção',
  informativo: 'Texto informativo',
  quebra_de_pagina: 'Quebra de página',
}

/** De onde vem o valor quando a pessoa está logada no portal (o servidor monta; o navegador não escolhe). */
export const FONTES_DE_PREENCHIMENTO = [
  'contato.nome',
  'contato.email',
  'contato.telefone',
  'contato.cargo',
  'empresa.cnpj',
  'empresa.razao_social',
  'empresa.nome_fantasia',
  'empresa.cidade',
  'empresa.uf',
] as const
export type FonteDePreenchimento = (typeof FONTES_DE_PREENCHIMENTO)[number]
export const ROTULO_DA_FONTE: Record<FonteDePreenchimento, string> = {
  'contato.nome': 'Nome da pessoa',
  'contato.email': 'E-mail da pessoa',
  'contato.telefone': 'Telefone da pessoa',
  'contato.cargo': 'Cargo da pessoa',
  'empresa.cnpj': 'CNPJ da empresa',
  'empresa.razao_social': 'Razão social',
  'empresa.nome_fantasia': 'Nome fantasia',
  'empresa.cidade': 'Cidade da empresa',
  'empresa.uf': 'UF da empresa',
}

export const OPERADORES = [
  'igual',
  'diferente',
  'contem',
  'maior',
  'menor',
  'preenchido',
  'vazio',
] as const
export type Operador = (typeof OPERADORES)[number]
export const ROTULO_DO_OPERADOR: Record<Operador, string> = {
  igual: 'é igual a',
  diferente: 'é diferente de',
  contem: 'contém',
  maior: 'é maior que',
  menor: 'é menor que',
  preenchido: 'está preenchido',
  vazio: 'está vazio',
}

const idDeCampo = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'use letras minúsculas, números e _ (começando por letra)')

export const condicaoSchema = z.object({
  campo: idDeCampo,
  operador: z.enum(OPERADORES),
  valor: z.string().max(200).optional(),
})
export type Condicao = z.infer<typeof condicaoSchema>

export const regraSchema = z.object({
  combinacao: z.enum(['todas', 'qualquer']),
  condicoes: z.array(condicaoSchema).min(1).max(10),
})
export type Regra = z.infer<typeof regraSchema>

export const opcaoSchema = z.object({
  valor: z.string().trim().min(1).max(80),
  rotulo: z.string().trim().min(1).max(120),
})

export const campoSchema = z.object({
  id: idDeCampo,
  tipo: z.enum(TIPOS_DE_CAMPO),
  rotulo: z.string().trim().min(1, 'dê um rótulo').max(200),
  ajuda: z.string().trim().max(300).optional(),
  obrigatorio: z.boolean().default(false),
  largura: z.enum(['inteira', 'metade', 'terco']).default('inteira'),
  /** Escolha única e múltipla */
  opcoes: z.array(opcaoSchema).max(50).optional(),
  /** Texto: tamanho; número e valor: faixa */
  minimo: z.number().optional(),
  maximo: z.number().optional(),
  valorPadrao: z.string().max(500).optional(),
  /** Para quem está logado: de onde vem o valor e se fica travado (só conferência) */
  preenchimento: z
    .object({ fonte: z.enum(FONTES_DE_PREENCHIMENTO), travado: z.boolean().default(false) })
    .optional(),
  /** O campo só aparece quando a regra vale; escondido, não é validado nem guardado */
  visivelQuando: regraSchema.optional(),
  /** Texto informativo (Markdown restrito) */
  texto: z.string().max(5000).optional(),
})
export type Campo = z.infer<typeof campoSchema>

// ------------------------------------------------------------------------------------------- ações

export const acaoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('webhook'),
    /** Em produção só https; o worker também confere o destino e recusa rede interna */
    url: z.url().max(500),
    condicao: regraSchema.optional(),
  }),
  z.object({
    tipo: z.literal('email'),
    /** Para endereços fixos ou para o e-mail digitado num campo do formulário */
    para: z.enum(['fixo', 'campo']),
    enderecos: z.array(z.email()).max(10).optional(),
    campo: idDeCampo.optional(),
    assunto: z.string().trim().min(1).max(160),
    /** Pode usar {{id_do_campo}} */
    mensagem: z.string().trim().min(1).max(5000),
    condicao: regraSchema.optional(),
  }),
])
export type Acao = z.infer<typeof acaoSchema>

export const botaoSchema = z.object({
  id: idDeCampo,
  rotulo: z.string().trim().min(1).max(60),
  estilo: z.enum(['primario', 'secundario']).default('primario'),
  acoes: z.array(acaoSchema).max(10).default([]),
})
export type Botao = z.infer<typeof botaoSchema>

export const MAXIMO_DE_CAMPOS = 200

/** A definição do formulário (o que o construtor edita e cada versão publicada congela). */
export const definicaoDeFormularioSchema = z
  .object({
    campos: z.array(campoSchema).min(1, 'acrescente ao menos um campo').max(MAXIMO_DE_CAMPOS),
    botoes: z.array(botaoSchema).min(1).max(3),
    mensagemDeSucesso: z.string().trim().max(1000).default('Recebemos sua resposta. Obrigado!'),
  })
  .superRefine((d, ctx) => {
    const vistos = new Map<string, Campo>()
    d.campos.forEach((c, i) => {
      if (vistos.has(c.id)) {
        ctx.addIssue({ code: 'custom', path: ['campos', i, 'id'], message: 'id repetido' })
      }
      if ((c.tipo === 'selecao' || c.tipo === 'multipla') && (c.opcoes?.length ?? 0) < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['campos', i, 'opcoes'],
          message: 'acrescente opções',
        })
      }
      for (const [j, cond] of (c.visivelQuando?.condicoes ?? []).entries()) {
        const alvo = vistos.get(cond.campo)
        // Só campos ANTERIORES: nunca há ciclo e a visibilidade se resolve numa passada
        if (!alvo || TIPOS_DE_APRESENTACAO.includes(alvo.tipo)) {
          ctx.addIssue({
            code: 'custom',
            path: ['campos', i, 'visivelQuando', 'condicoes', j, 'campo'],
            message: 'a condição só pode usar um campo de resposta que vem antes',
          })
        }
        if (!['preenchido', 'vazio'].includes(cond.operador) && cond.valor === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['campos', i, 'visivelQuando', 'condicoes', j, 'valor'],
            message: 'informe o valor',
          })
        }
      }
      vistos.set(c.id, c)
    })
    const botoes = new Set<string>()
    d.botoes.forEach((b, i) => {
      if (botoes.has(b.id)) {
        ctx.addIssue({ code: 'custom', path: ['botoes', i, 'id'], message: 'id repetido' })
      }
      botoes.add(b.id)
      b.acoes.forEach((a, j) => {
        if (a.tipo === 'email') {
          const alvo = a.campo ? vistos.get(a.campo) : undefined
          if (a.para === 'campo' && alvo?.tipo !== 'email') {
            ctx.addIssue({
              code: 'custom',
              path: ['botoes', i, 'acoes', j, 'campo'],
              message: 'escolha um campo de e-mail do formulário',
            })
          }
          if (a.para === 'fixo' && (a.enderecos?.length ?? 0) === 0) {
            ctx.addIssue({
              code: 'custom',
              path: ['botoes', i, 'acoes', j, 'enderecos'],
              message: 'informe ao menos um e-mail',
            })
          }
        }
        // Em produção o worker só chama https e nunca a rede interna (a mesma política dos webhooks da API)
        if (a.tipo === 'webhook' && !/^https?:\/\//.test(a.url)) {
          ctx.addIssue({
            code: 'custom',
            path: ['botoes', i, 'acoes', j, 'url'],
            message: 'use um endereço http(s)',
          })
        }
      })
    })
  })
export type DefinicaoDeFormulario = z.infer<typeof definicaoDeFormularioSchema>

/** Definição inicial de um formulário novo. */
export const definicaoInicial = (): DefinicaoDeFormulario => ({
  campos: [
    {
      id: 'nome',
      tipo: 'texto',
      rotulo: 'Nome',
      obrigatorio: true,
      largura: 'inteira',
      preenchimento: { fonte: 'contato.nome', travado: false },
    },
  ],
  botoes: [{ id: 'enviar', rotulo: 'Enviar', estilo: 'primario', acoes: [] }],
  mensagemDeSucesso: 'Recebemos sua resposta. Obrigado!',
})

// ------------------------------------------------------------------------------------- condicionais

export type ValorDeResposta = string | number | boolean | string[] | null
export type Respostas = Record<string, ValorDeResposta>

const vazio = (v: ValorDeResposta | undefined): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

const comoTexto = (v: ValorDeResposta | undefined): string =>
  vazio(v) ? '' : Array.isArray(v) ? v.join(',') : String(v)

function condicaoVale(c: Condicao, respostas: Respostas): boolean {
  const v = respostas[c.campo]
  const alvo = c.valor ?? ''
  switch (c.operador) {
    case 'preenchido':
      return !vazio(v)
    case 'vazio':
      return vazio(v)
    case 'igual':
      return Array.isArray(v) ? v.includes(alvo) : comoTexto(v) === alvo
    case 'diferente':
      return Array.isArray(v) ? !v.includes(alvo) : comoTexto(v) !== alvo
    case 'contem':
      return Array.isArray(v)
        ? v.includes(alvo)
        : comoTexto(v).toLocaleLowerCase('pt-BR').includes(alvo.toLocaleLowerCase('pt-BR'))
    case 'maior':
    case 'menor': {
      if (vazio(v)) return false
      const a = Number(v)
      const b = Number(alvo)
      if (Number.isNaN(a) || Number.isNaN(b)) return false
      return c.operador === 'maior' ? a > b : a < b
    }
  }
}

/** A regra vale para as respostas? (sem regra, sempre) */
export function regraVale(regra: Regra | undefined, respostas: Respostas): boolean {
  if (!regra) return true
  const r = regra.condicoes.map((c) => condicaoVale(c, respostas))
  return regra.combinacao === 'todas' ? r.every(Boolean) : r.some(Boolean)
}

/**
 * Os ids dos campos visíveis, numa passada (as condições só olham para trás). O valor de um campo escondido conta
 * como vazio para os que vêm depois.
 */
export function camposVisiveis(
  definicao: DefinicaoDeFormulario,
  respostas: Respostas,
): Set<string> {
  const visiveis = new Set<string>()
  const efetivas: Respostas = {}
  for (const c of definicao.campos) {
    if (regraVale(c.visivelQuando, efetivas)) {
      visiveis.add(c.id)
      if (c.id in respostas) efetivas[c.id] = respostas[c.id] ?? null
    }
  }
  return visiveis
}

/** As páginas (etapas): os campos entre as quebras de página. */
export function paginasDoFormulario(definicao: DefinicaoDeFormulario): Campo[][] {
  const paginas: Campo[][] = [[]]
  for (const c of definicao.campos) {
    if (c.tipo === 'quebra_de_pagina') paginas.push([])
    else paginas[paginas.length - 1]?.push(c)
  }
  return paginas.filter((p) => p.length > 0)
}

// --------------------------------------------------------------------------------------- validação

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/** Normaliza e confere um valor; devolve o valor limpo ou a mensagem de erro. */
function conferirValor(c: Campo, bruto: unknown): { valor: ValorDeResposta } | { erro: string } {
  const texto = typeof bruto === 'string' ? bruto.trim() : bruto
  /** O valor como texto, só de string ou número (objeto nunca vira "[object Object]") */
  const str = typeof texto === 'string' || typeof texto === 'number' ? String(texto) : ''
  switch (c.tipo) {
    case 'texto':
    case 'texto_longo':
    case 'oculto': {
      if (typeof texto !== 'string') return { erro: 'resposta inválida' }
      const max = c.maximo ?? (c.tipo === 'texto_longo' ? 5000 : 300)
      if (texto.length > max) return { erro: `no máximo ${max} caracteres` }
      if (c.minimo !== undefined && texto.length < c.minimo) {
        return { erro: `no mínimo ${c.minimo} caracteres` }
      }
      return { valor: texto }
    }
    case 'email':
      return typeof texto === 'string' && EMAIL.test(texto) && texto.length <= 254
        ? { valor: texto.toLowerCase() }
        : { erro: 'e-mail inválido' }
    case 'telefone': {
      const d = str.replace(/\D/g, '')
      return d.length >= 10 && d.length <= 13 ? { valor: d } : { erro: 'telefone inválido' }
    }
    case 'cnpj': {
      const n = normalizarCnpj(str)
      return cnpjValido(n) ? { valor: n } : { erro: 'CNPJ inválido' }
    }
    case 'cpf': {
      const d = str.replace(/\D/g, '')
      return cpfValido(d) ? { valor: d } : { erro: 'CPF inválido' }
    }
    case 'numero':
    case 'moeda': {
      const n = typeof texto === 'number' ? texto : Number(str.replace(',', '.'))
      if (!Number.isFinite(n)) return { erro: 'número inválido' }
      if (c.minimo !== undefined && n < c.minimo) return { erro: `no mínimo ${c.minimo}` }
      if (c.maximo !== undefined && n > c.maximo) return { erro: `no máximo ${c.maximo}` }
      return { valor: c.tipo === 'moeda' ? Math.round(n * 100) / 100 : n }
    }
    case 'data':
      return typeof texto === 'string' && DATA.test(texto) && !Number.isNaN(Date.parse(texto))
        ? { valor: texto }
        : { erro: 'data inválida' }
    case 'hora':
      return typeof texto === 'string' && HORA.test(texto)
        ? { valor: texto }
        : { erro: 'hora inválida' }
    case 'selecao':
      return typeof texto === 'string' && (c.opcoes ?? []).some((o) => o.valor === texto)
        ? { valor: texto }
        : { erro: 'escolha uma das opções' }
    case 'multipla': {
      if (!Array.isArray(bruto) || bruto.some((v) => typeof v !== 'string')) {
        return { erro: 'escolha entre as opções' }
      }
      const validos = new Set((c.opcoes ?? []).map((o) => o.valor))
      const lista = [...new Set(bruto as string[])]
      if (lista.some((v) => !validos.has(v))) return { erro: 'escolha entre as opções' }
      return { valor: lista }
    }
    case 'sim_nao':
    case 'aceite':
      return typeof bruto === 'boolean' ? { valor: bruto } : { erro: 'resposta inválida' }
    case 'avaliacao': {
      const n = Number(bruto)
      return Number.isInteger(n) && n >= 1 && n <= 5
        ? { valor: n }
        : { erro: 'dê uma nota de 1 a 5' }
    }
    case 'nps': {
      const n = Number(bruto)
      return Number.isInteger(n) && n >= 0 && n <= 10
        ? { valor: n }
        : { erro: 'dê uma nota de 0 a 10' }
    }
    default:
      return { valor: null }
  }
}

export interface ResultadoDaValidacao {
  ok: boolean
  /** Só os campos visíveis e de resposta, normalizados */
  valores: Respostas
  /** Mensagem por id de campo */
  erros: Record<string, string>
}

/**
 * Valida as respostas contra a definição: descarta campo desconhecido, de apresentação ou escondido pela
 * condição; confere obrigatórios e formatos. `travados` (preenchimento automático travado) sobrepõem o que veio.
 */
export function validarRespostasDoFormulario(
  definicao: DefinicaoDeFormulario,
  respostas: Record<string, unknown>,
  travados: Respostas = {},
): ResultadoDaValidacao {
  const entrada: Respostas = {}
  for (const c of definicao.campos) {
    if (c.id in travados) entrada[c.id] = travados[c.id] ?? null
    else if (c.id in respostas) entrada[c.id] = respostas[c.id] as ValorDeResposta
  }
  const visiveis = camposVisiveis(definicao, entrada)
  const valores: Respostas = {}
  const erros: Record<string, string> = {}
  for (const c of definicao.campos) {
    if (TIPOS_DE_APRESENTACAO.includes(c.tipo) || !visiveis.has(c.id)) continue
    const bruto = entrada[c.id]
    const semValor = vazio(bruto) || (c.tipo === 'aceite' && bruto === false)
    if (semValor) {
      if (c.obrigatorio) erros[c.id] = c.tipo === 'aceite' ? 'é preciso aceitar' : 'obrigatório'
      continue
    }
    const r = conferirValor(c, bruto)
    if ('erro' in r) erros[c.id] = r.erro
    else valores[c.id] = r.valor
  }
  return { ok: Object.keys(erros).length === 0, valores, erros }
}

/** Troca {{id}} pelo valor da resposta (texto puro; sem HTML). */
export function interpolar(modelo: string, valores: Respostas): string {
  return modelo.replace(/\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/g, (_, id: string) =>
    comoTexto(valores[id]),
  )
}

/** Tamanho máximo do corpo das respostas (sem arquivos). */
export const TAMANHO_MAXIMO_DAS_RESPOSTAS = 64 * 1024

// ------------------------------------------------------------------------------- formulário (API)

export const FINALIDADES_DE_FORMULARIO = [
  'livre',
  'inscricao_evento',
  'avaliacao_evento',
  'satisfacao_chamado',
  'associacao',
] as const
export type FinalidadeDeFormulario = (typeof FINALIDADES_DE_FORMULARIO)[number]
export const ROTULO_DA_FINALIDADE: Record<FinalidadeDeFormulario, string> = {
  livre: 'Livre',
  inscricao_evento: 'Inscrição em evento',
  avaliacao_evento: 'Avaliação de evento',
  satisfacao_chamado: 'Satisfação do chamado',
  associacao: 'Seja um associado',
}

export const ACESSOS_DE_FORMULARIO = ['publico', 'logado'] as const
export type AcessoDeFormulario = (typeof ACESSOS_DE_FORMULARIO)[number]

export const SITUACOES_DE_FORMULARIO = ['rascunho', 'publicado', 'arquivado'] as const
export type SituacaoDeFormulario = (typeof SITUACOES_DE_FORMULARIO)[number]

export const salvarFormularioSchema = z
  .object({
    nome: z.string().trim().min(3, 'dê um nome').max(120),
    finalidade: z.enum(FINALIDADES_DE_FORMULARIO).default('livre'),
    /** Público: qualquer pessoa pelo link; logado: só clientes do portal */
    acesso: z.enum(ACESSOS_DE_FORMULARIO).default('logado'),
    /** Captcha (Cloudflare Turnstile) nas respostas públicas, quando configurado */
    captcha: z.boolean().default(true),
    definicao: definicaoDeFormularioSchema,
  })
  .strict()
  .meta({ id: 'SalvarFormularioEntrada' })
export type SalvarFormularioEntrada = z.infer<typeof salvarFormularioSchema>

export const itemDeFormularioSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    finalidade: z.enum(FINALIDADES_DE_FORMULARIO),
    acesso: z.enum(ACESSOS_DE_FORMULARIO),
    situacao: z.enum(SITUACOES_DE_FORMULARIO),
    /** Endereço público: /f/<slug> */
    slug: z.string(),
    versaoPublicada: z.number().int().nullable(),
    /** O rascunho tem mudanças ainda não publicadas */
    temMudancas: z.boolean(),
    respostas: z.number().int(),
    ultimaRespostaEm: z.iso.datetime({ offset: true }).nullable(),
    atualizadoEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'ItemDeFormulario' })
export type ItemDeFormulario = z.infer<typeof itemDeFormularioSchema>

export const formularioSchema = itemDeFormularioSchema
  .extend({
    captcha: z.boolean(),
    /** O rascunho (o que o construtor edita) */
    definicao: z.unknown(),
  })
  .meta({ id: 'Formulario' })
export type Formulario = Omit<z.infer<typeof formularioSchema>, 'definicao'> & {
  definicao: DefinicaoDeFormulario
}

export const listaDeFormulariosSchema = z
  .object({ itens: z.array(itemDeFormularioSchema), total: z.number().int() })
  .meta({ id: 'ListaDeFormularios' })
export type ListaDeFormularios = z.infer<typeof listaDeFormulariosSchema>

export const consultaDeFormulariosSchema = z
  .object({
    situacao: z.enum(SITUACOES_DE_FORMULARIO).optional(),
    finalidade: z.enum(FINALIDADES_DE_FORMULARIO).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
export type ConsultaDeFormularios = z.infer<typeof consultaDeFormulariosSchema>

export const respostaDeFormularioSchema = z
  .object({
    id: z.uuid(),
    versao: z.number().int(),
    origem: z.enum(['portal', 'publico', 'crm']),
    botao: z.string(),
    valores: z.record(z.string(), z.unknown()),
    pessoa: z.string().nullable(),
    empresa: z.string().nullable(),
    contexto: z.object({ tipo: z.string(), id: z.uuid() }).nullable(),
    criadoEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'RespostaDeFormulario' })
export type RespostaDeFormulario = Omit<z.infer<typeof respostaDeFormularioSchema>, 'valores'> & {
  valores: Respostas
}

export const listaDeRespostasSchema = z
  .object({
    itens: z.array(respostaDeFormularioSchema),
    total: z.number().int(),
    /** Os campos da versão publicada, para as colunas */
    campos: z.array(z.object({ id: z.string(), rotulo: z.string(), tipo: z.string() })),
  })
  .meta({ id: 'ListaDeRespostas' })

export const consultaDeRespostasSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
export type ConsultaDeRespostas = z.infer<typeof consultaDeRespostasSchema>

/** O formulário como quem responde vê: a versão publicada e, logado, os valores preenchidos. */
export const formularioParaResponderSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    versao: z.number().int(),
    definicao: z.unknown(),
    /** Valores do preenchimento automático (só logado); os travados não mudam */
    preenchidos: z.record(z.string(), z.unknown()),
    travados: z.array(z.string()),
    /** Chave pública do captcha, quando exigido */
    captchaChave: z.string().nullable(),
  })
  .meta({ id: 'FormularioParaResponder' })
export type FormularioParaResponder = Omit<
  z.infer<typeof formularioParaResponderSchema>,
  'definicao' | 'preenchidos'
> & { definicao: DefinicaoDeFormulario; preenchidos: Respostas }

export const enviarRespostaSchema = z
  .object({
    versao: z.number().int().min(1),
    botao: idDeCampo,
    respostas: z.record(z.string(), z.unknown()),
    /** Consentimento LGPD do formulário público */
    aceitaPrivacidade: z.boolean().optional(),
    /** Token do captcha (público) */
    captcha: z.string().max(4096).optional(),
    /** Campo isca: gente não preenche; robô sim */
    site: z.string().max(200).optional(),
  })
  .strict()
  .meta({ id: 'EnviarRespostaEntrada' })
export type EnviarRespostaEntrada = z.infer<typeof enviarRespostaSchema>

export const respostaEnviadaSchema = z
  .object({ id: z.uuid().nullable(), mensagem: z.string() })
  .meta({ id: 'RespostaEnviada' })
