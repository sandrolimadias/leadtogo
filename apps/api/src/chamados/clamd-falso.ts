import { createServer, type Server, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'

/**
 * Arquivo de teste do EICAR (https://www.eicar.org/): inofensivo, mas todo antivírus o reconhece. Montado em
 * pedaços para o próprio repositório (e o antivírus de quem o clona) não o tratar como ameaça.
 */
export const eicar = (): Buffer =>
  Buffer.from(
    ['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!', '$H+H*'].join(''),
  )

export interface ClamdFalso {
  porta: number
  /** O que cada conexão mandou, na ordem (comando e bytes já sem o enquadramento) */
  recebidos: { comando: string; bytes: Buffer }[]
  parar: () => Promise<void>
}

/**
 * Um clamd de mentira: fala o INSTREAM de verdade (comando, blocos com tamanho e bloco final de tamanho zero) e
 * responde com `responder(bytes)`: `OK`, `<assinatura> FOUND` ou `ERROR`. `responder` nulo = nunca responde.
 */
export async function subirClamdFalso(
  responder: (bytes: Buffer) => string | null = (b) =>
    b.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? 'Eicar-Test-Signature FOUND' : 'OK',
): Promise<ClamdFalso> {
  const recebidos: ClamdFalso['recebidos'] = []
  const servidor: Server = createServer((socket: Socket) => {
    let memoria = Buffer.alloc(0)
    let comando: string | null = null
    const blocos: Buffer[] = []
    socket.on('data', (d) => {
      memoria = Buffer.concat([memoria, d])
      if (comando === null) {
        const fim = memoria.indexOf(0)
        if (fim < 0) return
        comando = memoria.subarray(0, fim).toString()
        memoria = memoria.subarray(fim + 1)
      }
      for (;;) {
        if (memoria.length < 4) return
        const tamanho = memoria.readUInt32BE(0)
        if (tamanho === 0) {
          const bytes = Buffer.concat(blocos)
          recebidos.push({ comando, bytes })
          const resposta = responder(bytes)
          if (resposta !== null) socket.end(`stream: ${resposta}\0`)
          return
        }
        if (memoria.length < 4 + tamanho) return
        blocos.push(memoria.subarray(4, 4 + tamanho))
        memoria = memoria.subarray(4 + tamanho)
      }
    })
    socket.on('error', () => undefined)
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  return {
    porta: (servidor.address() as AddressInfo).port,
    recebidos,
    parar: () => new Promise((ok) => servidor.close(() => ok())),
  }
}
