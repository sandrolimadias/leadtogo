import { afterEach, describe, expect, it, vi } from 'vitest'

import { servicosReais } from './servicos'

afterEach(() => vi.unstubAllGlobals())

function simular(resposta: { status: number; corpo: unknown }) {
  const chamadas: { url: string; corpo: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: Request | string | URL, init?: RequestInit) => {
      const req = new Request(
        entrada instanceof Request ? entrada : new URL(entrada, 'http://localhost'),
        init,
      )
      const url = req.url
      const texto = await req.text()
      chamadas.push({ url, corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} })
      return new Response(JSON.stringify(resposta.corpo), {
        status: resposta.status,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  return chamadas
}

describe('serviços reais (Better Auth e API)', () => {
  it('o login vai para /v1/auth/sign-in/email SEM callbackURL (com ele o cliente seguiria o redirect)', async () => {
    const chamadas = simular({ status: 200, corpo: { token: 't', user: { id: 'u' } } })
    const r = await servicosReais.entrar('ana@exemplo.com.br', 'segredo-forte-1')
    expect(r).toEqual({ ok: true, dados: { doisFatores: false } })
    expect(chamadas[0]?.url).toContain('/v1/auth/sign-in/email')
    expect(chamadas[0]?.corpo).toEqual({ email: 'ana@exemplo.com.br', password: 'segredo-forte-1' })
  })

  it('reconhece o desvio para o 2FA', async () => {
    simular({ status: 200, corpo: { twoFactorRedirect: true } })
    expect(await servicosReais.entrar('ana@exemplo.com.br', 'x')).toEqual({
      ok: true,
      dados: { doisFatores: true },
    })
  })

  it('traduz a senha errada e o limite de tentativas', async () => {
    simular({
      status: 401,
      corpo: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    })
    const errada = await servicosReais.entrar('a@b.com', 'x')
    expect(errada).toMatchObject({
      ok: false,
      erro: { codigo: 'INVALID_EMAIL_OR_PASSWORD', mensagem: 'E-mail ou senha não conferem.' },
    })
    simular({ status: 429, corpo: { message: 'Too many requests. Please try again later.' } })
    const limite = await servicosReais.entrar('a@b.com', 'x')
    expect(limite).toMatchObject({ ok: false, erro: { codigo: 'limite_de_tentativas' } })
  })

  it('queda de rede vira erro de acesso, não exceção', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    expect(await servicosReais.entrar('a@b.com', 'x')).toMatchObject({
      ok: false,
      erro: { codigo: 'sem_rede' },
    })
  })

  it('o pedido de nova senha leva o redirectTo para /redefinir-senha', async () => {
    const chamadas = simular({ status: 200, corpo: { status: true } })
    await servicosReais.pedirNovaSenha('ana@exemplo.com.br')
    expect(chamadas[0]?.url).toContain('/v1/auth/request-password-reset')
    expect(String(chamadas[0]?.corpo['redirectTo'])).toMatch(/\/redefinir-senha$/)
  })

  it('desativar o 2FA manda a senha E o código; gerar códigos manda a senha', async () => {
    const chamadas = simular({ status: 200, corpo: { status: true, backupCodes: ['a-1', 'b-2'] } })
    expect(await servicosReais.desativarDoisFatores('senha-1', '123456')).toEqual({
      ok: true,
      dados: undefined,
    })
    expect(chamadas[0]?.url).toContain('/v1/auth/two-factor/disable')
    expect(chamadas[0]?.corpo).toEqual({ password: 'senha-1', code: '123456' })
    expect(await servicosReais.gerarNovosCodigos('senha-1')).toEqual({
      ok: true,
      dados: ['a-1', 'b-2'],
    })
    expect(chamadas[1]?.url).toContain('/v1/auth/two-factor/generate-backup-codes')
  })

  it('a recusa por regra obrigatória vira mensagem em pt-BR', async () => {
    simular({ status: 403, corpo: { code: 'DOIS_FATORES_OBRIGATORIO', message: 'x' } })
    expect(await servicosReais.desativarDoisFatores('s', '123456')).toMatchObject({
      ok: false,
      erro: {
        codigo: 'DOIS_FATORES_OBRIGATORIO',
        mensagem: expect.stringContaining('obrigatória') as string,
      },
    })
  })
})
