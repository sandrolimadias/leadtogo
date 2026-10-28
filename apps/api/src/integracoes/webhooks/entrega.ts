import { createHmac, randomBytes } from 'node:crypto'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'

/** Segredo novo do webhook (`whsec_` + 256 bits em base64url): mostrado uma vez, guardado cifrado. */
export const gerarSegredo = (): string => `whsec_${randomBytes(32).toString('base64url')}`

/**
 * Cabeçalho `X-Leadtogo-Assinatura: t=<unix>,v1=<hex>[,v1=<hex>]`: HMAC-SHA256 de `"<t>.<corpo bruto>"` com cada
 * segredo válido (na rotação, o antigo e o novo, por 24 h). O destino confere uma delas e recusa `t` velho.
 */
export function assinar(corpo: string, segredos: string[], agora = Date.now()): string {
  const t = Math.floor(agora / 1000)
  const assinaturas = segredos.map(
    (s) => `v1=${createHmac('sha256', s).update(`${t}.${corpo}`, 'utf8').digest('hex')}`,
  )
  return [`t=${t}`, ...assinaturas].join(',')
}

/** Faixas que um webhook nunca alcança (salvo host liberado em WEBHOOK_HOSTS_INTERNOS). */
const BLOQUEADAS = new BlockList()
for (const [rede, prefixo] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  BLOQUEADAS.addSubnet(rede, prefixo, 'ipv4')
for (const [rede, prefixo] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  BLOQUEADAS.addSubnet(rede, prefixo, 'ipv6')

export function enderecoProibido(ip: string): boolean {
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapeado?.[1]) return enderecoProibido(mapeado[1])
  const familia = isIP(ip)
  if (familia === 0) return true
  return BLOQUEADAS.check(ip, familia === 4 ? 'ipv4' : 'ipv6')
}

export interface PoliticaDeDestino {
  /** Em produção só `https` (fora dos hosts internos) */
  exigirHttps: boolean
  /** `host` ou `host:porta` liberados para a rede interna (ex.: `n8n:5678`) */
  hostsInternos: string[]
}

const interno = (u: URL, politica: PoliticaDeDestino): boolean => {
  const porta = u.port || (u.protocol === 'https:' ? '443' : '80')
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return politica.hostsInternos.some((h) => {
    const [nome, p] = h.toLowerCase().split(/:(?=\d+$)/)
    return nome === host && (p === undefined || p === porta)
  })
}

/** Confere a URL antes de chamar: protocolo, credenciais na URL e IP literal proibido. */
export function conferirUrl(url: string, politica: PoliticaDeDestino): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'endereço inválido'
  }
  if (u.username || u.password) return 'usuário e senha na URL não são aceitos'
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'só http ou https'
  const liberado = interno(u, politica)
  if (u.protocol === 'http:' && politica.exigirHttps && !liberado) return 'em produção, só https'
  const literal = u.hostname.replace(/^\[|\]$/g, '')
  if (!liberado && isIP(literal) !== 0 && enderecoProibido(literal))
    return 'endereço de rede interna'
  return null
}

export interface ResultadoDaEntrega {
  ok: boolean
  statusHttp: number | null
  duracaoMs: number
  /** Até 2 KB da resposta */
  resposta: string | null
  erro: string | null
}

export const LIMITE_DA_RESPOSTA = 2048

/**
 * POST do evento: timeout de 10 s, SEM seguir redirecionamento, lendo no máximo 2 KB da resposta. O DNS é
 * conferido na hora da conexão (o `lookup` recusa endereço interno), o que fecha a porta do DNS rebinding.
 */
export function entregar(
  url: string,
  corpo: string,
  cabecalhos: Record<string, string>,
  politica: PoliticaDeDestino,
  timeoutMs = 10_000,
): Promise<ResultadoDaEntrega> {
  const inicio = Date.now()
  const falha = (erro: string): ResultadoDaEntrega => ({
    ok: false,
    statusHttp: null,
    duracaoMs: Date.now() - inicio,
    resposta: null,
    erro,
  })
  const motivo = conferirUrl(url, politica)
  if (motivo) return Promise.resolve(falha(`destino recusado: ${motivo}`))
  const u = new URL(url)
  const liberado = interno(u, politica)
  const lookup = (
    hostname: string,
    opcoes: object,
    cb: (
      erro: NodeJS.ErrnoException | null,
      endereco: string | LookupAddress[],
      familia?: number,
    ) => void,
  ) => {
    dnsLookup(hostname, { all: true }, (erro, enderecos) => {
      if (erro) return cb(erro, [])
      const lista = enderecos
      if (!liberado && lista.some((a) => enderecoProibido(a.address))) {
        const negado: NodeJS.ErrnoException = new Error('endereço de rede interna')
        negado.code = 'EDESTINO'
        return cb(negado, [])
      }
      if ((opcoes as { all?: boolean }).all) return cb(null, lista)
      const primeiro = lista[0]
      if (!primeiro) return cb(new Error('sem endereço'), [])
      cb(null, primeiro.address, primeiro.family)
    })
  }

  return new Promise((resolver) => {
    const cliente = u.protocol === 'https:' ? https : http
    const req = cliente.request(
      u,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(corpo).toString(),
          'User-Agent': 'Leadtogo-Webhooks/1',
          ...cabecalhos,
        },
        lookup,
        timeout: timeoutMs,
      },
      (res) => {
        const partes: Buffer[] = []
        let tamanho = 0
        res.on('data', (parte: Buffer) => {
          if (tamanho < LIMITE_DA_RESPOSTA) partes.push(parte)
          tamanho += parte.length
          if (tamanho > 64 * 1024) res.destroy()
        })
        const fim = () => {
          const status = res.statusCode ?? 0
          resolver({
            ok: status >= 200 && status < 300,
            statusHttp: status,
            duracaoMs: Date.now() - inicio,
            resposta: Buffer.concat(partes).toString('utf8').slice(0, LIMITE_DA_RESPOSTA) || null,
            erro: status >= 300 && status < 400 ? 'redirecionamento não é seguido' : null,
          })
        }
        res.on('end', fim)
        res.on('close', fim)
        res.on('error', fim)
      },
    )
    req.on('timeout', () => req.destroy(new Error('tempo esgotado (10 s)')))
    req.on('error', (erro: NodeJS.ErrnoException) =>
      resolver(
        falha(
          erro.code === 'EDESTINO' ? 'destino recusado: endereço de rede interna' : erro.message,
        ),
      ),
    )
    req.end(corpo)
  })
}
