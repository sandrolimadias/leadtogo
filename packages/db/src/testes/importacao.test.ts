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

async function novoTenant(): Promise<string> {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  return tenantId
}

const criarPerfil = (tenantId: string, nome: string) =>
  comTenant(app, tenantId, async (tx) => {
    const id = novoId()
    await tx`INSERT INTO importacao_perfis (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${nome})`
    return id
  })

const criarLote = (tenantId: string, intervaloMs = 3000) =>
  comTenant(app, tenantId, async (tx) => {
    const id = novoId()
    await tx`
      INSERT INTO importacoes (id, tenant_id, nome, nome_arquivo, intervalo_ms)
      VALUES (${id}, ${tenantId}, 'Lote', 'carteira.xlsx', ${intervaloMs})`
    return id
  })

describe('importacao_perfis', () => {
  it('nasce com as regras padrão e o nome é único por empresa, sem diferença de caixa', async () => {
    const tenantId = await novoTenant()
    const id = await criarPerfil(tenantId, 'Metalurgia')
    const [p] = await comTenant(
      app,
      tenantId,
      (tx) => tx`
        SELECT exige_situacao_ativa, estabelecimento::text AS estabelecimento, excluir_mei,
               cnaes, aceitar_cnae_secundario, acao_fora_do_perfil::text AS acao, ativo
        FROM importacao_perfis WHERE id = ${id}`,
    )
    expect(p).toEqual({
      exige_situacao_ativa: true,
      estabelecimento: 'ambas',
      excluir_mei: false,
      cnaes: [],
      aceitar_cnae_secundario: false,
      acao: 'pular',
      ativo: true,
    })
    await expect(criarPerfil(tenantId, 'METALURGIA')).rejects.toThrow(/importacao_perfis_nome_uq/)
    // Em outra empresa o mesmo nome vale
    await expect(criarPerfil(await novoTenant(), 'Metalurgia')).resolves.toBeTruthy()
  })
})

describe('importacoes e importacao_linhas', () => {
  it('o intervalo entre consultas à Receita fica entre 500 ms e 60 s', async () => {
    const tenantId = await novoTenant()
    await expect(criarLote(tenantId, 499)).rejects.toThrow(/importacoes_intervalo/)
    await expect(criarLote(tenantId, 60_001)).rejects.toThrow(/importacoes_intervalo/)
    await expect(criarLote(tenantId, 500)).resolves.toBeTruthy()
  })

  it('o lote nasce sem espera nem progresso registrados (colunas dos blocos)', async () => {
    const tenantId = await novoTenant()
    const id = await criarLote(tenantId)
    const [l] = await comTenant(
      app,
      tenantId,
      (tx) => tx`SELECT proxima_consulta_em, ultimo_progresso_em FROM importacoes WHERE id = ${id}`,
    )
    expect(l).toEqual({ proxima_consulta_em: null, ultimo_progresso_em: null })
  })

  it('o número da linha é único no lote, mas o mesmo número vale em outro lote', async () => {
    const tenantId = await novoTenant()
    const [a, b] = [await criarLote(tenantId), await criarLote(tenantId)]
    const linha = (lote: string, numero: number) =>
      comTenant(
        app,
        tenantId,
        (tx) =>
          tx`INSERT INTO importacao_linhas (id, tenant_id, importacao_id, numero, dados)
           VALUES (${novoId()}, ${tenantId}, ${lote}, ${numero}, '{}'::jsonb)`,
      )
    await linha(a, 1)
    await expect(linha(a, 1)).rejects.toThrow(/importacao_linhas_numero_uq/)
    await expect(linha(b, 1)).resolves.toBeTruthy()
  })

  it('a linha nasce pendente; a empresa guarda o lote que a criou', async () => {
    const tenantId = await novoTenant()
    const lote = await criarLote(tenantId)
    const empresaId = novoId()
    const linhaId = novoId()
    const [l] = await comTenant(app, tenantId, async (tx) => {
      const membroId = novoId()
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Vendedor')`
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id, importacao_id)
               VALUES (${empresaId}, ${tenantId}, 'Empresa', ${membroId}, ${lote})`
      await tx`INSERT INTO importacao_linhas (id, tenant_id, importacao_id, numero, dados, empresa_id)
               VALUES (${linhaId}, ${tenantId}, ${lote}, 1, '{}'::jsonb, ${empresaId})`
      return tx`SELECT resultado::text AS resultado FROM importacao_linhas WHERE id = ${linhaId}`
    })
    expect(l).toEqual({ resultado: 'pendente' })
    await expect(
      comTenant(
        app,
        tenantId,
        (tx) => tx`UPDATE empresas SET importacao_id = ${novoId()} WHERE id = ${empresaId}`,
      ),
    ).rejects.toThrow(/empresas_importacao_id_importacoes_id_fk/)
  })
})
