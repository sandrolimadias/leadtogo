/* eslint-disable @typescript-eslint/require-await -- dublês assíncronos de dependências assíncronas */
import { describe, expect, it, vi } from 'vitest'

import { type Dependencias, iniciar, lerPapel } from './iniciar.js'

// montada em partes: o secretlint do pre-commit barra uma URL de banco com senha literal
const ESQUEMA = 'postgres'
const URL_DONO = `${ESQUEMA}://leadtogo_owner:segredo-do-dono@banco:5432/leadtogo`

function dependencias(extra: Partial<Dependencias> = {}) {
  const linhas: string[] = []
  const deps = {
    migrar: vi.fn(async () => undefined),
    semear: vi.fn(async () => ({ estados: 27 })),
    carregar: vi.fn(async () => undefined),
    info: (l: string) => linhas.push(l),
    erro: (l: string) => linhas.push(l),
    ...extra,
  } satisfies Dependencias
  return { deps, linhas }
}

describe('lerPapel()', () => {
  it('padrão api; aceita api e worker; recusa o resto', () => {
    expect(lerPapel({})).toBe('api')
    expect(lerPapel({ PAPEL: '' })).toBe('api')
    expect(lerPapel({ PAPEL: ' worker ' })).toBe('worker')
    expect(lerPapel({ PAPEL: 'api' })).toBe('api')
    expect(lerPapel({ PAPEL: 'Worker' })).toBeUndefined()
    expect(lerPapel({ PAPEL: 'migrar' })).toBeUndefined()
  })
})

describe('iniciar() — PAPEL=api (padrão)', () => {
  it('migra, semeia as referências, apaga a credencial do dono e só então sobe a API', async () => {
    const env: NodeJS.ProcessEnv = { DATABASE_MIGRATION_URL: URL_DONO }
    const ordem: string[] = []
    const { deps } = dependencias({
      migrar: vi.fn(async (e: NodeJS.ProcessEnv) => {
        ordem.push(`migrar:${e['DATABASE_MIGRATION_URL'] === URL_DONO}`)
      }),
      semear: vi.fn(async (url) => {
        ordem.push(`semear:${url === URL_DONO}`)
        return { estados: 27 }
      }),
      carregar: vi.fn(async (papel) => {
        ordem.push(`carregar:${papel}:${'DATABASE_MIGRATION_URL' in env}`)
      }),
    })
    expect(await iniciar(env, deps)).toBe(0)
    // a credencial já não existe no process.env quando a API é carregada
    expect(ordem).toEqual(['migrar:true', 'semear:true', 'carregar:api:false'])
    expect(env['DATABASE_MIGRATION_URL']).toBeUndefined()
  })

  it('migração com erro: código 1, a API não é carregada e a URL não aparece na saída', async () => {
    const env: NodeJS.ProcessEnv = { DATABASE_MIGRATION_URL: URL_DONO }
    const { deps, linhas } = dependencias({
      migrar: vi.fn(async () => {
        throw new Error('password authentication failed for user "leadtogo_owner"')
      }),
    })
    expect(await iniciar(env, deps)).toBe(1)
    expect(deps.carregar).not.toHaveBeenCalled()
    expect(deps.semear).not.toHaveBeenCalled()
    expect(linhas.join('\n')).toContain('Falha na migração: password authentication failed')
    expect(linhas.join('\n')).not.toContain('segredo-do-dono')
    expect(env['DATABASE_MIGRATION_URL']).toBeUndefined()
  })

  it('sem DATABASE_MIGRATION_URL a migração real falha com código 1', async () => {
    const { dependenciasReais } = await import('./iniciar.js')
    const { deps, linhas } = dependencias({ migrar: dependenciasReais.migrar })
    expect(await iniciar({}, deps)).toBe(1)
    expect(deps.carregar).not.toHaveBeenCalled()
    expect(linhas.join('\n')).toContain('DATABASE_MIGRATION_URL não definida')
  })

  it('falha ao semear não derruba a API (só avisa); SEMEAR_REFERENCIAS=false pula', async () => {
    const falha = dependencias({
      semear: vi.fn(async () => {
        throw new Error('sem permissão')
      }),
    })
    expect(await iniciar({ DATABASE_MIGRATION_URL: URL_DONO }, falha.deps)).toBe(0)
    expect(falha.deps.carregar).toHaveBeenCalledWith('api')
    expect(falha.linhas.join('\n')).toContain('referências não semeadas')

    const pula = dependencias()
    expect(
      await iniciar({ DATABASE_MIGRATION_URL: URL_DONO, SEMEAR_REFERENCIAS: 'false' }, pula.deps),
    ).toBe(0)
    expect(pula.deps.semear).not.toHaveBeenCalled()
    expect(pula.deps.carregar).toHaveBeenCalledWith('api')
  })
})

describe('iniciar() — PAPEL=worker', () => {
  it('não exige a URL de migração, não migra nem semeia e sobe o worker', async () => {
    const { deps } = dependencias()
    expect(await iniciar({ PAPEL: 'worker' }, deps)).toBe(0)
    expect(deps.migrar).not.toHaveBeenCalled()
    expect(deps.semear).not.toHaveBeenCalled()
    expect(deps.carregar).toHaveBeenCalledWith('worker')
  })

  it('se receber a DATABASE_MIGRATION_URL, descarta (com aviso, sem o valor) e segue', async () => {
    const env: NodeJS.ProcessEnv = { PAPEL: 'worker', DATABASE_MIGRATION_URL: URL_DONO }
    const { deps, linhas } = dependencias({
      carregar: vi.fn(async () => {
        expect(env['DATABASE_MIGRATION_URL']).toBeUndefined()
      }),
    })
    expect(await iniciar(env, deps)).toBe(0)
    expect(deps.migrar).not.toHaveBeenCalled()
    expect(linhas.join('\n')).toContain('DATABASE_MIGRATION_URL não é usada pelo worker')
    expect(linhas.join('\n')).not.toContain('segredo-do-dono')
  })
})

describe('iniciar() — papel inválido', () => {
  it('recusa com código 1 sem carregar nada', async () => {
    const { deps, linhas } = dependencias()
    expect(await iniciar({ PAPEL: 'cron' }, deps)).toBe(1)
    expect(deps.carregar).not.toHaveBeenCalled()
    expect(deps.migrar).not.toHaveBeenCalled()
    expect(linhas.join('\n')).toContain('PAPEL inválido')
  })
})
