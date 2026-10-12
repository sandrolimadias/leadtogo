import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner } from './conexoes.js'
import { fabricas, prepararTenants } from './fabricas.js'
import { testarComportamento } from './isolamento.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

/** Usuário de verdade (auth.user): usuario_id agora é FK. */
async function novoUsuario(): Promise<string> {
  const id = novoId()
  await app`INSERT INTO auth."user" (id, name, email) VALUES (${id}, 'Usuário', ${`u-${id}@exemplo.com`})`
  return id
}

async function novosTenants(n = 2): Promise<string[]> {
  const ids = Array.from({ length: n }, () => novoId())
  await prepararTenants(owner, ids)
  return ids
}

describe('tenants (isolado pela coluna id)', () => {
  it('o tenant A não lê nem grava dados do B, com o app e com o owner', async () => {
    const tenants = fabricas['tenants']
    if (!tenants) throw new Error('Sem fábrica de tenants')
    await testarComportamento(
      { app, owner, tenantA: novoId(), tenantB: novoId() },
      'tenants',
      tenants,
    )
  })

  it('sem tenant ativo o app não enxerga nenhuma empresa', async () => {
    await novosTenants(1)
    expect(await app`SELECT id FROM tenants`).toHaveLength(0)
  })

  it('o consolidado lista as empresas liberadas, só para leitura', async () => {
    const [a, b, c] = await novosTenants(3)
    const vistas = await comTenant(app, a!, (tx) => tx<{ id: string }[]>`SELECT id FROM tenants`, [
      a!,
      b!,
    ])
    expect(vistas.map((v) => v.id).sort()).toEqual([a, b].sort())
    expect(vistas.map((v) => v.id)).not.toContain(c)
  })

  it('tem padrões de fuso, moeda e situação, e o CNPJ pode repetir entre empresas (sem unicidade global)', async () => {
    const [a, b] = await novosTenants(2)
    const [t] = await comTenant(
      app,
      a!,
      (tx) => tx`SELECT fuso_horario, moeda, situacao, pais_codigo FROM tenants`,
    )
    expect(t).toMatchObject({
      fuso_horario: 'America/Sao_Paulo',
      moeda: 'BRL',
      situacao: 'teste',
      pais_codigo: 105, // Brasil, no código da Receita
    })
    await comTenant(owner, a!, (tx) => tx`UPDATE tenants SET cnpj = '12ABC34501DE35'`)
    // sem unicidade global: repetir não falha (e não revela que outra conta usa o CNPJ)
    await comTenant(owner, b!, (tx) => tx`UPDATE tenants SET cnpj = '12ABC34501DE35'`)
  })

  it('exige conta e município existente', async () => {
    const id = novoId()
    await expect(
      comTenant(
        owner,
        id,
        (tx) =>
          tx`INSERT INTO tenants (id, razao_social, conta_id) VALUES (${id}, 'X', ${novoId()})`,
      ),
    ).rejects.toThrow(/foreign key/)
    const [a] = await novosTenants(1)
    await expect(
      comTenant(owner, a!, (tx) => tx`UPDATE tenants SET municipio_codigo = 1`),
    ).rejects.toThrow(/foreign key/)
  })
})

describe('tenant_configuracoes', () => {
  it('nasce com os padrões do modelo', async () => {
    const [a] = await novosTenants(1)
    await comTenant(
      app,
      a!,
      (tx) => tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${a!})`,
    )
    const [c] = await comTenant(app, a!, (tx) => tx`SELECT * FROM tenant_configuracoes`)
    expect(c).toMatchObject({
      vendedor_ve_todas_empresas: false,
      dias_sem_contato_alerta: 60,
      dias_validade_tag_visita: null,
      status_cliente_ao_conquistar: true,
      rastreio_email_padrao: false,
      dois_fatores_exigido: 'admin',
      whatsapp_modo_importacao: 'desligado',
      preferencias: {},
    })
  })

  it('é 1:1 com o tenant', async () => {
    const [a] = await novosTenants(1)
    await comTenant(
      app,
      a!,
      (tx) => tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${a!})`,
    )
    await expect(
      comTenant(app, a!, (tx) => tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${a!})`),
    ).rejects.toThrow(/duplicate key/)
  })
})

describe('membros', () => {
  const inserir = (
    tenantId: string,
    campos: { email?: string | null; usuario?: string | null; papel?: string } = {},
  ) =>
    comTenant(
      app,
      tenantId,
      (tx) => tx`
        INSERT INTO membros (id, tenant_id, nome, email, usuario_id, papel)
        VALUES (${novoId()}, ${tenantId}, 'Fulano', ${campos.email ?? null}, ${campos.usuario ?? null}, ${campos.papel ?? 'vendedor'})`,
    )

  it('e-mail é único por tenant sem diferenciar caixa; o mesmo e-mail pode existir em outro tenant', async () => {
    const [a, b] = await novosTenants(2)
    await inserir(a!, { email: 'Ana@Exemplo.com' })
    await expect(inserir(a!, { email: 'ana@exemplo.com' })).rejects.toThrow(/duplicate key/)
    await inserir(b!, { email: 'ana@exemplo.com' })
  })

  it('o e-mail de um membro excluído (lixeira) não bloqueia o recadastro', async () => {
    const [a] = await novosTenants(1)
    await inserir(a!, { email: 'lixo@exemplo.com' })
    await comTenant(
      app,
      a!,
      (tx) => tx`UPDATE membros SET excluido_em = now() WHERE email = 'lixo@exemplo.com'`,
    )
    await inserir(a!, { email: 'lixo@exemplo.com' })
  })

  it('vários vendedores sem e-mail e sem login (usuario_id nulo) convivem', async () => {
    const [a] = await novosTenants(1)
    await inserir(a!)
    await inserir(a!)
  })

  it('o mesmo usuário é membro de várias empresas, com papel próprio em cada uma, mas só uma vez por empresa', async () => {
    const [a, b] = await novosTenants(2)
    const usuario = await novoUsuario()
    await inserir(a!, { usuario, papel: 'admin' })
    await inserir(b!, { usuario, papel: 'vendedor' })
    await expect(inserir(a!, { usuario, papel: 'gestor' })).rejects.toThrow(/duplicate key/)
    const papeis = await comTenant(
      app,
      a!,
      (tx) =>
        tx<
          { papel: string }[]
        >`SELECT papel FROM membros WHERE usuario_id = ${usuario} ORDER BY papel`,
      [a!, b!],
    )
    expect(papeis.map((p) => p.papel)).toEqual(['admin', 'vendedor'])
  })

  it('o papel é restrito a admin, gestor e vendedor', async () => {
    const [a] = await novosTenants(1)
    await expect(inserir(a!, { papel: 'dono' })).rejects.toThrow(/invalid input value for enum/)
  })

  it('o gestor é um membro (hierarquia da equipe)', async () => {
    const [a] = await novosTenants(1)
    await expect(
      comTenant(
        app,
        a!,
        (tx) =>
          tx`INSERT INTO membros (id, tenant_id, nome, gestor_id) VALUES (${novoId()}, ${a!}, 'X', ${novoId()})`,
      ),
    ).rejects.toThrow(/foreign key/)
  })

  it('com A ativo e o consolidado A+B, o app não grava membro em B', async () => {
    const [a, b] = await novosTenants(2)
    await expect(
      comTenant(
        app,
        a!,
        (tx) =>
          tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${novoId()}, ${b!}, 'Intruso')`,
        [a!, b!],
      ),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('contas e conta_administradores (sem RLS por tenant)', () => {
  it('o app lê e grava; o papel do administrador é restrito', async () => {
    const conta = novoId()
    await app`INSERT INTO contas (id, nome) VALUES (${conta}, 'Grupo')`
    const usuario = await novoUsuario()
    await app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${conta}, ${usuario}, 'dono')`
    await expect(
      app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${conta}, ${await novoUsuario()}, 'chefe')`,
    ).rejects.toThrow(/invalid input value for enum/)
    await expect(
      app`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${conta}, ${usuario}, 'financeiro')`,
    ).rejects.toThrow(/duplicate key/)
  })
})
