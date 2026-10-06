import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { conectarApp, conectarOwner } from './conexoes.js'
import {
  problemasDeCatalogo,
  tabelasComTenantId,
  tabelasSemFabrica,
  tabelasSemTenantIdNaoPrevistas,
  testarComportamento,
  definirFabrica,
} from './isolamento.js'

// Testa o próprio helper com tabelas de brinquedo: ele precisa reprovar o que está errado.
const app = conectarApp()
const owner = conectarOwner()

const fabrica = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO zz_helper (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'x')`
    return id
  },
})

beforeEach(async () => {
  await owner`DROP TABLE IF EXISTS zz_helper`
  await owner`CREATE TABLE zz_helper (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, nome text)`
})
afterAll(async () => {
  await owner`DROP TABLE IF EXISTS zz_helper`
  await app.end()
  await owner.end()
})

describe('helper de isolamento: catálogo', () => {
  it('descobre sozinho a tabela nova com tenant_id', async () => {
    expect(await tabelasComTenantId(owner)).toContain('zz_helper')
  })

  it('reprova tabela sem RLS', async () => {
    const problemas = await problemasDeCatalogo(owner, ['zz_helper'])
    expect(problemas).toContain('zz_helper: RLS não habilitado')
    expect(problemas).toContain('zz_helper: sem política de SELECT')
  })

  it('reprova RLS sem FORCE', async () => {
    await owner`SELECT aplicar_rls_tenant('zz_helper')`
    await owner`ALTER TABLE zz_helper NO FORCE ROW LEVEL SECURITY`
    expect(await problemasDeCatalogo(owner, ['zz_helper'])).toEqual([
      'zz_helper: RLS não forçado (o dono ignoraria as políticas)',
    ])
  })

  it('reprova política faltando', async () => {
    await owner`SELECT aplicar_rls_tenant('zz_helper')`
    await owner`DROP POLICY tenant_delete ON zz_helper`
    expect(await problemasDeCatalogo(owner, ['zz_helper'])).toEqual([
      'zz_helper: sem política de DELETE',
    ])
  })

  it('aprova a tabela configurada por aplicar_rls_tenant', async () => {
    await owner`SELECT aplicar_rls_tenant('zz_helper')`
    expect(await problemasDeCatalogo(owner, ['zz_helper'])).toEqual([])
  })

  it('aponta tabela sem tenant_id fora da lista de exceções', async () => {
    await owner`CREATE TABLE zz_helper_solta (id uuid PRIMARY KEY)`
    try {
      expect(await tabelasSemTenantIdNaoPrevistas(owner)).toContain('zz_helper_solta')
    } finally {
      await owner`DROP TABLE zz_helper_solta`
    }
  })

  it('aponta tabela com tenant_id sem fábrica', () => {
    expect(tabelasSemFabrica(['zz_helper', 'outra'], { zz_helper: fabrica })).toEqual(['outra'])
  })
})

describe('helper de isolamento: comportamento', () => {
  it('passa numa tabela protegida, com o app e com o owner', async () => {
    await owner`SELECT aplicar_rls_tenant('zz_helper')`
    await testarComportamento(
      { app, owner, tenantA: novoId(), tenantB: novoId() },
      'zz_helper',
      fabrica,
    )
  })

  it('reprova uma tabela com política frouxa (qualquer tenant lê tudo)', async () => {
    await owner`ALTER TABLE zz_helper ENABLE ROW LEVEL SECURITY`
    await owner`ALTER TABLE zz_helper FORCE ROW LEVEL SECURITY`
    await owner`CREATE POLICY tudo ON zz_helper USING (true) WITH CHECK (true)`
    await owner`GRANT SELECT, INSERT, UPDATE, DELETE ON zz_helper TO leadtogo_app`
    await expect(
      testarComportamento(
        { app, owner, tenantA: novoId(), tenantB: novoId() },
        'zz_helper',
        fabrica,
      ),
    ).rejects.toThrow()
  })
})
