import { Socket } from 'node:net'
import type { Readable } from 'node:stream'

/** Resultado de uma varredura: arquivo limpo ou a assinatura que o ClamAV encontrou. */
export type ResultadoDaVarredura = { limpo: true } | { limpo: false; assinatura: string }

/** O clamd não respondeu, recusou o arquivo ou deu erro: a varredura NÃO aconteceu (nunca vira "limpo"). */
export class VarreduraIndisponivel extends Error {}

export interface OpcoesDoClamd {
  host: string
  porta: number
  /** Prazo total da varredura (envio e resposta), em milissegundos */
  tempoLimiteMs: number
}

/**
 * Varre um fluxo de bytes no clamd pelo comando INSTREAM (https://docs.clamav.net/manual/Usage/Scanning.html):
 * `zINSTREAM\0`, depois blocos "tamanho de 4 bytes (big-endian) + dados" e, por fim, um bloco de tamanho zero.
 * A resposta termina em NUL: `stream: OK`, `stream: <assinatura> FOUND` ou `... ERROR`.
 */
export function varrerComClamd(
  conteudo: Readable,
  opcoes: OpcoesDoClamd,
): Promise<ResultadoDaVarredura> {
  return new Promise((resolver, rejeitar) => {
    const socket = new Socket()
    let resposta = ''
    let terminou = false
    const terminar = (fn: () => void) => {
      if (terminou) return
      terminou = true
      clearTimeout(relogio)
      socket.destroy()
      conteudo.destroy()
      fn()
    }
    const relogio = setTimeout(
      () => terminar(() => rejeitar(new VarreduraIndisponivel('tempo esgotado na varredura'))),
      opcoes.tempoLimiteMs,
    )
    socket.on('error', (e) =>
      terminar(() => rejeitar(new VarreduraIndisponivel(`clamd: ${e.message}`))),
    )
    socket.on('data', (d) => {
      resposta += d.toString('utf8')
    })
    socket.on('close', () => {
      terminar(() => {
        const linha = resposta.replace(/\0/g, '').trim()
        const achada = /^stream:\s*(.+)\s+FOUND$/.exec(linha)
        if (achada?.[1]) resolver({ limpo: false, assinatura: achada[1] })
        else if (/^stream:\s*OK$/.test(linha)) resolver({ limpo: true })
        else
          rejeitar(new VarreduraIndisponivel(`resposta inesperada do clamd: ${linha || '(vazia)'}`))
      })
    })
    socket.connect(opcoes.porta, opcoes.host, () => {
      socket.write('zINSTREAM\0')
      conteudo.on('data', (bloco: Buffer) => {
        const tamanho = Buffer.alloc(4)
        tamanho.writeUInt32BE(bloco.length)
        socket.write(tamanho)
        if (!socket.write(bloco)) {
          conteudo.pause()
          socket.once('drain', () => conteudo.resume())
        }
      })
      conteudo.on('end', () => socket.write(Buffer.alloc(4)))
      conteudo.on('error', (e) =>
        terminar(() => rejeitar(new VarreduraIndisponivel(`leitura do arquivo: ${e.message}`))),
      )
    })
  })
}
