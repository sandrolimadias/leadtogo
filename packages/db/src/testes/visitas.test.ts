import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const owner = conectarOwner()
afterAll(() => owner.end())

/** Empresa, vendedor, tipo e uma atividade em execução, prontos para um relatório. */
async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const ids = { empresa: novoId(), membro: novoId(), tipo: novoId(), atividade: novoId() }
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.membro}, ${tenantId}, 'Vendedor')`
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${ids.empresa}, ${tenantId}, 'Empresa', ${ids.membro})`
    await tx`INSERT INTO tipos_atividade (id, tenant_id, nome, icone) VALUES (${ids.tipo}, ${tenantId}, 'Visita', 'map-pin')`
    await tx`INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, responsavel_id, data_inicio, situacao)
      VALUES (${ids.atividade}, ${tenantId}, ${ids.tipo}, 'Visita', ${ids.empresa}, ${ids.membro}, now(), 'em_execucao')`
  })
  return { tenantId, ...ids }
}

describe('relatorios_visita (0029)', () => {
  it('check-in e posição andam juntos; sem check-in não tem posição', async () => {
    const c = await cenario()
    const inserir = (semCheckin: boolean, checkin: boolean, local: boolean) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO relatorios_visita (id, tenant_id, empresa_id, atividade_id, responsavel_id,
          sem_checkin, checkin_em, checkin_local)
        VALUES (${novoId()}, ${c.tenantId}, ${c.empresa}, ${c.atividade}, ${c.membro}, ${semCheckin},
          ${checkin ? new Date().toISOString() : null}::timestamptz,
          ${local ? 'SRID=4326;POINT(-40.3 -20.3)' : null}::geography)`,
      )
    await expect(inserir(true, true, false)).rejects.toThrow(/relatorios_visita_checkin/)
    await expect(inserir(false, false, false)).rejects.toThrow(/relatorios_visita_checkin/)
    await expect(inserir(true, false, true)).rejects.toThrow(/relatorios_visita_checkin/)
    await inserir(false, true, true)
  })

  it('concluído exige resultado, versão do modelo e a data', async () => {
    const c = await cenario()
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO relatorios_visita (id, tenant_id, empresa_id, atividade_id, responsavel_id,
          sem_checkin, situacao) VALUES (${novoId()}, ${c.tenantId}, ${c.empresa}, ${c.atividade}, ${c.membro}, true, 'concluido')`,
      ),
    ).rejects.toThrow(/relatorios_visita_concluido/)
  })

  it('uma atividade tem um relatório só; atividades e empresas ganham conta_visita e visita_tentada_em', async () => {
    const c = await cenario()
    const inserir = () =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO relatorios_visita (id, tenant_id, empresa_id, atividade_id, responsavel_id, sem_checkin)
          VALUES (${novoId()}, ${c.tenantId}, ${c.empresa}, ${c.atividade}, ${c.membro}, true)`,
      )
    await inserir()
    await expect(inserir()).rejects.toThrow(/relatorios_visita_atividade_uq/)
    const [l] = await comTenant(
      owner,
      c.tenantId,
      (tx) => tx<{ conta: boolean; tentada: Date | null }[]>`
        SELECT a.conta_visita AS conta, e.visita_tentada_em AS tentada
        FROM atividades a JOIN empresas e ON e.id = a.empresa_id WHERE a.id = ${c.atividade}`,
    )
    expect(l).toEqual({ conta: true, tentada: null })
  })
})
