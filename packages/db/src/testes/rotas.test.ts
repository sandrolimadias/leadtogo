import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const owner = conectarOwner()
afterAll(() => owner.end())

/** Vendedor, duas empresas, um ponto de partida e uma rota sem paradas. */
async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const ids = {
    membro: novoId(),
    empresa: novoId(),
    outra: novoId(),
    ponto: novoId(),
    rota: novoId(),
  }
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.membro}, ${tenantId}, 'Vendedor')`
    for (const e of [ids.empresa, ids.outra])
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${e}, ${tenantId}, 'Empresa', ${ids.membro})`
    await tx`INSERT INTO rota_pontos_partida (id, tenant_id, nome, localizacao)
      VALUES (${ids.ponto}, ${tenantId}, 'Sede', 'SRID=4326;POINT(-40.3 -20.3)'::geography)`
    await tx`INSERT INTO rotas (id, tenant_id, codigo, nome, data, responsavel_id)
      VALUES (${ids.rota}, ${tenantId}, 1, 'Rota', current_date, ${ids.membro})`
  })
  return { tenantId, ...ids }
}

describe('rotas (0030)', () => {
  it('partida "ponto" exige o ponto, e "posição atual" não aceita ponto', async () => {
    const c = await cenario()
    const inserir = (partida: string, ponto: string | null) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO rotas (id, tenant_id, codigo, nome, data, responsavel_id, partida, ponto_partida_id)
          VALUES (${novoId()}, ${c.tenantId}, ${Math.floor(Math.random() * 1e9)}, 'R', current_date, ${c.membro},
            ${partida}::partida_rota, ${ponto}::uuid)`,
      )
    await expect(inserir('ponto', null)).rejects.toThrow(/rotas_partida_chk/)
    await expect(inserir('posicao_atual', c.ponto)).rejects.toThrow(/rotas_partida_chk/)
    await inserir('ponto', c.ponto)
    await inserir('posicao_atual', null)
  })

  it('o código é único por empresa e os minutos por visita vão de 0 a 480', async () => {
    const c = await cenario()
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`INSERT INTO rotas (id, tenant_id, codigo, nome, data, responsavel_id)
          VALUES (${novoId()}, ${c.tenantId}, 1, 'Outra', current_date, ${c.membro})`,
      ),
    ).rejects.toThrow(/rotas_codigo_uq/)
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`UPDATE rotas SET minutos_por_visita = 481 WHERE id = ${c.rota}`,
      ),
    ).rejects.toThrow(/rotas_minutos_por_visita_chk/)
  })

  it('uma empresa aparece uma vez por rota (entre as paradas não excluídas)', async () => {
    const c = await cenario()
    const parada = (ordem: number) =>
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`INSERT INTO rota_paradas (id, tenant_id, rota_id, empresa_id, ordem)
          VALUES (${novoId()}, ${c.tenantId}, ${c.rota}, ${c.empresa}, ${ordem}) RETURNING id`,
      )
    const [primeira] = await parada(1)
    await expect(parada(2)).rejects.toThrow(/rota_paradas_empresa_uq/)
    await comTenant(
      owner,
      c.tenantId,
      (tx) =>
        tx`UPDATE rota_paradas SET excluido_em = now() WHERE id = ${primeira?.['id'] as string}`,
    )
    await parada(1)
  })

  it('parada pulada tem motivo, e só a pulada tem motivo', async () => {
    const c = await cenario()
    const inserir = (situacao: string, motivo: string | null) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO rota_paradas (id, tenant_id, rota_id, empresa_id, ordem, situacao, motivo_pulo)
          VALUES (${novoId()}, ${c.tenantId}, ${c.rota}, ${c.outra}, 1, ${situacao}::situacao_parada, ${motivo})`,
      )
    await expect(inserir('pulada', null)).rejects.toThrow(/rota_paradas_pulo_chk/)
    await expect(inserir('pendente', 'Fechada')).rejects.toThrow(/rota_paradas_pulo_chk/)
    await inserir('pulada', 'Fechada')
  })
})
