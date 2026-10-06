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

async function novoUsuario(email = `u-${novoId()}@exemplo.com`): Promise<string> {
  const id = novoId()
  await app`INSERT INTO auth."user" (id, name, email) VALUES (${id}, 'Fulano', ${email})`
  return id
}

describe('schema auth (Better Auth, só identidade)', () => {
  it('tem as cinco tabelas, com id uuid, e nenhuma tabela de organização', async () => {
    const tabelas = await owner<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'auth' ORDER BY 1`
    expect(tabelas.map((t) => t.tablename)).toEqual([
      'account',
      'session',
      'two_factor',
      'user',
      'verification',
    ])
    const ids = await owner<{ tipo: string }[]>`
      SELECT DISTINCT format_type(atttypid, atttypmod) AS tipo FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth' AND a.attname = 'id' AND c.relkind = 'r'`
    expect(ids.map((i) => i.tipo)).toEqual(['uuid'])
  })

  it('o app opera a identidade, mas não altera a estrutura', async () => {
    const id = await novoUsuario()
    await app`UPDATE auth."user" SET name = 'Outro' WHERE id = ${id}`
    await app`DELETE FROM auth."user" WHERE id = ${id}`
    await expect(app`CREATE TABLE auth.intruso (id int)`).rejects.toThrow(/permission denied/)
    await expect(app`DROP TABLE auth."user"`).rejects.toThrow(/must be owner|permission denied/)
  })

  it('o e-mail é único sem diferenciar maiúsculas (citext)', async () => {
    const email = `Ana-${novoId()}@Exemplo.com`
    await novoUsuario(email)
    await expect(novoUsuario(email.toLowerCase())).rejects.toThrow(/duplicate key/)
    const [u] = await app`SELECT 1 FROM auth."user" WHERE email = ${email.toUpperCase()}`
    expect(u).toBeDefined()
  })

  it('apagar o usuário apaga sessões, contas e o segredo do 2FA', async () => {
    const id = await novoUsuario()
    await app`INSERT INTO auth.session (id, expires_at, token, user_id) VALUES (${novoId()}, now() + interval '1 day', ${novoId()}, ${id})`
    await app`INSERT INTO auth.account (id, account_id, provider_id, user_id, password) VALUES (${novoId()}, ${id}, 'credential', ${id}, 'hash')`
    await app`INSERT INTO auth.two_factor (id, secret, backup_codes, user_id) VALUES (${novoId()}, 's', 'b', ${id})`
    await app`DELETE FROM auth."user" WHERE id = ${id}`
    for (const t of ['session', 'account', 'two_factor']) {
      expect(
        await owner`SELECT 1 FROM ${owner('auth')}.${owner(t)} WHERE user_id = ${id}`,
        t,
      ).toHaveLength(0)
    }
  })

  it('o token da sessão é único e a conta externa não repete por provedor', async () => {
    const id = await novoUsuario()
    const token = novoId()
    const sessao = (t: string) =>
      app`INSERT INTO auth.session (id, expires_at, token, user_id) VALUES (${novoId()}, now() + interval '1 day', ${t}, ${id})`
    await sessao(token)
    await expect(sessao(token)).rejects.toThrow(/duplicate key/)
    const conta = () =>
      app`INSERT INTO auth.account (id, account_id, provider_id, user_id) VALUES (${novoId()}, 'g-123', 'google', ${id})`
    await conta()
    await expect(conta()).rejects.toThrow(/duplicate key/)
  })
})

describe('ligações do CRM com a identidade', () => {
  it('membros.usuario_id aponta para auth.user; usuário apagado deixa o membro sem login', async () => {
    const tenant = novoId()
    await prepararTenants(owner, [tenant])
    const usuario = await novoUsuario()
    await comTenant(
      app,
      tenant,
      (tx) =>
        tx`INSERT INTO membros (id, tenant_id, nome, usuario_id) VALUES (${novoId()}, ${tenant}, 'Com login', ${usuario})`,
    )
    await expect(
      comTenant(
        app,
        tenant,
        (tx) =>
          tx`INSERT INTO membros (id, tenant_id, nome, usuario_id) VALUES (${novoId()}, ${tenant}, 'X', ${novoId()})`,
      ),
    ).rejects.toThrow(/foreign key/)
    await app`DELETE FROM auth."user" WHERE id = ${usuario}`
    const [m] = await comTenant(
      app,
      tenant,
      (tx) => tx`SELECT nome, usuario_id FROM membros WHERE nome = 'Com login'`,
    )
    expect(m).toEqual({ nome: 'Com login', usuario_id: null })
  })

  it('conta_administradores.usuario_id é FK e não deixa apagar quem ainda administra', async () => {
    const usuario = await novoUsuario()
    const conta = novoId()
    await app`INSERT INTO contas (id, nome) VALUES (${conta}, 'Grupo')`
    await app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${conta}, ${usuario}, 'dono')`
    await expect(
      app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${conta}, ${novoId()}, 'administrador')`,
    ).rejects.toThrow(/foreign key/)
    await expect(app`DELETE FROM auth."user" WHERE id = ${usuario}`).rejects.toThrow(/foreign key/)
  })

  it('session.empresa_ativa_id aponta para tenants e zera se a empresa sair', async () => {
    const tenant = novoId()
    await prepararTenants(owner, [tenant])
    const usuario = await novoUsuario()
    const sessao = novoId()
    await app`INSERT INTO auth.session (id, expires_at, token, user_id, empresa_ativa_id)
              VALUES (${sessao}, now() + interval '1 day', ${novoId()}, ${usuario}, ${tenant})`
    await expect(
      app`UPDATE auth.session SET empresa_ativa_id = ${novoId()} WHERE id = ${sessao}`,
    ).rejects.toThrow(/foreign key/)
    await comTenant(owner, tenant, (tx) => tx`DELETE FROM tenants WHERE id = ${tenant}`)
    const [s] = await app`SELECT empresa_ativa_id FROM auth.session WHERE id = ${sessao}`
    expect(s?.['empresa_ativa_id']).toBeNull()
  })
})
