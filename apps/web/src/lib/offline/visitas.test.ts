import type { SalvarVisitaEntrada } from '@leadtogo/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServicosDeAcesso } from '@/auth/tipos'
import { falha, ok, servicosFalsos } from '@/testes/servicos-falsos'

import { armazemEmMemoria, prepararParaUsuario, usarArmazem } from './banco'
import { novoIdDoAparelho } from './id'
import { enfileirar, relatorioLocal, relatoriosLocais, sincronizar } from './visitas'

beforeEach(async () => {
  usarArmazem(armazemEmMemoria())
  await prepararParaUsuario('u1', 'e1')
})

const dados = (empresaId = '0192f0a0-0000-7000-8000-000000000001'): SalvarVisitaEntrada => ({
  empresaId,
  checkin: null,
  resultadoId: null,
  respostas: [],
  concluir: false,
})

describe('fila de relatórios', () => {
  it('sobe em ordem; o enviado sai da fila; o recusado fica com o motivo', async () => {
    await enfileirar({ id: 'a', empresaNome: 'A', dados: dados() })
    await enfileirar({ id: 'b', empresaNome: 'B', dados: dados() })
    const salvar = vi
      .fn<ServicosDeAcesso['visitas']['campo']['salvar']>()
      .mockResolvedValueOnce(ok({ id: 'a' } as never))
      .mockResolvedValueOnce(falha('respostas_invalidas', 'Responda "Turnos".', 400))
    const servicos = servicosFalsos()
    servicos.visitas.campo.salvar = salvar
    const r = await sincronizar(servicos)
    expect(salvar.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
    expect(r.enviados).toHaveLength(1)
    expect(r.recusados).toEqual([{ id: 'b', mensagem: 'Responda "Turnos".' }])
    expect(await relatorioLocal('a')).toBeNull()
    expect((await relatorioLocal('b'))?.erro).toBe('Responda "Turnos".')
  })

  it('sem rede: para, mantém tudo e conta os pendentes', async () => {
    await enfileirar({ id: 'a', empresaNome: 'A', dados: dados() })
    await enfileirar({ id: 'b', empresaNome: 'B', dados: dados() })
    const servicos = servicosFalsos()
    servicos.visitas.campo.salvar = vi.fn(async () => falha('sem_rede', 'Sem conexão.', 0))
    const r = await sincronizar(servicos)
    expect(r).toMatchObject({ enviados: [], recusados: [], pendentes: 2 })
    expect(await relatoriosLocais()).toHaveLength(2)
    expect(servicos.visitas.campo.salvar).toHaveBeenCalledTimes(1)
  })

  it('duas sincronizações juntas viram uma (não manda o mesmo relatório duas vezes)', async () => {
    await enfileirar({ id: 'a', empresaNome: 'A', dados: dados() })
    const servicos = servicosFalsos()
    servicos.visitas.campo.salvar = vi.fn(async () => ok({ id: 'a' } as never))
    await Promise.all([sincronizar(servicos), sincronizar(servicos)])
    expect(servicos.visitas.campo.salvar).toHaveBeenCalledTimes(1)
  })
})

describe('novoIdDoAparelho', () => {
  it('é um UUID v7 que cresce com o tempo', () => {
    const a = novoIdDoAparelho(1_700_000_000_000)
    const b = novoIdDoAparelho(1_700_000_000_001)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })
})
