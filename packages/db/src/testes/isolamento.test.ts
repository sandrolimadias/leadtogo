import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { conectarApp, conectarOwner } from './conexoes.js'
import { fabricas, prepararTenants } from './fabricas.js'
import {
  problemasDeCatalogo,
  tabelasComTenantId,
  tabelasSemFabrica,
  tabelasSemTenantIdNaoPrevistas,
  testarComportamento,
} from './isolamento.js'

// Vale para TODAS as tabelas do banco: as com tenant_id são descobertas no catálogo.
const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

const tabelas = await tabelasComTenantId(owner)

describe('isolamento multiempresa (RLS)', () => {
  it('há tabelas com tenant_id para testar', () => {
    expect(tabelas.length).toBeGreaterThan(0)
  })

  it('toda tabela com tenant_id tem RLS habilitado e forçado e políticas de SELECT, INSERT, UPDATE e DELETE', async () => {
    expect(await problemasDeCatalogo(owner)).toEqual([])
  })

  it('não existe tabela sem tenant_id fora da lista de exceções', async () => {
    expect(await tabelasSemTenantIdNaoPrevistas(owner)).toEqual([])
  })

  it('toda tabela com tenant_id tem fábrica no teste de comportamento', () => {
    expect(tabelasSemFabrica(tabelas, fabricas)).toEqual([])
  })

  it('não sobrou fábrica de tabela que não existe mais', () => {
    expect(Object.keys(fabricas).filter((t) => !tabelas.includes(t) && t !== 'tenants')).toEqual([])
  })

  it.each(tabelas)('%s: o tenant A não lê nem grava dados do B', async (tabela) => {
    const fabrica = fabricas[tabela]
    if (!fabrica) throw new Error(`Sem fábrica para ${tabela}`)
    const tenantA = novoId()
    const tenantB = novoId()
    await prepararTenants(owner, [tenantA, tenantB])
    await testarComportamento({ app, owner, tenantA, tenantB }, tabela, fabrica)
  })
})
