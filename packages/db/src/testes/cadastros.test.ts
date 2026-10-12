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
  const id = novoId()
  await prepararTenants(owner, [id])
  return id
}

describe('cadastros auxiliares: nomes únicos', () => {
  it('o nome é único por empresa sem diferença de caixa, e liberado após a exclusão', async () => {
    const t = await novoTenant()
    await comTenant(app, t, async (tx) => {
      await tx`INSERT INTO origens (id, tenant_id, nome) VALUES (${novoId()}, ${t}, 'Indicação')`
    })
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO origens (id, tenant_id, nome) VALUES (${novoId()}, ${t}, 'INDICAÇÃO')`,
      ),
    ).rejects.toThrow(/origens_nome_uq/)
    await comTenant(app, t, async (tx) => {
      await tx`UPDATE origens SET excluido_em = now() WHERE tenant_id = ${t}`
      await tx`INSERT INTO origens (id, tenant_id, nome) VALUES (${novoId()}, ${t}, 'Indicação')`
    })
  })

  it('o mesmo nome vale em empresas diferentes', async () => {
    const a = await novoTenant()
    const b = await novoTenant()
    for (const t of [a, b]) {
      await comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO verticais (id, tenant_id, nome) VALUES (${novoId()}, ${t}, 'Indústria')`,
      )
    }
  })

  it('tag repete o nome em grupos diferentes, mas não dentro do mesmo grupo', async () => {
    const t = await novoTenant()
    const [g1, g2] = [novoId(), novoId()]
    await comTenant(app, t, async (tx) => {
      await tx`INSERT INTO tag_grupos (id, tenant_id, nome) VALUES (${g1}, ${t}, 'G1'), (${g2}, ${t}, 'G2')`
      await tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id) VALUES (${novoId()}, ${t}, 'Ouro', ${g1}), (${novoId()}, ${t}, 'Ouro', ${g2})`
    })
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id) VALUES (${novoId()}, ${t}, 'ouro', ${g1})`,
      ),
    ).rejects.toThrow(/tags_nome_uq/)
  })

  it('a chave de sistema é única por empresa', async () => {
    const t = await novoTenant()
    const g = novoId()
    await comTenant(app, t, async (tx) => {
      await tx`INSERT INTO tag_grupos (id, tenant_id, nome) VALUES (${g}, ${t}, 'Status')`
      await tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id, chave_sistema) VALUES (${novoId()}, ${t}, 'Cliente', ${g}, 'cliente')`
    })
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id, chave_sistema) VALUES (${novoId()}, ${t}, 'Outro', ${g}, 'cliente')`,
      ),
    ).rejects.toThrow(/tags_chave_sistema_uq/)
  })
})

describe('cadastros auxiliares: funis e regras', () => {
  it('só um funil padrão por empresa', async () => {
    const t = await novoTenant()
    await comTenant(
      app,
      t,
      (tx) =>
        tx`INSERT INTO funis (id, tenant_id, nome, padrao) VALUES (${novoId()}, ${t}, 'Vendas', true), (${novoId()}, ${t}, 'Renovação', false)`,
    )
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO funis (id, tenant_id, nome, padrao) VALUES (${novoId()}, ${t}, 'Outro', true)`,
      ),
    ).rejects.toThrow(/funis_padrao_uq/)
  })

  it('mesmo com duas gravações simultâneas, o banco nunca aceita dois funis padrão', async () => {
    const t = await novoTenant()
    const tentar = (nome: string) =>
      comTenant(app, t, async (tx) => {
        await tx`INSERT INTO funis (id, tenant_id, nome, padrao) VALUES (${novoId()}, ${t}, ${nome}, true)`
        // segura a transação aberta para a outra disputar o índice
        await new Promise((r) => setTimeout(r, 300))
      })
    const resultados = await Promise.allSettled([tentar('A'), tentar('B'), tentar('C')])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    for (const r of resultados.filter((x) => x.status === 'rejected')) {
      expect(String(r.reason)).toMatch(/funis_padrao_uq/)
    }
    const [linha] = await comTenant(
      app,
      t,
      (tx) =>
        tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM funis WHERE padrao AND excluido_em IS NULL`,
    )
    expect(linha?.n).toBe(1)
  })

  it('a fase repete o nome em funis diferentes e valida probabilidade e dias de alerta', async () => {
    const t = await novoTenant()
    const [f1, f2] = [novoId(), novoId()]
    await comTenant(app, t, async (tx) => {
      await tx`INSERT INTO funis (id, tenant_id, nome) VALUES (${f1}, ${t}, 'A'), (${f2}, ${t}, 'B')`
      await tx`INSERT INTO funil_fases (id, tenant_id, nome, funil_id) VALUES (${novoId()}, ${t}, 'Proposta', ${f1}), (${novoId()}, ${t}, 'Proposta', ${f2})`
    })
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO funil_fases (id, tenant_id, nome, funil_id, probabilidade_padrao) VALUES (${novoId()}, ${t}, 'X', ${f1}, 101)`,
      ),
    ).rejects.toThrow(/funil_fases_probabilidade/)
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO funil_fases (id, tenant_id, nome, funil_id, dias_alerta_parada) VALUES (${novoId()}, ${t}, 'Y', ${f1}, 0)`,
      ),
    ).rejects.toThrow(/funil_fases_dias_alerta/)
  })

  it('motivo exige ao menos um status, e a cor fica na paleta', async () => {
    const t = await novoTenant()
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO motivos (id, tenant_id, nome, aplica_a) VALUES (${novoId()}, ${t}, 'Preço', '{}')`,
      ),
    ).rejects.toThrow(/motivos_aplica_a_nao_vazio/)
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO verticais (id, tenant_id, nome, cor) VALUES (${novoId()}, ${t}, 'V', 'magenta')`,
      ),
    ).rejects.toThrow(/cor_de_tag/)
  })
})
