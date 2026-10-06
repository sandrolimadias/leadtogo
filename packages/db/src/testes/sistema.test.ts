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

async function novosTenants(n = 2): Promise<string[]> {
  const ids = Array.from({ length: n }, () => novoId())
  await prepararTenants(owner, ids)
  return ids
}

describe('auditoria (particionada por mês)', () => {
  it('é uma tabela particionada, com partições de -1 a +12 meses e a padrão', async () => {
    const [mae] = await owner<
      { relkind: string }[]
    >`SELECT relkind FROM pg_class WHERE relname = 'auditoria'`
    expect(mae?.relkind).toBe('p')
    const filhas = await owner<{ nome: string }[]>`
      SELECT c.relname AS nome FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'auditoria'::regclass ORDER BY 1`
    expect(filhas).toHaveLength(15) // 14 meses + default
    expect(filhas.map((f) => f.nome)).toContain('auditoria_default')
    const mesAtual = new Date().toISOString().slice(0, 7).replace('-', '_')
    expect(filhas.map((f) => f.nome)).toContain(`auditoria_${mesAtual}`)
  })

  it('cada linha cai na partição do mês (UTC) e datas fora do intervalo caem na padrão', async () => {
    const [a] = await novosTenants(1)
    const [dentro, longe] = await comTenant(app, a!, async (tx) => [
      (
        await tx<{ p: string }[]>`
        INSERT INTO auditoria (tenant_id, entidade, acao) VALUES (${a!}, 'empresas', 'criar')
        RETURNING tableoid::regclass::text AS p`
      )[0]?.p,
      (
        await tx<{ p: string }[]>`
        INSERT INTO auditoria (tenant_id, entidade, acao, em) VALUES (${a!}, 'empresas', 'criar', '2001-05-05 12:00:00+00')
        RETURNING tableoid::regclass::text AS p`
      )[0]?.p,
    ])
    expect(dentro).toBe(`auditoria_${new Date().toISOString().slice(0, 7).replace('-', '_')}`)
    expect(longe).toBe('auditoria_default')
  })

  it('criar_particao_auditoria é idempotente e só o owner executa', async () => {
    const primeira = await owner<
      { nome: string }[]
    >`SELECT criar_particao_auditoria('2031-03-15') AS nome`
    const segunda = await owner<
      { nome: string }[]
    >`SELECT criar_particao_auditoria('2031-03-01') AS nome`
    expect(primeira[0]?.nome).toBe('auditoria_2031_03')
    expect(segunda[0]?.nome).toBe('auditoria_2031_03')
    await expect(app`SELECT criar_particao_auditoria('2031-04-01')`).rejects.toThrow(
      /permission denied/,
    )
    await owner`DROP TABLE auditoria_2031_03`
  })

  it('o app insere e lê, mas não altera nem apaga', async () => {
    const [a] = await novosTenants(1)
    await comTenant(
      app,
      a!,
      (tx) => tx`INSERT INTO auditoria (tenant_id, entidade, acao) VALUES (${a!}, 'x', 'criar')`,
    )
    expect(await comTenant(app, a!, (tx) => tx`SELECT * FROM auditoria`)).toHaveLength(1)
    await expect(
      comTenant(app, a!, (tx) => tx`UPDATE auditoria SET acao = 'apagar'`),
    ).rejects.toThrow(/permission denied/)
    await expect(comTenant(app, a!, (tx) => tx`DELETE FROM auditoria`)).rejects.toThrow(
      /permission denied/,
    )
  })

  it('as partições não são acessíveis diretamente, nem pelo app nem pelo dono', async () => {
    const [a] = await novosTenants(1)
    await comTenant(
      app,
      a!,
      (tx) => tx`INSERT INTO auditoria (tenant_id, entidade, acao) VALUES (${a!}, 'x', 'criar')`,
    )
    const particao = `auditoria_${new Date().toISOString().slice(0, 7).replace('-', '_')}`
    await expect(app`SELECT * FROM ${app(particao)}`).rejects.toThrow(/permission denied/)
    // FORCE sem políticas: nem o dono lê as linhas pela partição (a leitura é pela tabela-mãe)
    expect(await comTenant(owner, a!, (tx) => tx`SELECT * FROM ${tx(particao)}`)).toHaveLength(0)
    expect(await comTenant(owner, a!, (tx) => tx`SELECT * FROM auditoria`)).toHaveLength(1)
    const [rls] = await owner<{ forca: boolean }[]>`
      SELECT relforcerowsecurity AS forca FROM pg_class WHERE relname = ${particao}`
    expect(rls?.forca).toBe(true)
  })

  it('a chave é (id, em) e o id é gerado pelo banco', async () => {
    const [a] = await novosTenants(1)
    const [r1, r2] = await comTenant(app, a!, async (tx) => [
      (
        await tx<
          { id: string }[]
        >`INSERT INTO auditoria (tenant_id, entidade, acao) VALUES (${a!}, 'x', 'a') RETURNING id`
      )[0],
      (
        await tx<
          { id: string }[]
        >`INSERT INTO auditoria (tenant_id, entidade, acao) VALUES (${a!}, 'x', 'b') RETURNING id`
      )[0],
    ])
    expect(Number(r2?.id)).toBeGreaterThan(Number(r1?.id))
    await expect(
      comTenant(
        app,
        a!,
        (tx) =>
          tx`INSERT INTO auditoria (id, tenant_id, entidade, acao) VALUES (1, ${a!}, 'x', 'c')`,
      ),
    ).rejects.toThrow(/cannot insert a non-DEFAULT value|GENERATED ALWAYS/i)
  })

  it('a origem é restrita ao enum', async () => {
    const [a] = await novosTenants(1)
    await expect(
      comTenant(
        app,
        a!,
        (tx) =>
          tx`INSERT INTO auditoria (tenant_id, entidade, acao, origem) VALUES (${a!}, 'x', 'a', 'robo')`,
      ),
    ).rejects.toThrow(/invalid input value for enum/)
  })
})

describe('arquivos', () => {
  it('a chave do arquivo no S3 é única; logo do tenant e foto do membro apontam para arquivos', async () => {
    const [a, b] = await novosTenants(2)
    const chave = `${a!}/empresas/foto.jpg`
    const inserir = (t: string, id: string) =>
      comTenant(
        app,
        t,
        (tx) => tx`
        INSERT INTO arquivos (id, tenant_id, chave_arquivo, nome, mime, tamanho) VALUES (${id}, ${t}, ${chave}, 'f', 'image/jpeg', 1)`,
      )
    const arquivo = novoId()
    await inserir(a!, arquivo)
    await expect(inserir(b!, novoId())).rejects.toThrow(/duplicate key/)
    await comTenant(app, a!, (tx) => tx`UPDATE tenants SET logo_arquivo_id = ${arquivo}`)
    await expect(
      comTenant(app, a!, (tx) => tx`UPDATE tenants SET logo_arquivo_id = ${novoId()}`),
    ).rejects.toThrow(/foreign key/)
    await expect(
      comTenant(
        app,
        a!,
        (tx) =>
          tx`INSERT INTO membros (id, tenant_id, nome, foto_arquivo_id) VALUES (${novoId()}, ${a!}, 'X', ${novoId()})`,
      ),
    ).rejects.toThrow(/foreign key/)
  })
})

describe('notificacoes e eventos_outbox', () => {
  it('a notificação pertence a um membro e nasce não lida', async () => {
    const [a] = await novosTenants(1)
    const membro = novoId()
    await comTenant(
      app,
      a!,
      (tx) => tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membro}, ${a!}, 'M')`,
    )
    await comTenant(
      app,
      a!,
      (tx) =>
        tx`INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo) VALUES (${novoId()}, ${a!}, ${membro}, 'tarefa', 'Ligar')`,
    )
    const [n] = await comTenant(app, a!, (tx) => tx`SELECT lida_em FROM notificacoes`)
    expect(n?.['lida_em']).toBeNull()
    await expect(
      comTenant(
        app,
        a!,
        (tx) =>
          tx`INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo) VALUES (${novoId()}, ${a!}, ${novoId()}, 'x', 'y')`,
      ),
    ).rejects.toThrow(/foreign key/)
  })

  it('o evento nasce pendente (processado_em nulo) com payload vazio', async () => {
    const [a] = await novosTenants(1)
    await comTenant(
      app,
      a!,
      (tx) =>
        tx`INSERT INTO eventos_outbox (id, tenant_id, tipo) VALUES (${novoId()}, ${a!}, 'empresa.criada')`,
    )
    const [e] = await comTenant(
      app,
      a!,
      (tx) => tx`SELECT processado_em, payload FROM eventos_outbox`,
    )
    expect(e).toMatchObject({ processado_em: null, payload: {} })
  })
})
