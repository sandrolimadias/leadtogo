import type { Job } from 'bullmq'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { criarConexao } from '@leadtogo/db'

import { dono, empresaDeOutraConta } from '../testes/mundo.js'
import { idDoBloco, type JobDeImportacao, raizDaVarredura } from './fila.js'
import { varrerImportacoesParadas } from './varredura.js'

// O banco decide quem está parado (app_importacoes_paradas, testada no pacote db); aqui, o que a
// varredura faz com o resultado: reenfileira com id determinístico e não duplica. Dados inventados.

const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 2 })
afterAll(async () => {
  await banco.cliente.end({ timeout: 5 })
  await dono.end()
})

async function loteDe(opcoes: { ultimo?: string; proxima?: string }) {
  const { tenantId } = await empresaDeOutraConta()
  const loteId = crypto.randomUUID()
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO importacoes (id, tenant_id, nome, nome_arquivo, situacao, iniciado_em)
             VALUES (${loteId}, ${tenantId}, 'L', 'a.csv', 'em_andamento', now() - interval '30 minutes')`
    await tx.unsafe(
      `UPDATE importacoes SET ultimo_progresso_em = ${opcoes.ultimo ?? 'NULL'},
         proxima_consulta_em = ${opcoes.proxima ?? 'NULL'} WHERE id = '${loteId}'`,
    )
    await tx`INSERT INTO importacao_linhas (id, tenant_id, importacao_id, numero, dados)
             VALUES (${crypto.randomUUID()}, ${tenantId}, ${loteId}, 1, '{}'::jsonb)`
  })
  return { tenantId, loteId }
}
const fila = (vivos: { importacaoId: string }[] = []) => ({
  add: vi.fn(() => Promise.resolve(undefined as never)),
  getJobs: vi.fn(() => Promise.resolve(vivos.map((data) => ({ data })) as unknown as Job[])),
})

describe('varrerImportacoesParadas', () => {
  it('reenfileira o lote parado com id determinístico; chamar de novo na mesma janela não cria outro job', async () => {
    const parado = await loteDe({ ultimo: "now() - interval '10 minutes'" })
    const f = fila()
    const agora = 1_700_000_040_000 // começo de uma janela de 2 min: +30 s cai na mesma
    await varrerImportacoesParadas({ banco, fila: f, agora: () => agora })
    const chamadas = f.add.mock.calls as unknown as [string, { importacaoId: string }, object][]
    const dele = chamadas.filter((c) => c[1].importacaoId === parado.loteId)
    expect(dele).toHaveLength(1)
    expect(dele[0]?.[1]).toEqual({
      tenantId: parado.tenantId,
      importacaoId: parado.loteId,
      raiz: raizDaVarredura(agora),
      bloco: 0,
    })
    expect(dele[0]?.[2]).toMatchObject({
      jobId: idDoBloco(dele[0]?.[1] as unknown as JobDeImportacao),
      attempts: 3,
    })
    // mesma janela, mesmo id: o BullMQ descarta o segundo add
    await varrerImportacoesParadas({ banco, fila: f, agora: () => agora + 30_000 })
    const ids = f.add.mock.calls
      .map((c) => (c as unknown as [string, object, { jobId: string }])[2].jobId)
      .filter((id) => id.startsWith(`imp-${parado.loteId}-`))
    expect(new Set(ids).size).toBe(1)
  })

  it('não toca no lote que espera de propósito, nem no que já tem job vivo na fila', async () => {
    const esperando = await loteDe({
      ultimo: "now() - interval '10 minutes'",
      proxima: "now() + interval '1 minute'", // 429 / intervalo programado
    })
    const esperouHaPouco = await loteDe({
      ultimo: "now() - interval '10 minutes'",
      proxima: "now() - interval '1 minute'", // espera acabou há 1 min: ainda dentro da margem
    })
    const comJob = await loteDe({ ultimo: "now() - interval '10 minutes'" })
    const f = fila([{ importacaoId: comJob.loteId }])
    await varrerImportacoesParadas({ banco, fila: f })
    const enfileirados = f.add.mock.calls.map(
      (c) => (c as unknown as [string, { importacaoId: string }])[1].importacaoId,
    )
    expect(enfileirados).not.toContain(esperando.loteId)
    expect(enfileirados).not.toContain(esperouHaPouco.loteId)
    expect(enfileirados).not.toContain(comJob.loteId)
  })
})
