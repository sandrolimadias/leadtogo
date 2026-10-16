import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  return comTenant(owner, tenantId, async (tx) => {
    const ids = {
      tenantId,
      membroId: novoId(),
      empresaId: novoId(),
      funilId: novoId(),
      faseId: novoId(),
    }
    await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.membroId}, ${tenantId}, 'Vendedor')`
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${ids.empresaId}, ${tenantId}, 'Empresa', ${ids.membroId})`
    await tx`INSERT INTO funis (id, tenant_id, nome) VALUES (${ids.funilId}, ${tenantId}, 'Funil')`
    await tx`INSERT INTO funil_fases (id, tenant_id, nome, funil_id) VALUES (${ids.faseId}, ${tenantId}, 'Fase', ${ids.funilId})`
    return ids
  })
}
type Cenario = Awaited<ReturnType<typeof cenario>>

const inserir = (c: Cenario, colunas: string, valores: unknown[]) =>
  comTenant(app, c.tenantId, async (tx) => {
    const sql = tx as unknown as {
      unsafe: (q: string, p: unknown[]) => Promise<Record<string, unknown>[]>
    }
    const r = await sql.unsafe(
      `INSERT INTO oportunidades (id, tenant_id, titulo, empresa_id, funil_id, fase_id, responsavel_id${colunas ? `, ${colunas}` : ''})
       VALUES ($1, $2, 'Contrato', $3, $4, $5, $6${valores.map((_, i) => `, $${i + 7}`).join('')})
       RETURNING valor_total, valor_ponderado, status`,
      [novoId(), c.tenantId, c.empresaId, c.funilId, c.faseId, c.membroId, ...valores],
    )
    return r[0] as { valor_total: string; valor_ponderado: string; status: string }
  })

describe('oportunidades (restrições e colunas calculadas do banco)', () => {
  it('o total é único + mensal × meses e o ponderado é total × probabilidade, calculados no banco', async () => {
    const c = await cenario()
    const o = await inserir(
      c,
      'valor_unico, valor_mensal, meses, probabilidade',
      [2000, 500, 12, 50],
    )
    expect(o.valor_total).toBe('8000.00')
    expect(o.valor_ponderado).toBe('4000.00')
    // sem valores: tudo zero; centavos são preservados
    expect((await inserir(c, '', [])).valor_total).toBe('0.00')
    const centavos = await inserir(
      c,
      'valor_unico, valor_mensal, meses, probabilidade',
      [10.35, 0.07, 3, 33],
    )
    expect(centavos.valor_total).toBe('10.56')
    expect(centavos.valor_ponderado).toBe('3.48')
  })

  it('a coluna calculada não aceita gravação direta e acompanha a edição dos valores', async () => {
    const c = await cenario()
    const id = novoId()
    await inserir(c, 'valor_mensal, meses', [100, 6])
    await expect(
      comTenant(app, c.tenantId, (tx) =>
        (tx as unknown as { unsafe: (q: string, p: unknown[]) => Promise<unknown> }).unsafe(
          `UPDATE oportunidades SET valor_total = 1 WHERE tenant_id = $1`,
          [c.tenantId],
        ),
      ),
    ).rejects.toThrow(/valor_total/)
    void id
    const depois = await comTenant(app, c.tenantId, async (tx) => {
      const sql = tx as unknown as {
        unsafe: (q: string, p: unknown[]) => Promise<{ valor_total: string }[]>
      }
      return sql.unsafe(
        `UPDATE oportunidades SET valor_unico = 400 WHERE tenant_id = $1 RETURNING valor_total`,
        [c.tenantId],
      )
    })
    expect(depois[0]?.valor_total).toBe('1000.00')
  })

  it('recusa valor negativo, meses negativo e probabilidade fora de 0 a 100', async () => {
    const c = await cenario()
    await expect(inserir(c, 'valor_unico', [-1])).rejects.toThrow(/oportunidades_valores/)
    await expect(inserir(c, 'valor_mensal', [-1])).rejects.toThrow(/oportunidades_valores/)
    await expect(inserir(c, 'meses', [-1])).rejects.toThrow(/oportunidades_meses/)
    await expect(inserir(c, 'probabilidade', [101])).rejects.toThrow(/oportunidades_probabilidade/)
  })

  it('fechada tem a fase em que parou; ativa não tem', async () => {
    const c = await cenario()
    await expect(inserir(c, 'status', ['perdido'])).rejects.toThrow(/oportunidades_fechamento/)
    await expect(inserir(c, 'fase_parou_em_id', [c.faseId])).rejects.toThrow(
      /oportunidades_fechamento/,
    )
    await expect(
      inserir(c, 'status, fase_parou_em_id', ['perdido', c.faseId]),
    ).resolves.toBeDefined()
  })

  it('a atividade aponta para uma oportunidade (FK) e a próxima atividade da oportunidade existe', async () => {
    const c = await cenario()
    const tipoId = novoId()
    const opId = novoId()
    const ativId = novoId()
    await comTenant(owner, c.tenantId, async (tx) => {
      await tx`INSERT INTO tipos_atividade (id, tenant_id, nome, icone) VALUES (${tipoId}, ${c.tenantId}, 'Visita', 'map-pin')`
      await tx`INSERT INTO oportunidades (id, tenant_id, titulo, empresa_id, funil_id, fase_id, responsavel_id)
        VALUES (${opId}, ${c.tenantId}, 'Contrato', ${c.empresaId}, ${c.funilId}, ${c.faseId}, ${c.membroId})`
    })
    await comTenant(
      app,
      c.tenantId,
      (tx) => tx`
        INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, oportunidade_id, responsavel_id, data_inicio)
        VALUES (${ativId}, ${c.tenantId}, ${tipoId}, 'x', ${c.empresaId}, ${opId}, ${c.membroId}, now())`,
    )
    const apontar = (id: string) =>
      comTenant(
        app,
        c.tenantId,
        (tx) =>
          tx`UPDATE oportunidades SET proxima_atividade_id = ${id}, proxima_atividade_em = now() WHERE id = ${opId}`,
      )
    await expect(apontar(ativId)).resolves.toBeDefined()
    await expect(apontar(novoId())).rejects.toThrow(
      /oportunidades_proxima_atividade_id_atividades_id_fk/,
    )
    await expect(
      comTenant(
        app,
        c.tenantId,
        (tx) => tx`
          INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, oportunidade_id, responsavel_id, data_inicio)
          VALUES (${novoId()}, ${c.tenantId}, ${tipoId}, 'y', ${c.empresaId}, ${novoId()}, ${c.membroId}, now())`,
      ),
    ).rejects.toThrow(/oportunidade_id/)
  })
})
