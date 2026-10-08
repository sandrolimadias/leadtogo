/* eslint-disable @typescript-eslint/require-await -- dublês assíncronos de dependências assíncronas */
import { zerarSchema } from '@leadtogo/db/testes'
import postgres from 'postgres'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { dependenciasReais, iniciar } from './iniciar.js'

// PAPEL=api de verdade contra o banco de teste: migração, referências e falha de credencial.
// Só o carregamento do processo (main.js, que abriria uma porta) é trocado por um espião.
const urlOwner = process.env['TEST_API_DATABASE_MIGRATION_URL'] ?? ''
const owner = postgres(urlOwner, { max: 1, onnotice: () => {} })

afterAll(async () => {
  await owner.end()
  // deixa o banco migrado e sem referências para os demais testes
  await dependenciasReais.migrar({ DATABASE_MIGRATION_URL: urlOwner })
  const limpo = postgres(urlOwner, { max: 1, onnotice: () => {} })
  await limpo`TRUNCATE cnaes, municipios, estados, paises, portes, qualificacoes_socio CASCADE`
  await limpo.end()
})

const contar = async (tabela: string) =>
  (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM ${owner(tabela)}`)[0]?.n

describe('iniciar() contra o banco de teste', () => {
  it('banco vazio: migra, semeia as referências e carrega a API; repetir não muda nada', async () => {
    await zerarSchema(urlOwner)
    const carregar = vi.fn(async () => undefined)
    const deps = { ...dependenciasReais, carregar, info: () => undefined, erro: () => undefined }

    expect(await iniciar({ DATABASE_MIGRATION_URL: urlOwner }, deps)).toBe(0)
    expect(carregar).toHaveBeenCalledWith('api')
    expect(await contar('cnaes')).toBe(1332)
    expect(await contar('municipios')).toBe(5571)

    expect(await iniciar({ DATABASE_MIGRATION_URL: urlOwner }, deps)).toBe(0)
    expect(await contar('cnaes')).toBe(1332)
  })

  it('credencial errada: código 1, a API não é carregada e a senha não vai para a saída', async () => {
    const errada = new URL(urlOwner)
    errada.password = 'senha-errada-xyz'
    const saida: string[] = []
    const carregar = vi.fn(async () => undefined)
    const codigo = await iniciar(
      { DATABASE_MIGRATION_URL: errada.toString() },
      { ...dependenciasReais, carregar, info: (l) => saida.push(l), erro: (l) => saida.push(l) },
    )
    expect(codigo).toBe(1)
    expect(carregar).not.toHaveBeenCalled()
    expect(saida.join('\n')).toContain('Falha na migração')
    expect(saida.join('\n')).not.toContain('senha-errada-xyz')
  })

  it('o leadtogo_app não consegue migrar nem semear (só o dono das tabelas)', async () => {
    const carregar = vi.fn(async () => undefined)
    const codigo = await iniciar(
      { DATABASE_MIGRATION_URL: process.env['TEST_API_DATABASE_URL'] ?? '' },
      { ...dependenciasReais, carregar, info: () => undefined, erro: () => undefined },
    )
    expect(codigo).toBe(1)
    expect(carregar).not.toHaveBeenCalled()
  })
})
