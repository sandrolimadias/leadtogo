import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { criarPadroesPendentesPorUrl } from '../index.js'
import type { PadroesDosPerfis } from '../perfis.js'
import { comTenant, conectarApp, conectarOwner, urlOwnerDeTeste } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

// Padrões mínimos (o catálogo real vem do `shared` pela API e é testado lá)
const padroes: PadroesDosPerfis = {
  perfis: [
    {
      chave: 'admin',
      nome: 'Administrador',
      permissoes: [
        { permissao: 'empresas.ver', alcance: 'todas' },
        { permissao: 'perfis.gerir', alcance: null },
      ],
    },
    {
      chave: 'gestor',
      nome: 'Gestor',
      permissoes: [{ permissao: 'empresas.ver', alcance: 'todas' }],
    },
    {
      chave: 'vendedor',
      nome: 'Vendedor',
      permissoes: [
        { permissao: 'empresas.ver', alcance: 'propria' },
        { permissao: 'empresas.editar', alcance: 'propria' },
        { permissao: 'empresas.criar', alcance: null },
      ],
    },
  ],
  permissoesDeVer: ['empresas.ver'],
  exige2fa: (politica) => ({
    admin: true,
    gestor: politica !== 'admin',
    vendedor: politica === 'todos',
  }),
}

async function novaEmpresa(config: { veTodas?: boolean; politica?: string } = {}) {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const membrosIds: Record<string, string> = {}
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO tenant_configuracoes (tenant_id, vendedor_ve_todas_empresas, dois_fatores_exigido)
      VALUES (${tenantId}, ${config.veTodas ?? false}, ${config.politica ?? 'admin'}::politica_dois_fatores)`
    for (const papel of ['admin', 'gestor', 'vendedor'] as const) {
      const id = novoId()
      membrosIds[papel] = id
      await tx`INSERT INTO membros (id, tenant_id, nome, papel) VALUES (${id}, ${tenantId}, ${papel}, ${papel})`
    }
    await tx`INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por)
      VALUES (${novoId()}, ${tenantId}, ${`c-${tenantId}@exemplo.com`}, 'gestor', ${`h-${tenantId}`},
        now() + interval '7 days', ${membrosIds['admin'] ?? null})`
  })
  return { tenantId, membrosIds }
}

const perfis = (tenantId: string) =>
  comTenant(
    owner,
    tenantId,
    (tx) => tx<{ id: string; chave: string; nome: string; sistema: boolean; exige_2fa: boolean }[]>`
      SELECT id, chave_sistema::text AS chave, nome, sistema, exige_2fa FROM perfis_acesso
      WHERE tenant_id = ${tenantId} ORDER BY chave_sistema`,
  )

const permissoes = (tenantId: string, chave: string) =>
  comTenant(
    owner,
    tenantId,
    (tx) => tx<{ permissao: string; alcance: string | null }[]>`
      SELECT pp.permissao, pp.alcance::text AS alcance FROM perfil_permissoes pp
      JOIN perfis_acesso p ON p.id = pp.perfil_id
      WHERE pp.tenant_id = ${tenantId} AND p.chave_sistema = ${chave}::chave_perfil_sistema
      ORDER BY pp.permissao`,
  )

const rodar = async (tenantId: string) => {
  const r = await criarPadroesPendentesPorUrl(urlOwnerDeTeste(), padroes)
  // o start percorre todas as empresas do banco: só as falhas desta contam
  expect(r.falhas.filter((f) => f.tenantId === tenantId)).toEqual([])
}

describe('backfill dos perfis de acesso (start da API)', () => {
  it('cria os três perfis de sistema e liga membros e convites pelo papel', async () => {
    const { tenantId, membrosIds } = await novaEmpresa()
    await rodar(tenantId)
    const criados = await perfis(tenantId)
    expect(criados.map((p) => [p.chave, p.nome, p.sistema])).toEqual([
      ['admin', 'Administrador', true],
      ['gestor', 'Gestor', true],
      ['vendedor', 'Vendedor', true],
    ])
    const porChave = Object.fromEntries(criados.map((p) => [p.chave, p.id]))
    const ligados = await comTenant(
      owner,
      tenantId,
      (tx) => tx<{ id: string; perfil_id: string | null }[]>`
        SELECT id, perfil_id FROM membros WHERE tenant_id = ${tenantId}`,
    )
    for (const m of ligados) {
      const papel = Object.entries(membrosIds).find(([, id]) => id === m.id)?.[0] ?? ''
      expect(m.perfil_id).toBe(porChave[papel])
    }
    const [convite] = await comTenant(
      owner,
      tenantId,
      (tx) =>
        tx<{ perfil_id: string }[]>`SELECT perfil_id FROM convites WHERE tenant_id = ${tenantId}`,
    )
    expect(convite?.perfil_id).toBe(porChave['gestor'])
  })

  it('é idempotente: rodar duas vezes não duplica nem recria o que o admin mudou', async () => {
    const { tenantId } = await novaEmpresa()
    await rodar(tenantId)
    const antes = await perfis(tenantId)
    await comTenant(
      owner,
      tenantId,
      (tx) => tx`UPDATE perfis_acesso SET nome = 'Vendas externas' WHERE tenant_id = ${tenantId}
        AND chave_sistema = 'vendedor'`,
    )
    await rodar(tenantId)
    const depois = await perfis(tenantId)
    expect(depois.map((p) => p.id)).toEqual(antes.map((p) => p.id))
    expect(depois.find((p) => p.chave === 'vendedor')?.nome).toBe('Vendas externas')
    expect(await permissoes(tenantId, 'vendedor')).toHaveLength(3)
  })

  it('"Vendedores podem ver todas" desligado: o Vendedor vê e edita só a própria', async () => {
    const { tenantId } = await novaEmpresa({ veTodas: false })
    await rodar(tenantId)
    expect(await permissoes(tenantId, 'vendedor')).toEqual([
      { permissao: 'empresas.criar', alcance: null },
      { permissao: 'empresas.editar', alcance: 'propria' },
      { permissao: 'empresas.ver', alcance: 'propria' },
    ])
  })

  it('"Vendedores podem ver todas" ligado: ver = todas, editar continua propria', async () => {
    const { tenantId } = await novaEmpresa({ veTodas: true })
    await rodar(tenantId)
    await rodar(tenantId) // idempotente também com o interruptor ligado
    expect(await permissoes(tenantId, 'vendedor')).toEqual([
      { permissao: 'empresas.criar', alcance: null },
      { permissao: 'empresas.editar', alcance: 'propria' },
      { permissao: 'empresas.ver', alcance: 'todas' },
    ])
    // o interruptor não mexe nos outros perfis
    expect(await permissoes(tenantId, 'gestor')).toEqual([
      { permissao: 'empresas.ver', alcance: 'todas' },
    ])
  })

  it.each([
    ['admin', { admin: true, gestor: false, vendedor: false }],
    ['admin_gestor', { admin: true, gestor: true, vendedor: false }],
    ['todos', { admin: true, gestor: true, vendedor: true }],
  ])('a política de 2FA "%s" vira o flag exige_2fa de cada perfil', async (politica, esperado) => {
    const { tenantId } = await novaEmpresa({ politica })
    await rodar(tenantId)
    const r = await perfis(tenantId)
    expect(Object.fromEntries(r.map((p) => [p.chave, p.exige_2fa]))).toEqual(esperado)
  })

  it('sem os padrões (chamada antiga, sem perfis), não toca na marca', async () => {
    const { tenantId } = await novaEmpresa()
    await criarPadroesPendentesPorUrl(urlOwnerDeTeste())
    expect(await perfis(tenantId)).toEqual([])
    await rodar(tenantId)
    expect(await perfis(tenantId)).toHaveLength(3)
  })
})
