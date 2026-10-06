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
const entrar = (tenant: string, usuario: string, papel: string, extra = '') =>
  comTenant(
    app,
    tenant,
    (tx) => tx`
      INSERT INTO membros (id, tenant_id, nome, usuario_id, papel) VALUES (${novoId()}, ${tenant}, 'M', ${usuario}, ${papel})`,
  ).then(async () => {
    if (extra)
      await comTenant(owner, tenant, (tx) =>
        tx.unsafe(`UPDATE membros SET ${extra} WHERE usuario_id = '${usuario}'`),
      )
  })

const vinculos = (usuario: string | null) =>
  app<{ tenant_id: string; papel: string }[]>`SELECT * FROM app_vinculos_do_usuario(${usuario})`

describe('app_vinculos_do_usuario (SECURITY DEFINER)', () => {
  it('devolve só o tenant e o papel de cada vínculo do usuário, sem nenhum tenant ativo', async () => {
    const [a, b, c] = [novoId(), novoId(), novoId()]
    await prepararTenants(owner, [a, b, c])
    const usuario = await novoUsuario()
    const outro = await novoUsuario()
    await entrar(a, usuario, 'admin')
    await entrar(b, usuario, 'vendedor')
    await entrar(c, outro, 'gestor') // vínculo de OUTRO usuário
    const r = await vinculos(usuario)
    expect(r.map((v) => [v.tenant_id, v.papel]).sort()).toEqual(
      [
        [a, 'admin'],
        [b, 'vendedor'],
      ].sort(),
    )
    expect(Object.keys(r[0] ?? {}).sort()).toEqual(['papel', 'tenant_id']) // só isso
  })

  it('ignora membros inativos e excluídos (lixeira)', async () => {
    const [a, b, c] = [novoId(), novoId(), novoId()]
    await prepararTenants(owner, [a, b, c])
    const usuario = await novoUsuario()
    await entrar(a, usuario, 'vendedor', 'ativo = false')
    await entrar(b, usuario, 'vendedor', 'excluido_em = now()')
    await entrar(c, usuario, 'gestor')
    expect((await vinculos(usuario)).map((v) => v.tenant_id)).toEqual([c])
  })

  it('usuário sem vínculo, desconhecido ou NULL: lista vazia (e não revela nada de outros)', async () => {
    expect(await vinculos(novoId())).toHaveLength(0)
    expect(await vinculos(null)).toHaveLength(0)
    const sozinho = await novoUsuario()
    expect(await vinculos(sozinho)).toHaveLength(0)
  })

  it('pertence ao owner, é SECURITY DEFINER com search_path fixo, e só o app executa', async () => {
    const [f] = await owner<
      { dono: string; definer: boolean; config: string[]; retorna: string }[]
    >`
      SELECT pg_get_userbyid(proowner) AS dono, prosecdef AS definer, proconfig AS config,
             pg_get_function_result(oid) AS retorna
      FROM pg_proc WHERE proname = 'app_vinculos_do_usuario'`
    expect(f?.dono).toBe('leadtogo_owner')
    expect(f?.definer).toBe(true)
    expect(f?.config).toEqual(['search_path=pg_catalog, pg_temp'])
    expect(f?.retorna).toBe('TABLE(tenant_id uuid, papel papel_membro)')
    const [p] = await owner<{ publico: boolean; app: boolean; owner: boolean }[]>`
      SELECT has_function_privilege('public', 'app_vinculos_do_usuario(uuid)', 'EXECUTE') AS publico,
             has_function_privilege('leadtogo_app', 'app_vinculos_do_usuario(uuid)', 'EXECUTE') AS app,
             has_function_privilege('leadtogo_owner', 'app_vinculos_do_usuario(uuid)', 'EXECUTE') AS owner`
    expect(p).toEqual({ publico: false, app: true, owner: true })
  })

  it('não abre uma brecha: o app continua sem ver membros fora do tenant ativo, mesmo depois da chamada', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const usuario = await novoUsuario()
    await entrar(a, usuario, 'admin')
    await entrar(b, usuario, 'vendedor')
    await app.begin(async (tx) => {
      await tx`SELECT * FROM app_vinculos_do_usuario(${usuario})`
      // a variável que a função usa foi limpa ao terminar...
      const [v] = await tx<
        { v: string }[]
      >`SELECT current_setting('app.vinculos_usuario', true) AS v`
      expect(v?.v ?? '').toBe('')
      // ...e sem tenant ativo o app não lê membro nenhum
      expect(await tx`SELECT 1 FROM membros`).toHaveLength(0)
    })
  })

  it('o app não consegue usar a política do owner: definir a variável por conta própria não revela membros', async () => {
    const tenant = novoId()
    await prepararTenants(owner, [tenant])
    const usuario = await novoUsuario()
    await entrar(tenant, usuario, 'admin')
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.vinculos_usuario', ${usuario}, true)`
      await tx`SELECT set_config('app.consolidado_usuario', ${usuario}, true)`
      expect(await tx`SELECT 1 FROM membros`).toHaveLength(0)
      expect(await tx`SELECT 1 FROM tenants`).toHaveLength(0)
    })
  })

  it('o owner direto também não ganha leitura: a política só vale dentro das funções', async () => {
    const tenant = novoId()
    await prepararTenants(owner, [tenant])
    const usuario = await novoUsuario()
    await entrar(tenant, usuario, 'admin')
    expect(await owner`SELECT 1 FROM membros WHERE usuario_id = ${usuario}`).toHaveLength(0)
  })

  it('uma tabela temporária com o mesmo nome não engana a função (search_path fixo)', async () => {
    // O app nem pode criar tabela temporária (TEMP revogado do PUBLIC); a prova é pelo owner, que pode
    const tenant = novoId()
    await prepararTenants(owner, [tenant])
    const usuario = await novoUsuario()
    await entrar(tenant, usuario, 'admin')
    await owner.begin(async (tx) => {
      await tx`CREATE TEMP TABLE membros (tenant_id uuid, papel text, usuario_id uuid, excluido_em timestamptz, ativo boolean, criado_em timestamptz, id uuid)`
      await tx`INSERT INTO pg_temp.membros VALUES (${novoId()}, 'admin', ${usuario}, null, true, now(), ${novoId()})`
      const r = await tx<{ tenant_id: string }[]>`SELECT * FROM app_vinculos_do_usuario(${usuario})`
      expect(r.map((x) => x.tenant_id)).toEqual([tenant]) // o dado verdadeiro, não o da temporária
    })
    await expect(app`CREATE TEMP TABLE intruso (id int)`).rejects.toThrow(/permission denied/)
  })
})

describe('app_empresas_da_conta_do_usuario (consolidado)', () => {
  it('devolve todas as empresas das contas que o usuário administra (dono/administrador)', async () => {
    const [a, b, c] = [novoId(), novoId(), novoId()]
    await prepararTenants(owner, [a, b]) // mesma conta
    await prepararTenants(owner, [c]) // outra conta
    const contaDe = async (t: string) =>
      (
        await comTenant(
          owner,
          t,
          (tx) => tx<{ conta_id: string }[]>`SELECT conta_id FROM tenants WHERE id = ${t}`,
        )
      )[0]?.conta_id ?? ''
    expect(await contaDe(a)).toBe(await contaDe(b))
    expect(await contaDe(c)).not.toBe(await contaDe(a))
    const usuario = await novoUsuario()
    await app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${await contaDe(a)}, ${usuario}, 'administrador')`
    const r = await app<
      { tenant_id: string }[]
    >`SELECT * FROM app_empresas_da_conta_do_usuario(${usuario})`
    expect(r.map((x) => x.tenant_id).sort()).toEqual([a, b].sort())
    expect(r.map((x) => x.tenant_id)).not.toContain(c)
  })

  it('o financeiro e quem só é membro de uma empresa não têm consolidado', async () => {
    const [a] = [novoId()]
    await prepararTenants(owner, [a])
    const contaA =
      (
        await comTenant(
          owner,
          a,
          (tx) => tx<{ conta_id: string }[]>`SELECT conta_id FROM tenants WHERE id = ${a}`,
        )
      )[0]?.conta_id ?? ''
    const financeiro = await novoUsuario()
    const apenasMembro = await novoUsuario()
    await app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${contaA}, ${financeiro}, 'financeiro')`
    await entrar(a, apenasMembro, 'admin') // admin da empresa, mas não da conta
    for (const u of [financeiro, apenasMembro, novoId()]) {
      expect(await app`SELECT * FROM app_empresas_da_conta_do_usuario(${u})`).toHaveLength(0)
    }
  })

  it('só empresas em teste ou ativas; suspensas e canceladas ficam de fora', async () => {
    const [a, b, c] = [novoId(), novoId(), novoId()]
    await prepararTenants(owner, [a, b, c])
    const conta =
      (
        await comTenant(
          owner,
          a,
          (tx) => tx<{ conta_id: string }[]>`SELECT conta_id FROM tenants WHERE id = ${a}`,
        )
      )[0]?.conta_id ?? ''
    const usuario = await novoUsuario()
    await app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${conta}, ${usuario}, 'dono')`
    await comTenant(owner, b, (tx) => tx`UPDATE tenants SET situacao = 'suspenso' WHERE id = ${b}`)
    await comTenant(owner, c, (tx) => tx`UPDATE tenants SET situacao = 'cancelado' WHERE id = ${c}`)
    const r = await app<
      { tenant_id: string }[]
    >`SELECT * FROM app_empresas_da_conta_do_usuario(${usuario})`
    expect(r.map((x) => x.tenant_id)).toEqual([a])
  })

  it('pertence ao owner, SECURITY DEFINER, search_path fixo, só o app executa e a variável é limpa', async () => {
    const [f] = await owner<{ dono: string; definer: boolean; config: string[] }[]>`
      SELECT pg_get_userbyid(proowner) AS dono, prosecdef AS definer, proconfig AS config
      FROM pg_proc WHERE proname = 'app_empresas_da_conta_do_usuario'`
    expect(f).toEqual({
      dono: 'leadtogo_owner',
      definer: true,
      config: ['search_path=pg_catalog, pg_temp'],
    })
    const [p] = await owner<{ publico: boolean; app: boolean }[]>`
      SELECT has_function_privilege('public', 'app_empresas_da_conta_do_usuario(uuid)', 'EXECUTE') AS publico,
             has_function_privilege('leadtogo_app', 'app_empresas_da_conta_do_usuario(uuid)', 'EXECUTE') AS app`
    expect(p).toEqual({ publico: false, app: true })
    await app.begin(async (tx) => {
      await tx`SELECT * FROM app_empresas_da_conta_do_usuario(${novoId()})`
      const [v] = await tx<
        { v: string }[]
      >`SELECT current_setting('app.consolidado_usuario', true) AS v`
      expect(v?.v ?? '').toBe('')
    })
  })
})
