import { request } from 'node:http'

export type Papel = 'api' | 'worker'
export type Resposta = 'ok' | 'falhou' | 'recusada'

/** GET http://127.0.0.1:<porta>/health. `recusada` = ninguém escutando nessa porta (o outro papel). */
export function consultar(porta: number, tempoMs = 3000): Promise<Resposta> {
  return new Promise((resolver) => {
    const pedido = request(
      { host: '127.0.0.1', port: porta, path: '/health', timeout: tempoMs },
      (resposta) => {
        resposta.resume()
        resolver(resposta.statusCode === 200 ? 'ok' : 'falhou')
      },
    )
    pedido.on('timeout', () => {
      pedido.destroy()
      resolver('falhou')
    })
    pedido.on('error', (erro: NodeJS.ErrnoException) =>
      resolver(erro.code === 'ECONNREFUSED' ? 'recusada' : 'falhou'),
    )
    pedido.end()
  })
}

/**
 * Saúde do container, para o HEALTHCHECK da imagem (a mesma imagem roda a API e o worker):
 *  - `PAPEL=api` ou `PAPEL=worker` força o papel;
 *  - sem `PAPEL`, tenta a API (`PORT`, padrão 3000); se a porta recusar a conexão, é o worker
 *    (`WORKER_SAUDE_PORTA`, padrão 3001). Uma API que responde 503 é NÃO saudável (não cai no worker).
 */
export async function verificarSaude(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const portaApi = Number(env['PORT'] ?? 3000)
  const portaWorker = Number(env['WORKER_SAUDE_PORTA'] ?? 3001)
  const papel = env['PAPEL']
  if (papel === 'worker') return (await consultar(portaWorker)) === 'ok'
  if (papel === 'api') return (await consultar(portaApi)) === 'ok'
  const api = await consultar(portaApi)
  if (api !== 'recusada') return api === 'ok'
  return (await consultar(portaWorker)) === 'ok'
}
