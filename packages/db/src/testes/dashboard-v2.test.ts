import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const owner = conectarOwner()
afterAll(async () => {
  await owner.end()
})

/** O bloco da migração 0045 que grava o histórico dos associados antigos (roda de novo, é idempotente). */
async function cargaDoHistorico(): Promise<string> {
  const arquivo = fileURLToPath(new URL('../../migrations/0045_dashboard_v2.sql', import.meta.url))
  const sql = await readFile(arquivo, 'utf8')
  const inicio = sql.indexOf('DO $$')
  return sql.slice(inicio, sql.indexOf('END $$;', inicio) + 'END $$;'.length)
}

async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  return comTenant(owner, tenantId, async (tx) => {
    const membro = novoId()
    const grupo = novoId()
    const cliente = novoId()
    const lead = novoId()
    const [semHistorico, comHistorico, soLead] = [novoId(), novoId(), novoId()]
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membro}, ${tenantId}, 'Vendedor')`
    await tx`INSERT INTO tag_grupos (id, tenant_id, nome, chave_sistema) VALUES (${grupo}, ${tenantId}, 'Status', 'status')`
    await tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id, chave_sistema)
      VALUES (${cliente}, ${tenantId}, 'Associado', ${grupo}, 'cliente'),
             (${lead}, ${tenantId}, 'Lead', ${grupo}, 'lead')`
    for (const id of [semHistorico, comHistorico, soLead]) {
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${id}, ${tenantId}, ${`E ${id}`}, ${membro})`
    }
    await tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id, aplicada_em)
      VALUES (${tenantId}, ${semHistorico}, ${cliente}, '2025-03-10T12:00:00Z'),
             (${tenantId}, ${comHistorico}, ${cliente}, '2025-04-10T12:00:00Z'),
             (${tenantId}, ${soLead}, ${lead}, '2025-05-10T12:00:00Z')`
    await tx`INSERT INTO empresa_tags_historico (id, tenant_id, empresa_id, tag_id, acao, em)
      VALUES (${novoId()}, ${tenantId}, ${comHistorico}, ${cliente}, 'adicionada', '2025-04-10T12:00:00Z')`
    return { tenantId, cliente, semHistorico, comHistorico }
  })
}

describe('migração 0045: histórico de Status dos associados antigos', () => {
  it('grava a linha "adicionada" só onde falta, com a data da tag e uuid v7; repetir não duplica', async () => {
    const c = await cenario()
    const bloco = await cargaDoHistorico()
    await owner.unsafe(bloco)
    await owner.unsafe(bloco)
    const linhas = await comTenant(
      owner,
      c.tenantId,
      (tx) => tx<{ empresa_id: string; em: Date; automatica: boolean; id: string; por: null }[]>`
        SELECT empresa_id, em, automatica, id::text AS id, por FROM empresa_tags_historico
        WHERE tag_id = ${c.cliente} ORDER BY em`,
    )
    expect(linhas).toHaveLength(2)
    const [criada, existente] = linhas
    expect(criada).toMatchObject({ empresa_id: c.semHistorico, automatica: true, por: null })
    expect(criada?.em.toISOString()).toBe('2025-03-10T12:00:00.000Z')
    expect(criada?.id.charAt(14)).toBe('7') // a versão do uuid
    expect(existente).toMatchObject({ empresa_id: c.comHistorico, automatica: false })
  })
})
