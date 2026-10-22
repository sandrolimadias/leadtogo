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
  versao: 1,
  novasPorVersao: {},
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

describe('sincronização do catálogo (v2) na partida', () => {
  // A v2 acrescenta `visitas.ver_localizacao` ao Administrador e ao Gestor
  const v2: PadroesDosPerfis = {
    ...padroes,
    versao: 2,
    novasPorVersao: { 2: ['visitas.ver_localizacao'] },
    perfis: padroes.perfis.map((p) =>
      p.chave === 'vendedor'
        ? p
        : {
            ...p,
            permissoes: [...p.permissoes, { permissao: 'visitas.ver_localizacao', alcance: null }],
          },
    ),
  }
  const temLocalizacao = async (tenantId: string) =>
    (
      await comTenant(
        owner,
        tenantId,
        (tx) => tx<{ chave: string }[]>`
          SELECT p.chave_sistema::text AS chave FROM perfil_permissoes pp
          JOIN perfis_acesso p ON p.id = pp.perfil_id
          WHERE pp.permissao = 'visitas.ver_localizacao' ORDER BY 1`,
      )
    ).map((l) => l.chave)

  it('empresa criada na v1 recebe a chave nova só nos perfis de sistema cujo padrão a tem; o resto não muda', async () => {
    const { tenantId } = await novaEmpresa()
    await criarPadroesPendentesPorUrl(urlOwnerDeTeste(), padroes)
    // o administrador tirou uma permissão do Gestor e criou um perfil próprio: nada disso volta
    await comTenant(owner, tenantId, async (tx) => {
      await tx`DELETE FROM perfil_permissoes pp USING perfis_acesso p
        WHERE p.id = pp.perfil_id AND p.chave_sistema = 'gestor' AND pp.permissao = 'empresas.ver'`
      await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${novoId()}, ${tenantId}, 'Supervisor')`
    })
    expect(await temLocalizacao(tenantId)).toEqual([])

    const r = await criarPadroesPendentesPorUrl(urlOwnerDeTeste(), v2)
    expect(r.falhas.filter((f) => f.tenantId === tenantId)).toEqual([])
    expect(await temLocalizacao(tenantId)).toEqual(['admin', 'gestor'])
    expect(await permissoes(tenantId, 'gestor')).not.toContainEqual(
      expect.objectContaining({ permissao: 'empresas.ver' }),
    )
    const [c] = await comTenant(
      owner,
      tenantId,
      (tx) => tx<{ v: number }[]>`SELECT catalogo_perfis_versao AS v FROM tenant_configuracoes`,
    )
    expect(c?.v).toBe(2)

    // de novo: nada muda (a marca já está na v2) e a função não lista mais a empresa
    await criarPadroesPendentesPorUrl(urlOwnerDeTeste(), v2)
    expect(await temLocalizacao(tenantId)).toEqual(['admin', 'gestor'])
    const ids = (
      await owner<
        { tenant_id: string }[]
      >`SELECT tenant_id FROM app_tenants_catalogo_desatualizado(2)`
    ).map((l) => l.tenant_id)
    expect(ids).not.toContain(tenantId)
  })

  it('empresa criada já na v2 nasce com a chave e com a marca', async () => {
    const { tenantId } = await novaEmpresa()
    await criarPadroesPendentesPorUrl(urlOwnerDeTeste(), v2)
    expect(await temLocalizacao(tenantId)).toEqual(['admin', 'gestor'])
    const ids = (
      await owner<
        { tenant_id: string }[]
      >`SELECT tenant_id FROM app_tenants_catalogo_desatualizado(2)`
    ).map((l) => l.tenant_id)
    expect(ids).not.toContain(tenantId)
  })

  it('a função de listagem é só do owner', async () => {
    const [p] = await owner<{ publico: boolean; app: boolean }[]>`
      SELECT has_function_privilege('public', 'app_tenants_catalogo_desatualizado(integer)', 'EXECUTE') AS publico,
             has_function_privilege('leadtogo_app', 'app_tenants_catalogo_desatualizado(integer)', 'EXECUTE') AS app`
    expect(p).toEqual({ publico: false, app: false })
  })
})
