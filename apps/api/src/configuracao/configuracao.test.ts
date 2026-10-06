import { describe, expect, it } from 'vitest'

import { carregarConfiguracao, ErroConfiguracao } from './configuracao.js'

const valida = {
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://leadtogo_app:senha@localhost:5432/leadtogo',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:3900',
  S3_BUCKET: 'leadtogo-arquivos',
  S3_ACCESS_KEY: 'chave-de-acesso',
  S3_SECRET_KEY: 'segredo-super-secreto',
}

function falha(env: NodeJS.ProcessEnv): ErroConfiguracao {
  try {
    carregarConfiguracao(env)
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return erro
    throw erro
  }
  throw new Error('deveria ter falhado')
}

describe('configuração validada por Zod', () => {
  it('aceita o ambiente mínimo e aplica os padrões', () => {
    const c = carregarConfiguracao(valida)
    expect(c).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_VERSION: 'dev',
      LOG_LEVEL: 'info',
      S3_REGION: 'garage',
      S3_FORCE_PATH_STYLE: true,
    })
    expect(c.DATABASE_MIGRATION_URL).toBeUndefined()
  })

  it('converte número e booleano de texto', () => {
    const c = carregarConfiguracao({ ...valida, PORT: '8080', S3_FORCE_PATH_STYLE: 'false' })
    expect(c.PORT).toBe(8080)
    expect(c.S3_FORCE_PATH_STYLE).toBe(false)
  })

  it('falha listando TODAS as variáveis que faltam', () => {
    const erro = falha({})
    const nomes = erro.problemas.map((p) => p.variavel)
    expect(nomes).toEqual(
      expect.arrayContaining([
        'APP_URL',
        'API_URL',
        'DATABASE_URL',
        'REDIS_URL',
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
      ]),
    )
    expect(erro.problemas.every((p) => p.motivo === 'obrigatória')).toBe(true)
    expect(erro.message).toContain('DATABASE_URL: obrigatória')
  })

  it('rejeita URL no protocolo errado e porta inválida', () => {
    const erro = falha({ ...valida, DATABASE_URL: 'http://x', REDIS_URL: 'texto', PORT: '99999' })
    expect(erro.problemas.map((p) => p.variavel).sort()).toEqual([
      'DATABASE_URL',
      'PORT',
      'REDIS_URL',
    ])
  })

  it('em produção exige https no front e na API', () => {
    const erro = falha({ ...valida, NODE_ENV: 'production' })
    expect(erro.problemas.map((p) => p.variavel).sort()).toEqual(['API_URL', 'APP_URL'])
    expect(
      carregarConfiguracao({
        ...valida,
        NODE_ENV: 'production',
        APP_URL: 'https://crm.aledias.com.br',
        API_URL: 'https://api.crm.aledias.com.br',
      }).NODE_ENV,
    ).toBe('production')
  })

  it('a mensagem de erro nunca mostra valores (podem ser segredos)', () => {
    const erro = falha({
      ...valida,
      S3_SECRET_KEY: '',
      DATABASE_URL: ['postgres://u', ':senhasecreta@'].join(''),
    })
    expect(erro.message).not.toContain('senhasecreta')
    expect(erro.message).not.toContain('segredo-super-secreto')
  })
})
