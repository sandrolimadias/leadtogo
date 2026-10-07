import { createServer, type Server } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

import { verificarSaude } from './verificar.js'

const servidores: Server[] = []
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise((r) => s.close(r))))
})

async function servir(status: number): Promise<number> {
  const s = createServer((_req, res) => res.writeHead(status).end('{}'))
  servidores.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return (s.address() as { port: number }).port
}
/** Uma porta que ninguém escuta. */
async function portaLivre(): Promise<number> {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const porta = (s.address() as { port: number }).port
  await new Promise((r) => s.close(r))
  return porta
}
const env = (api: number, worker: number, extra: Record<string, string> = {}) =>
  ({ PORT: String(api), WORKER_SAUDE_PORTA: String(worker), ...extra }) as NodeJS.ProcessEnv

describe('saúde do container (mesma imagem para API e worker)', () => {
  it('container da API saudável: 200 na porta da API', async () => {
    expect(await verificarSaude(env(await servir(200), await portaLivre()))).toBe(true)
  })

  it('container do worker saudável: a porta da API recusa e a do worker responde 200', async () => {
    expect(await verificarSaude(env(await portaLivre(), await servir(200)))).toBe(true)
  })

  it('API respondendo 503 NÃO é saudável, mesmo que a porta do worker responda', async () => {
    expect(await verificarSaude(env(await servir(503), await servir(200)))).toBe(false)
  })

  it('worker respondendo 503 não é saudável', async () => {
    expect(await verificarSaude(env(await portaLivre(), await servir(503)))).toBe(false)
  })

  it('nada escutando: não saudável', async () => {
    expect(await verificarSaude(env(await portaLivre(), await portaLivre()))).toBe(false)
  })

  it('PAPEL força o papel: worker ignora uma API saudável e api ignora o worker', async () => {
    const api = await servir(200)
    const worker = await portaLivre()
    expect(await verificarSaude(env(api, worker, { PAPEL: 'worker' }))).toBe(false)
    expect(await verificarSaude(env(api, worker, { PAPEL: 'api' }))).toBe(true)
    const w2 = await servir(200)
    expect(await verificarSaude(env(await portaLivre(), w2, { PAPEL: 'api' }))).toBe(false)
    expect(await verificarSaude(env(await portaLivre(), w2, { PAPEL: 'worker' }))).toBe(true)
  })
})
