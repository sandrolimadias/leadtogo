import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import {
  DEMONSTRACAO,
  deveSemearDemonstracao,
  semearDemonstracao,
  semearReferencias,
} from '../seeds/index.js'
import { comTenant, conectarApp, conectarDrizzleOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const { db, cliente: owner } = conectarDrizzleOwner()
const app = conectarApp()
const { contaId, tenantId, membroAdminId, emailAdmin } = DEMONSTRACAO

async function limpar() {
  await comTenant(owner, tenantId, async (tx) => {
    for (const tabela of [
      'motivos',
      'origens',
      'funil_fases',
      'funis',
      'tipos_atividade',
      'tags',
      'tag_grupos',
    ]) {
      await tx`DELETE FROM ${tx(tabela)} WHERE tenant_id = ${tenantId}`
    }
    await tx`DELETE FROM membros WHERE tenant_id = ${tenantId}`
    await tx`DELETE FROM tenant_configuracoes WHERE tenant_id = ${tenantId}`
    await tx`DELETE FROM tenants WHERE id = ${tenantId}`
  })
  await owner`DELETE FROM contas WHERE id = ${contaId}`
}

async function contagens() {
  const contar = async (consulta: Promise<{ n: number }[]>) => (await consulta)[0]?.n
  return {
    contas: await contar(
      owner<{ n: number }[]>`SELECT count(*)::int AS n FROM contas WHERE id = ${contaId}`,
    ),
    tenants: await contar(
      comTenant(
        owner,
        tenantId,
        (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM tenants`,
      ),
    ),
    configuracoes: await contar(
      comTenant(
        owner,
        tenantId,
        (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM tenant_configuracoes`,
      ),
    ),
    membros: await contar(
      comTenant(
        owner,
        tenantId,
        (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM membros`,
      ),
    ),
  }
}

beforeAll(async () => {
  await limpar()
  await semearReferencias(db) // o tenant aponta para Vitória (FK)
})
afterAll(async () => {
  await limpar()
  for (const t of ['municipios', 'cnaes', 'qualificacoes_socio', 'portes', 'paises', 'estados']) {
    await owner`DELETE FROM ${owner(t)}`
  }
  await owner.end()
  await app.end()
})

describe('tenant de demonstração', () => {
  it('cria a conta, o tenant, as configurações e um membro admin', async () => {
    await semearDemonstracao(db)
    expect(await contagens()).toEqual({ contas: 1, tenants: 1, configuracoes: 1, membros: 1 })

    const [t] = await comTenant(
      owner,
      tenantId,
      (tx) => tx`SELECT conta_id, municipio_codigo, situacao FROM tenants`,
    )
    expect(t).toEqual({ conta_id: contaId, municipio_codigo: 3205309, situacao: 'ativo' })
    const [m] = await comTenant(
      owner,
      tenantId,
      (tx) => tx`SELECT id, papel, email, usuario_id FROM membros`,
    )
    expect(m).toEqual({ id: membroAdminId, papel: 'admin', email: emailAdmin, usuario_id: null })
  })

  it('rodar de novo não duplica nada e corrige o que foi alterado', async () => {
    await comTenant(owner, tenantId, async (tx) => {
      await tx`UPDATE membros SET papel = 'vendedor', nome = 'Alterado'`
      await tx`UPDATE tenants SET razao_social = 'Alterada'`
    })
    await semearDemonstracao(db)
    await semearDemonstracao(db)
    expect(await contagens()).toEqual({ contas: 1, tenants: 1, configuracoes: 1, membros: 1 })
    const [m] = await comTenant(owner, tenantId, (tx) => tx`SELECT papel, nome FROM membros`)
    expect(m).toEqual({ papel: 'admin', nome: 'Administrador Demonstração' })
    const [t] = await comTenant(owner, tenantId, (tx) => tx`SELECT razao_social FROM tenants`)
    expect(t?.['razao_social']).toBe('Empresa Demonstração Ltda')
  })

  it('cria os cadastros padrão uma vez só: o que foi excluído não volta no próximo seed', async () => {
    const contarTags = () =>
      comTenant(
        owner,
        tenantId,
        (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM tags WHERE excluido_em IS NULL`,
      )
    await semearDemonstracao(db)
    expect((await contarTags())[0]?.n).toBe(6)
    await comTenant(
      owner,
      tenantId,
      (tx) => tx`UPDATE tags SET excluido_em = now() WHERE nome = 'Inativo'`,
    )
    await semearDemonstracao(db)
    expect((await contarTags())[0]?.n).toBe(5)
  })

  it('não mexe nas configurações que o usuário ajustou', async () => {
    await comTenant(
      owner,
      tenantId,
      (tx) => tx`UPDATE tenant_configuracoes SET dias_sem_contato_alerta = 90`,
    )
    await semearDemonstracao(db)
    const [c] = await comTenant(
      owner,
      tenantId,
      (tx) => tx`SELECT dias_sem_contato_alerta FROM tenant_configuracoes`,
    )
    expect(c?.['dias_sem_contato_alerta']).toBe(90)
  })

  it('o isolamento vale também para o tenant de demonstração', async () => {
    // outra empresa, com membros próprios, não aparece para a demonstração
    const outro = novoId()
    await prepararTenants(owner, [outro])
    await comTenant(
      owner,
      outro,
      (tx) =>
        tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${novoId()}, ${outro}, 'De outra empresa')`,
    )
    const vistos = await comTenant(
      app,
      tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM membros`,
    )
    expect(vistos.map((v) => v.id)).toEqual([membroAdminId])
    expect(await comTenant(app, novoId(), (tx) => tx`SELECT id FROM membros`)).toHaveLength(0)
    expect(await comTenant(app, outro, (tx) => tx`SELECT id FROM membros`)).toHaveLength(1)
  })

  it('só roda fora de produção', () => {
    expect(deveSemearDemonstracao({ NODE_ENV: 'development' })).toBe(true)
    expect(deveSemearDemonstracao({})).toBe(true)
    expect(deveSemearDemonstracao({ NODE_ENV: 'production' })).toBe(false)
  })
})
