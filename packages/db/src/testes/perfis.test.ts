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

async function novoUsuario(): Promise<string> {
  const id = novoId()
  await app`INSERT INTO auth."user" (id, name, email) VALUES (${id}, 'Usuário', ${`u-${id}@exemplo.com`})`
  return id
}

const novoPerfil = (
  tenant: string,
  nome: string,
  extra: { chave?: string; exige2fa?: boolean } = {},
) =>
  comTenant(app, tenant, async (tx) => {
    const id = novoId()
    await tx`INSERT INTO perfis_acesso (id, tenant_id, nome, sistema, chave_sistema, exige_2fa)
      VALUES (${id}, ${tenant}, ${nome}, ${extra.chave !== undefined}, ${extra.chave ?? null}::chave_perfil_sistema,
        ${extra.exige2fa ?? false})`
    return id
  })

const entrar = (tenant: string, usuario: string, perfilId: string | null) =>
  comTenant(
    app,
    tenant,
    (tx) => tx`
      INSERT INTO membros (id, tenant_id, nome, usuario_id, perfil_id) VALUES (${novoId()}, ${tenant}, 'M', ${usuario}, ${perfilId})`,
  )

describe('perfis de acesso (migração 0027)', () => {
  it('perfil de sistema exige chave_sistema e vice-versa', async () => {
    const [a] = [novoId()]
    await prepararTenants(owner, [a])
    await expect(
      comTenant(
        app,
        a,
        (tx) =>
          tx`INSERT INTO perfis_acesso (id, tenant_id, nome, sistema) VALUES (${novoId()}, ${a}, 'X', true)`,
      ),
    ).rejects.toThrow(/perfis_acesso_sistema_chk/)
    await expect(
      comTenant(
        app,
        a,
        (tx) => tx`INSERT INTO perfis_acesso (id, tenant_id, nome, chave_sistema)
          VALUES (${novoId()}, ${a}, 'Y', 'admin')`,
      ),
    ).rejects.toThrow(/perfis_acesso_sistema_chk/)
  })

  it('nome único por empresa sem diferenciar maiúsculas, só entre os não excluídos', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const id = await novoPerfil(a, 'Supervisor')
    await expect(novoPerfil(a, 'supervisor')).rejects.toThrow(/perfis_acesso_nome_uq/)
    await novoPerfil(b, 'Supervisor') // outra empresa pode
    await comTenant(
      app,
      a,
      (tx) => tx`UPDATE perfis_acesso SET excluido_em = now() WHERE id = ${id}`,
    )
    await novoPerfil(a, 'Supervisor') // o excluído não conta
  })

  it('um perfil de sistema de cada chave por empresa', async () => {
    const [a] = [novoId()]
    await prepararTenants(owner, [a])
    await novoPerfil(a, 'Administrador', { chave: 'admin' })
    await expect(novoPerfil(a, 'Outro admin', { chave: 'admin' })).rejects.toThrow(
      /perfis_acesso_sistema_uq/,
    )
  })

  it('o alcance só aceita propria, equipe ou todas (ou nulo)', async () => {
    const [a] = [novoId()]
    await prepararTenants(owner, [a])
    const perfil = await novoPerfil(a, 'P')
    await comTenant(
      app,
      a,
      (tx) => tx`INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
        VALUES (${a}, ${perfil}, 'empresas.criar', NULL), (${a}, ${perfil}, 'empresas.ver', 'equipe')`,
    )
    await expect(
      comTenant(
        app,
        a,
        (tx) => tx`INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
          VALUES (${a}, ${perfil}, 'empresas.editar', 'tudo')`,
      ),
    ).rejects.toThrow()
  })

  it('membros e convites ganharam perfil_id nulo; tenant_configuracoes, a marca do backfill', async () => {
    const colunas = await owner<{ tabela: string; nulo: string }[]>`
      SELECT table_name AS tabela, is_nullable AS nulo FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'perfil_id' AND table_name IN ('membros', 'convites')
      ORDER BY table_name`
    expect(colunas).toEqual([
      { tabela: 'convites', nulo: 'YES' },
      { tabela: 'membros', nulo: 'YES' },
    ])
    const [marca] = await owner<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'tenant_configuracoes' AND column_name = 'perfis_criados_em'`
    expect(marca?.n).toBe(1)
  })
})

const comPerfil = (usuario: string | null) =>
  app<
    {
      tenant_id: string
      papel: string
      dois_fatores_exigido: string
      perfil_id: string | null
      perfil_exige_2fa: boolean | null
    }[]
  >`SELECT * FROM app_vinculos_com_perfil(${usuario})`

describe('app_vinculos_com_perfil (SECURITY DEFINER): perfil e 2FA de cada empresa do usuário', () => {
  it('devolve o perfil e o flag exige_2fa; sem perfil, nulos', async () => {
    const [a, b, c] = [novoId(), novoId(), novoId()]
    await prepararTenants(owner, [a, b, c])
    const usuario = await novoUsuario()
    const outro = await novoUsuario()
    const pa = await novoPerfil(a, 'Administrador', { chave: 'admin', exige2fa: true })
    const pb = await novoPerfil(b, 'Campo')
    await entrar(a, usuario, pa)
    await entrar(b, usuario, pb)
    await entrar(c, usuario, null)
    await entrar(c, outro, null) // vínculo de outro usuário não aparece
    const r = await comPerfil(usuario)
    expect(r.map((v) => [v.tenant_id, v.perfil_id, v.perfil_exige_2fa]).sort()).toEqual(
      [
        [a, pa, true],
        [b, pb, false],
        [c, null, null],
      ].sort(),
    )
  })

  it('ignora perfil excluído e perfil de outra empresa (a FK não passa pelo RLS)', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const usuario = await novoUsuario()
    const deB = await novoPerfil(b, 'De B', { exige2fa: true })
    await entrar(a, usuario, deB)
    expect((await comPerfil(usuario)).map((v) => v.perfil_id)).toEqual([null])
    const deA = await novoPerfil(a, 'De A')
    await comTenant(owner, a, async (tx) => {
      await tx`UPDATE membros SET perfil_id = ${deA} WHERE usuario_id = ${usuario}`
      await tx`UPDATE perfis_acesso SET excluido_em = now() WHERE id = ${deA}`
    })
    expect((await comPerfil(usuario)).map((v) => v.perfil_id)).toEqual([null])
  })

  it('é SECURITY DEFINER do owner, com search_path fixo, e só o app executa', async () => {
    const [f] = await owner<{ dono: string; definer: boolean; config: string[] }[]>`
      SELECT pg_get_userbyid(proowner) AS dono, prosecdef AS definer, proconfig AS config
      FROM pg_proc WHERE proname = 'app_vinculos_com_perfil'`
    expect(f).toEqual({
      dono: 'leadtogo_owner',
      definer: true,
      config: ['search_path=pg_catalog, pg_temp'],
    })
    const [p] = await owner<{ publico: boolean; app: boolean }[]>`
      SELECT has_function_privilege('public', 'app_vinculos_com_perfil(uuid)', 'EXECUTE') AS publico,
             has_function_privilege('leadtogo_app', 'app_vinculos_com_perfil(uuid)', 'EXECUTE') AS app`
    expect(p).toEqual({ publico: false, app: true })
  })

  it('não abre brecha: o app não lê perfis de fora do tenant ativo, nem com a variável', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const usuario = await novoUsuario()
    const pa = await novoPerfil(a, 'De A')
    await entrar(a, usuario, pa)
    const linhas = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${b}, true)`
      await tx`SELECT set_config('app.vinculos_usuario', ${usuario}, true)`
      return tx<{ id: string }[]>`SELECT id FROM perfis_acesso WHERE tenant_id = ${a}`
    })
    expect(linhas).toHaveLength(0)
  })
})

describe('app_tenants_sem_perfis (backfill na partida)', () => {
  it('o app não executa; só o owner', async () => {
    const [p] = await owner<{ publico: boolean; app: boolean }[]>`
      SELECT has_function_privilege('public', 'app_tenants_sem_perfis()', 'EXECUTE') AS publico,
             has_function_privilege('leadtogo_app', 'app_tenants_sem_perfis()', 'EXECUTE') AS app`
    expect(p).toEqual({ publico: false, app: false })
  })

  it('devolve só os tenants sem a marca', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    await comTenant(
      owner,
      a,
      (tx) => tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${a})`,
    )
    await comTenant(
      owner,
      b,
      (tx) =>
        tx`INSERT INTO tenant_configuracoes (tenant_id, perfis_criados_em) VALUES (${b}, now())`,
    )
    const ids = (
      await owner<{ tenant_id: string }[]>`SELECT tenant_id FROM app_tenants_sem_perfis()`
    ).map((l) => l.tenant_id)
    expect(ids).toContain(a)
    expect(ids).not.toContain(b)
  })
})
