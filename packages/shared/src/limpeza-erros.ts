// Limpeza dos eventos de erro antes de saírem do processo (GlitchTip/Sentry, API, worker e web).
// Função pura, sem dependência do SDK: o `beforeSend` dos dois lados chama `limparEvento`.
// Regra: nenhum cookie, credencial, corpo de requisição, e-mail, CPF/CNPJ ou telefone sai daqui.
// Identificadores (tenant_id, user_id, request_id) viajam como TAGS, que esta limpeza preserva.

import { cnpjValido, normalizarCnpj } from './cnpj.js'

const REMOVIDO = '[removido]'

/** Chaves cujo valor nunca sai, em qualquer nível de `extra`, `contexts` e dados de breadcrumb. */
const CHAVE_SENSIVEL =
  /cookie|authorization|senha|password|passwd|token|secret|segredo|api[-_]?key|credential|credencial/i

/** Cabeçalhos HTTP que podem ficar no evento (tudo o mais é descartado). */
const CABECALHOS_PERMITIDOS = new Set([
  'user-agent',
  'content-type',
  'accept-language',
  'x-request-id',
])

// Os padrões soltos não podem casar dentro de identificadores (uuid, hash, ids): exigem borda.
const B_ESQ = String.raw`(?<![\w.-])`
const B_DIR = String.raw`(?![\w-])`

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi
const CNPJ_FORMATADO = new RegExp(
  `${B_ESQ}[0-9A-Z]{2}\\.[0-9A-Z]{3}\\.[0-9A-Z]{3}/[0-9A-Z]{4}-[0-9]{2}${B_DIR}`,
  'gi',
)
const CNPJ_SOLTO = new RegExp(`${B_ESQ}[0-9A-Z]{14}${B_DIR}`, 'g')
const CPF_FORMATADO = new RegExp(`${B_ESQ}\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}${B_DIR}`, 'g')
const CPF_SOLTO = new RegExp(`${B_ESQ}\\d{11}${B_DIR}`, 'g')
const TELEFONES = [
  // +55 (11) 91234-5678 · 5511912345678
  new RegExp(`${B_ESQ}\\+?55[\\s-]?\\(?\\d{2}\\)?[\\s-]?9?\\d{4}[\\s-]?\\d{4}${B_DIR}`, 'g'),
  // (11) 91234-5678 · (11) 1234-5678
  new RegExp(`(?<![\\w-])\\(\\d{2}\\)\\s?9?\\d{4}[\\s-]?\\d{4}${B_DIR}`, 'g'),
  // 11 91234-5678 · 91234-5678 · 1234-5678
  new RegExp(`${B_ESQ}(?:\\d{2}\\s)?9?\\d{4}-\\d{4}${B_DIR}`, 'g'),
  // 11912345678 (celular com DDD, sem máscara)
  new RegExp(`${B_ESQ}[1-9]\\d9\\d{8}${B_DIR}`, 'g'),
]

function cpfValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/** Troca e-mails, CPF, CNPJ (inclusive alfanumérico) e telefones de um texto. */
export function limparTexto(texto: string): string {
  let t = texto.replace(EMAIL, '[email]')
  t = t.replace(CNPJ_FORMATADO, '[cnpj]')
  t = t.replace(CNPJ_SOLTO, (m) => (cnpjValido(normalizarCnpj(m)) ? '[cnpj]' : m))
  t = t.replace(CPF_FORMATADO, '[cpf]')
  t = t.replace(CPF_SOLTO, (m) => (cpfValido(m) ? '[cpf]' : m))
  for (const telefone of TELEFONES) t = t.replace(telefone, '[telefone]')
  return t
}

type Json = unknown

/** Percorre qualquer estrutura: limpa os textos e remove o valor das chaves sensíveis. */
function limparValor(valor: Json, profundidade = 0): Json {
  if (typeof valor === 'string') return limparTexto(valor)
  if (valor === null || typeof valor !== 'object') return valor
  if (profundidade > 8) return REMOVIDO
  if (Array.isArray(valor)) return valor.map((v) => limparValor(v, profundidade + 1))
  const saida: Record<string, Json> = {}
  for (const [chave, v] of Object.entries(valor)) {
    saida[chave] = CHAVE_SENSIVEL.test(chave) ? REMOVIDO : limparValor(v, profundidade + 1)
  }
  return saida
}

/** URL sem query string nem fragmento (podem carregar tokens e dados). */
function semConsulta(url: string): string {
  return limparTexto(url.split(/[?#]/)[0] ?? '')
}

type Objeto = Record<string, Json>
const comoLista = (v: Json): Json[] | undefined => (Array.isArray(v) ? (v as Json[]) : undefined)
const ehObjeto = (v: Json): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)

function limparRequisicao(requisicao: Objeto): Objeto {
  const saida: Objeto = {}
  for (const [chave, v] of Object.entries(requisicao)) {
    if (chave === 'cookies' || chave === 'data' || chave === 'query_string') continue
    if (chave === 'url' && typeof v === 'string') saida[chave] = semConsulta(v)
    else if (chave === 'headers' && ehObjeto(v)) {
      saida[chave] = Object.fromEntries(
        Object.entries(v)
          .filter(([nome]) => CABECALHOS_PERMITIDOS.has(nome.toLowerCase()))
          .map(([nome, valor]) => [nome, limparValor(valor)]),
      )
    } else saida[chave] = limparValor(v)
  }
  return saida
}

function limparExcecoes(excecao: Objeto): Objeto {
  const valores = comoLista(excecao['values'])
  if (!valores) return excecao
  return {
    ...excecao,
    values: valores.map((item): Json => {
      if (!ehObjeto(item)) return item
      const limpo = limparValor({ ...item, stacktrace: undefined }) as Objeto
      const pilha = item['stacktrace']
      const frames = ehObjeto(pilha) ? comoLista(pilha['frames']) : undefined
      if (ehObjeto(pilha) && frames) {
        limpo['stacktrace'] = {
          ...pilha,
          // variáveis locais podem ter dados; os caminhos e números de linha ficam
          frames: frames.map((f): Json => {
            if (!ehObjeto(f)) return f
            const { vars: _vars, ...resto } = f
            return resto
          }),
        }
      }
      return limpo
    }),
  }
}

/** Breadcrumbs de console e de rede podem trazer dados: nem saem. Os demais são limpos. */
export function limparBreadcrumb<T extends { category?: string | undefined }>(
  breadcrumb: T,
): T | null {
  if (breadcrumb.category && /^(console|fetch|xhr|http)$/.test(breadcrumb.category)) return null
  return limparValor(breadcrumb) as T
}

/**
 * Limpa um evento de erro. Remove cookies, cabeçalhos (exceto uma lista curta), corpo e query
 * string da requisição, o usuário, variáveis locais de pilha, e troca e-mails, CPF, CNPJ e
 * telefones nos textos. Preserva `tags` (tenant_id, user_id, request_id) e o `release`.
 */
export function limparEvento<T extends object>(evento: T): T {
  const origem = evento as Objeto
  const saida: Objeto = {}
  for (const [chave, valor] of Object.entries(origem)) {
    switch (chave) {
      case 'user':
        continue
      case 'tags':
      case 'release':
      case 'environment':
      case 'event_id':
      case 'timestamp':
      case 'level':
      case 'platform':
      case 'sdk':
      case 'server_name':
      case 'fingerprint':
        saida[chave] = valor
        break
      case 'request':
        if (ehObjeto(valor)) saida[chave] = limparRequisicao(valor)
        break
      case 'exception':
        saida[chave] = ehObjeto(valor) ? limparExcecoes(valor) : valor
        break
      case 'breadcrumbs': {
        const lista = comoLista(valor) ?? (ehObjeto(valor) ? comoLista(valor['values']) : undefined)
        if (lista) {
          saida[chave] = lista
            .map((b) => (ehObjeto(b) ? limparBreadcrumb(b as { category?: string }) : null))
            .filter((b) => b !== null)
        }
        break
      }
      default:
        saida[chave] = limparValor(valor)
    }
  }
  return saida as T
}
