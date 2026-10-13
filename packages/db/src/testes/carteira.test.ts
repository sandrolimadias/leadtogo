import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  // As linhas de teste de empresa_cnaes seguram os CNAEs de teste (FK): sai tudo, sem RLS, pelo TRUNCATE
  await owner`TRUNCATE empresa_cnaes`
  await owner`DELETE FROM cnaes WHERE codigo IN (9999901, 9999902, 9999903, 9999905, 9900001)`
  await app.end()
  await owner.end()
})

async function novoTenant(): Promise<{ tenantId: string; membroId: string }> {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const membroId = await comTenant(owner, tenantId, async (tx) => {
    const id = novoId()
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Vendedor')`
    return id
  })
  return { tenantId, membroId }
}

const criarEmpresa = (
  tenantId: string,
  vendedorId: string,
  campos: { documento?: string; tipo?: string; razao?: string } = {},
) =>
  comTenant(app, tenantId, async (tx) => {
    const id = novoId()
    await tx`
      INSERT INTO empresas (id, tenant_id, tipo_documento, documento, razao_social, vendedor_id)
      VALUES (${id}, ${tenantId}, ${campos.tipo ?? 'cnpj'}::tipo_documento, ${campos.documento ?? null}, ${campos.razao ?? 'Empresa'}, ${vendedorId})`
    return id
  })

describe('empresas: documento e raiz do CNPJ', () => {
  it('a raiz é gerada dos 8 primeiros caracteres do CNPJ (alfanumérico inclusive) e só para CNPJ', async () => {
    const { tenantId, membroId } = await novoTenant()
    const a = await criarEmpresa(tenantId, membroId, { documento: '12345678000195' })
    const b = await criarEmpresa(tenantId, membroId, { documento: '12ABC34501DE35' })
    const c = await criarEmpresa(tenantId, membroId, { tipo: 'cpf', documento: '12345678909' })
    const d = await criarEmpresa(tenantId, membroId, { tipo: 'nenhum' })
    const raizes = await comTenant(
      app,
      tenantId,
      (tx) => tx<{ id: string; cnpj_raiz: string | null }[]>`SELECT id, cnpj_raiz FROM empresas`,
    )
    const por = Object.fromEntries(raizes.map((r) => [r.id, r.cnpj_raiz]))
    expect(por[a]).toBe('12345678')
    expect(por[b]).toBe('12ABC345')
    expect(por[c]).toBeNull()
    expect(por[d]).toBeNull()
  })

  it('o documento é único por empresa do grupo; excluída libera o recadastro; outra empresa pode repetir', async () => {
    const a = await novoTenant()
    const b = await novoTenant()
    const id = await criarEmpresa(a.tenantId, a.membroId, { documento: '12345678000195' })
    await expect(
      criarEmpresa(a.tenantId, a.membroId, { documento: '12345678000195' }),
    ).rejects.toThrow(/empresas_documento_uq/)
    await criarEmpresa(b.tenantId, b.membroId, { documento: '12345678000195' })
    await comTenant(
      app,
      a.tenantId,
      (tx) => tx`UPDATE empresas SET excluido_em = now() WHERE id = ${id}`,
    )
    await criarEmpresa(a.tenantId, a.membroId, { documento: '12345678000195' })
    // sem documento pode haver quantas quiser
    await criarEmpresa(a.tenantId, a.membroId, { tipo: 'nenhum' })
    await criarEmpresa(a.tenantId, a.membroId, { tipo: 'nenhum' })
  })

  it('país nulo significa Brasil e o regime padrão é "não informado"', async () => {
    const { tenantId, membroId } = await novoTenant()
    const id = await criarEmpresa(tenantId, membroId, { tipo: 'nenhum' })
    const [e] = await comTenant(
      app,
      tenantId,
      (tx) =>
        tx<
          {
            pais_codigo: number | null
            regime_tributario: string
            situacao_nao_verificada: boolean
          }[]
        >`
          SELECT pais_codigo, regime_tributario, situacao_nao_verificada FROM empresas WHERE id = ${id}`,
    )
    expect(e).toEqual({
      pais_codigo: null,
      regime_tributario: 'nao_informado',
      situacao_nao_verificada: false,
    })
  })
})

describe('empresas: filhas', () => {
  it('um CNAE principal por empresa, e o mesmo CNAE não repete na empresa', async () => {
    const { tenantId, membroId } = await novoTenant()
    await owner`
      INSERT INTO cnaes (codigo, descricao, secao, divisao, grupo, classe) VALUES
      (9999901, 'Teste 1', 'U', '99', '999', '99999'), (9999902, 'Teste 2', 'U', '99', '999', '99999'),
      (9999905, 'Teste 3', 'U', '99', '999', '99999')
      ON CONFLICT (codigo) DO NOTHING`
    const empresaId = await criarEmpresa(tenantId, membroId, { documento: '12345678000195' })
    await comTenant(
      app,
      tenantId,
      (tx) =>
        tx`INSERT INTO empresa_cnaes (tenant_id, empresa_id, cnae_codigo, principal) VALUES (${tenantId}, ${empresaId}, 9999901, true), (${tenantId}, ${empresaId}, 9999902, false)`,
    )
    await expect(
      comTenant(
        app,
        tenantId,
        (tx) =>
          tx`INSERT INTO empresa_cnaes (tenant_id, empresa_id, cnae_codigo, principal) VALUES (${tenantId}, ${empresaId}, 9999905, true)`,
      ),
    ).rejects.toThrow(/empresa_cnaes_principal_uq/)
    await expect(
      comTenant(
        app,
        tenantId,
        (tx) =>
          tx`INSERT INTO empresa_cnaes (tenant_id, empresa_id, cnae_codigo, principal) VALUES (${tenantId}, ${empresaId}, 9999901, false)`,
      ),
    ).rejects.toThrow(/duplicate key/)
  })

  it('a tag entra uma vez por empresa', async () => {
    const { tenantId, membroId } = await novoTenant()
    const empresaId = await criarEmpresa(tenantId, membroId, { tipo: 'nenhum' })
    const tagId = await comTenant(app, tenantId, async (tx) => {
      const g = novoId()
      const t = novoId()
      await tx`INSERT INTO tag_grupos (id, tenant_id, nome) VALUES (${g}, ${tenantId}, 'G')`
      await tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id) VALUES (${t}, ${tenantId}, 'T', ${g})`
      return t
    })
    await comTenant(
      app,
      tenantId,
      (tx) =>
        tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) VALUES (${tenantId}, ${empresaId}, ${tagId})`,
    )
    await expect(
      comTenant(
        app,
        tenantId,
        (tx) =>
          tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) VALUES (${tenantId}, ${empresaId}, ${tagId})`,
      ),
    ).rejects.toThrow(/duplicate key/)
  })
})

describe('app_registrar_cnae', () => {
  it('registra um CNAE que faltava, com a hierarquia e a seção derivadas, e é idempotente', async () => {
    await comTenant(
      app,
      novoId(),
      (tx) => tx`SELECT app_registrar_cnae(9999903, '  CNAE novo da Receita  ')`,
    )
    await comTenant(
      app,
      novoId(),
      (tx) => tx`SELECT app_registrar_cnae(9999903, 'Outra descrição')`,
    )
    const [c] = await owner`SELECT * FROM cnaes WHERE codigo = 9999903`
    expect(c).toMatchObject({
      codigo: 9999903,
      descricao: 'CNAE novo da Receita', // a primeira vale; a repetição não sobrescreve
      secao: 'U',
      divisao: '99',
      grupo: '999',
      classe: '99999',
    })
  })

  it('código de 6 dígitos (zero à esquerda) vira a hierarquia certa', async () => {
    await comTenant(app, novoId(), (tx) => tx`SELECT app_registrar_cnae(9900001, 'Divisão 99')`)
    const [c] = await owner`SELECT * FROM cnaes WHERE codigo = 9900001`
    expect(c).toMatchObject({ divisao: '99', secao: 'U' })
  })

  it('recusa código fora do intervalo, divisão desconhecida e descrição vazia ou enorme', async () => {
    for (const [codigo, descricao] of [
      [99999, 'curto'],
      [10000000, 'longo'],
      [9800001, 'divisão 98 não existe'],
      [9999904, '   '],
      [9999904, 'x'.repeat(301)],
    ] as const) {
      await expect(
        comTenant(app, novoId(), (tx) => tx`SELECT app_registrar_cnae(${codigo}, ${descricao})`),
        `${codigo}`,
      ).rejects.toThrow()
    }
  })

  it('o app não grava em cnaes direto (só pela função)', async () => {
    await expect(
      comTenant(
        app,
        novoId(),
        (tx) =>
          tx`INSERT INTO cnaes (codigo, descricao, secao, divisao, grupo, classe) VALUES (9999904, 'x', 'U', '99', '999', '99999')`,
      ),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('configuração do bloqueio de empresa não ativa', () => {
  it('vem ligada por padrão', async () => {
    const { tenantId } = await novoTenant()
    await comTenant(
      owner,
      tenantId,
      (tx) => tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`,
    )
    const [c] = await comTenant(
      owner,
      tenantId,
      (tx) =>
        tx<
          { bloquear_empresa_nao_ativa: boolean }[]
        >`SELECT bloquear_empresa_nao_ativa FROM tenant_configuracoes`,
    )
    expect(c?.bloquear_empresa_nao_ativa).toBe(true)
  })
})
