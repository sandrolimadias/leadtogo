import { describe, expect, it } from 'vitest'

import { completarCnpj } from './cnpj.js'
import { limparBreadcrumb, limparEvento, limparTexto } from './limpeza-erros.js'

describe('limparTexto', () => {
  it('troca e-mails', () => {
    expect(limparTexto('falha ao enviar para ana.souza+x@empresa.com.br agora')).toBe(
      'falha ao enviar para [email] agora',
    )
  })

  it('troca CPF formatado e solto (só se válido) e CNPJ numérico e alfanumérico', () => {
    expect(limparTexto('cpf 529.982.247-25')).toBe('cpf [cpf]')
    expect(limparTexto('cpf 52998224725')).toBe('cpf [cpf]')
    expect(limparTexto('número 12345678901 qualquer')).toBe('número 12345678901 qualquer')
    expect(limparTexto('cnpj 11.222.333/0001-81')).toBe('cnpj [cnpj]')
    const alfa = completarCnpj('12ABC34501DE')
    expect(limparTexto(`cnpj ${alfa}`)).toBe('cnpj [cnpj]')
    expect(limparTexto('cnpj 12.ABC.345/01DE-35')).toBe('cnpj [cnpj]')
    expect(limparTexto('ABCDEFGHIJKLMN não é cnpj')).toBe('ABCDEFGHIJKLMN não é cnpj')
  })

  it('troca telefones brasileiros em formatos comuns', () => {
    for (const t of [
      '+55 (11) 91234-5678',
      '(11) 91234-5678',
      '(11)1234-5678',
      '11 91234-5678',
      '5511912345678',
      '11912345678',
      '91234-5678',
    ]) {
      expect(limparTexto(`ligar ${t} hoje`), t).toBe('ligar [telefone] hoje')
    }
  })

  it('preserva uuids, ids, hashes, versões e timestamps', () => {
    const textos = [
      '0192a3b4-1234-5678-9abc-def012345678',
      'tenant 0192a3b4-5678-7abc-8def-123456781234 falhou',
      'abc1234def5678abc1234def5678abc1234def56',
      'versão 1.2.3 em 1699999999999',
      'GET /v1/empresas/0192a3b4-1234-5678-9abc-def012345678',
    ]
    for (const t of textos) expect(limparTexto(t)).toBe(t)
  })
})

describe('limparEvento', () => {
  const evento = {
    event_id: 'e1',
    release: 'abc123',
    environment: 'production',
    tags: { papel: 'api', tenant_id: 'ten-1', user_id: 'usr-1', request_id: 'req-1' },
    user: { id: 'usr-1', email: 'ana@empresa.com.br', ip_address: '1.2.3.4' },
    request: {
      url: 'https://crm.aledias.com.br/convite?token=segredo123&email=ana@x.com',
      method: 'POST',
      cookies: { sessao: 'abc' },
      data: { senha: 'x', cpf: '529.982.247-25' },
      query_string: 'token=segredo123',
      headers: {
        Authorization: 'Bearer xyz',
        Cookie: 'sessao=abc',
        'X-Alertas-Token': 'tok',
        'User-Agent': 'Mozilla',
        'X-Request-Id': 'req-1',
      },
    },
    message: 'erro com ana@empresa.com.br',
    exception: {
      values: [
        {
          type: 'Error',
          value: 'cliente 11.222.333/0001-81 fone (11) 91234-5678',
          stacktrace: { frames: [{ filename: 'a.js', lineno: 3, vars: { senha: '123' } }] },
        },
      ],
    },
    extra: { token: 'abc', info: 'contato bia@x.com', aninhado: { api_key: 'k', ok: 1 } },
    breadcrumbs: [
      { category: 'console', message: 'log com dados' },
      { category: 'ui.click', message: 'clicou em ana@x.com' },
    ],
  }

  it('remove cookies, Authorization, corpo, query string e usuário', () => {
    const saida = limparEvento(evento) as typeof evento & { user?: unknown }
    const texto = JSON.stringify(saida)
    expect(saida.user).toBeUndefined()
    expect(saida.request).not.toHaveProperty('cookies')
    expect(saida.request).not.toHaveProperty('data')
    expect(saida.request).not.toHaveProperty('query_string')
    expect(saida.request.url).toBe('https://crm.aledias.com.br/convite')
    expect(Object.keys(saida.request.headers).sort()).toEqual(['User-Agent', 'X-Request-Id'])
    for (const proibido of [
      'segredo123',
      'Bearer',
      'sessao',
      'ana@',
      'bia@',
      '529.982',
      '11.222.333',
      '91234',
      '"vars"',
    ]) {
      expect(texto, proibido).not.toContain(proibido)
    }
  })

  it('preserva tags, release, ambiente e a pilha', () => {
    const saida = limparEvento(evento)
    expect(saida.tags).toEqual(evento.tags)
    expect(saida.release).toBe('abc123')
    expect(saida.environment).toBe('production')
    expect(saida.exception.values[0]?.stacktrace.frames[0]).toEqual({ filename: 'a.js', lineno: 3 })
    expect(saida.extra.aninhado).toEqual({ api_key: '[removido]', ok: 1 })
    expect(saida.extra.token).toBe('[removido]')
  })

  it('descarta breadcrumbs de console/rede e limpa os demais', () => {
    const saida = limparEvento(evento)
    expect(saida.breadcrumbs).toEqual([{ category: 'ui.click', message: 'clicou em [email]' }])
    expect(limparBreadcrumb({ category: 'fetch' })).toBeNull()
  })

  it('não altera o evento original', () => {
    const copia = structuredClone(evento)
    limparEvento(evento)
    expect(evento).toEqual(copia)
  })
})
