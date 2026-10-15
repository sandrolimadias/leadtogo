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
    const tipoId = novoId()
    const membroId = novoId()
    const empresaId = novoId()
    await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    await tx`INSERT INTO tipos_atividade (id, tenant_id, nome, icone) VALUES (${tipoId}, ${tenantId}, 'Visita', 'map-pin')`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Vendedor')`
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, 'Empresa', ${membroId})`
    return { tenantId, tipoId, membroId, empresaId }
  })
}

describe('atividades (restrições do banco)', () => {
  it('o fuso da empresa começa em America/Sao_Paulo', async () => {
    const { tenantId } = await cenario()
    const [c] = await comTenant(
      app,
      tenantId,
      (tx) => tx`SELECT fuso_horario FROM tenant_configuracoes WHERE tenant_id = ${tenantId}`,
    )
    expect(c?.['fuso_horario']).toBe('America/Sao_Paulo')
  })

  it('realizada exige realizada_em e resultado; as outras situações não têm realizada_em', async () => {
    const { tenantId, tipoId, membroId, empresaId } = await cenario()
    const inserir = (situacao: string, realizadaEm: string | null, resultado: string | null) =>
      comTenant(
        app,
        tenantId,
        (tx) => tx`
          INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, responsavel_id,
            data_inicio, situacao, realizada_em, resultado)
          VALUES (${novoId()}, ${tenantId}, ${tipoId}, 'x', ${empresaId}, ${membroId}, now(),
            ${situacao}::situacao_atividade, ${realizadaEm}, ${resultado})`,
      )
    await expect(inserir('realizada', null, 'ok')).rejects.toThrow(/atividades_realizada_em/)
    await expect(inserir('pendente', '2026-10-01T10:00:00Z', null)).rejects.toThrow(
      /atividades_realizada_em/,
    )
    await expect(inserir('realizada', '2026-10-01T10:00:00Z', '   ')).rejects.toThrow(
      /atividades_realizada_resultado/,
    )
    await expect(
      inserir('realizada', '2026-10-01T10:00:00Z', 'Fechou a visita'),
    ).resolves.toBeDefined()
    await expect(inserir('pendente', null, null)).resolves.toBeDefined()
  })

  it('a próxima atividade da empresa precisa existir (FK) e aceita a da própria empresa', async () => {
    const a = await cenario()
    const atividade = novoId()
    await comTenant(
      app,
      a.tenantId,
      (tx) => tx`
        INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, responsavel_id, data_inicio)
        VALUES (${atividade}, ${a.tenantId}, ${a.tipoId}, 'x', ${a.empresaId}, ${a.membroId}, now())`,
    )
    const apontar = (id: string) =>
      comTenant(
        app,
        a.tenantId,
        (tx) =>
          tx`UPDATE empresas SET proxima_atividade_id = ${id}, proxima_atividade_em = now() WHERE id = ${a.empresaId}`,
      )
    await expect(apontar(atividade)).resolves.toBeDefined()
    await expect(apontar(novoId())).rejects.toThrow(
      /empresas_proxima_atividade_id_atividades_id_fk/,
    )
  })
})
