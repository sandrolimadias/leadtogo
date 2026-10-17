/* eslint-disable @typescript-eslint/require-await -- dublês assíncronos de dependências assíncronas */
import { zerarSchema } from '@leadtogo/db/testes'
import { novoId } from '@leadtogo/db'
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

  it('backfill: cria os padrões das empresas existentes uma vez só e não recria o que foi excluído', async () => {
    // Duas empresas "antigas" (sem a marca), como a produção antes do Módulo 1
    const [a, b] = [novoId(), novoId()]
    const conta = novoId()
    await owner`INSERT INTO contas (id, nome) VALUES (${conta}, 'Conta')`
    for (const id of [a, b]) {
      await owner.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${id}, true)`
        await tx`INSERT INTO tenants (id, razao_social, conta_id) VALUES (${id}, ${`Empresa ${id}`}, ${conta})`
        await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${id})`
      })
    }
    const deps = {
      ...dependenciasReais,
      carregar: vi.fn(async () => undefined),
      info: () => undefined,
      erro: () => undefined,
    }
    const contarDe = (id: string, tabela: string) =>
      owner.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${id}, true)`
        return (
          await tx<
            { n: number }[]
          >`SELECT count(*)::int AS n FROM ${tx(tabela)} WHERE excluido_em IS NULL`
        )[0]?.n
      })

    expect(
      await iniciar({ DATABASE_MIGRATION_URL: urlOwner, SEMEAR_REFERENCIAS: 'false' }, deps),
    ).toBe(0)
    for (const id of [a, b]) {
      expect(await contarDe(id, 'tags')).toBe(7)
      expect(await contarDe(id, 'tipos_atividade')).toBe(6)
      expect(await contarDe(id, 'funil_fases')).toBe(4)
      expect(await contarDe(id, 'origens')).toBe(5)
      expect(await contarDe(id, 'motivos')).toBe(12)
    }

    // O administrador exclui um padrão de propósito: o próximo deploy não o recria
    await owner.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${a}, true)`
      await tx`UPDATE tags SET excluido_em = now() WHERE nome = 'Prospect'`
    })
    expect(
      await iniciar({ DATABASE_MIGRATION_URL: urlOwner, SEMEAR_REFERENCIAS: 'false' }, deps),
    ).toBe(0)
    expect(await contarDe(a, 'tags')).toBe(6)
    expect(await contarDe(b, 'tags')).toBe(7)
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
