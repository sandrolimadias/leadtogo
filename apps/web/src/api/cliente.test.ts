import { afterEach, describe, expect, it, vi } from 'vitest'

import { comVigia, registrarAoPerderAEmpresa } from './cliente'

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
const chamar = (r: Response) => comVigia(vi.fn(async () => r))('/v1/membros')

afterEach(() => registrarAoPerderAEmpresa(null))

describe('vigia do acesso à empresa ativa', () => {
  it('403 empresa_ativa_invalida avisa a casca, e a resposta segue intacta para quem chamou', async () => {
    const aviso = vi.fn()
    registrarAoPerderAEmpresa(aviso)
    const r = await chamar(
      resposta(403, { erro: 'empresa_ativa_invalida', mensagem: 'Você não tem acesso.' }),
    )
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ erro: 'empresa_ativa_invalida' })
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('outros 403 e outros status não disparam o aviso', async () => {
    const aviso = vi.fn()
    registrarAoPerderAEmpresa(aviso)
    await chamar(resposta(403, { erro: 'acesso_negado', mensagem: 'Só administradores.' }))
    await chamar(resposta(401, { erro: 'nao_autenticado', mensagem: 'Entre.' }))
    await chamar(resposta(200, []))
    expect(aviso).not.toHaveBeenCalled()
  })

  it('403 sem corpo JSON não quebra a chamada', async () => {
    registrarAoPerderAEmpresa(vi.fn())
    const r = await chamar(new Response('proibido', { status: 403 }))
    expect(r.status).toBe(403)
  })
})
