import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner, type Sql } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const owner = conectarOwner()
const app = conectarApp()
afterAll(async () => {
  await owner.end()
  await app.end()
})

type Sessao = { acesso: string; empresa: string; contato: string }

const comoCliente = <T>(
  c: { tenantId: string },
  sessao: Sessao,
  fn: (tx: Parameters<Parameters<Sql['begin']>[1]>[0]) => Promise<T>,
) =>
  comTenant(app, c.tenantId, async (tx) => {
    await tx`SELECT set_config('app.portal_acesso_id', ${sessao.acesso}, true)`
    await tx`SELECT set_config('app.portal_empresa_id', ${sessao.empresa}, true)`
    await tx`SELECT set_config('app.portal_contato_id', ${sessao.contato}, true)`
    return fn(tx)
  })

async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const ids = {
    membro: novoId(),
    empresaA: novoId(),
    empresaB: novoId(),
    contatoA: novoId(),
    contatoB: novoId(),
    acessoA: novoId(),
    acessoB: novoId(),
    paraTodos: novoId(),
    soParaA: novoId(),
    soParaB: novoId(),
    infectado: novoId(),
    emVerificacao: novoId(),
    oculto: novoId(),
    excluido: novoId(),
  }
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.membro}, ${tenantId}, 'Equipe')`
    for (const [empresa, nome] of [
      [ids.empresaA, 'Cliente A'],
      [ids.empresaB, 'Cliente B'],
    ] as const) {
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresa}, ${tenantId}, ${nome}, ${ids.membro})`
    }
    for (const [contato, empresa, acesso] of [
      [ids.contatoA, ids.empresaA, ids.acessoA],
      [ids.contatoB, ids.empresaB, ids.acessoB],
    ] as const) {
      await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${contato}, ${tenantId}, 'Contato')`
      await tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (${novoId()}, ${tenantId}, ${empresa}, ${contato})`
      await tx`INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email, situacao)
        VALUES (${acesso}, ${tenantId}, ${contato}, ${empresa}, ${`${acesso}@exemplo.com.br`}, 'ativo')`
    }
    const doc = (
      id: string,
      titulo: string,
      extra: {
        alcance?: 'todos' | 'empresas'
        estado?: string
        visivel?: boolean
        enviado?: boolean
        excluido?: boolean
      } = {},
    ) =>
      tx`INSERT INTO documentos (id, tenant_id, titulo, alcance, chave_arquivo, nome, mime, tamanho, estado,
          assinatura, enviado_em, visivel_no_portal, excluido_em)
        VALUES (${id}, ${tenantId}, ${titulo}, ${extra.alcance ?? 'todos'}::alcance_documento,
          ${`${tenantId}/documentos/${id}`}, 'arquivo.pdf', 'application/pdf', 2048,
          ${extra.estado ?? 'limpo'}::estado_anexo, ${extra.estado === 'infectado' ? 'Eicar-Test' : null},
          ${extra.enviado === false ? null : new Date()}, ${extra.visivel ?? true},
          ${extra.excluido ? new Date() : null})`
    await doc(ids.paraTodos, 'Para todos')
    await doc(ids.soParaA, 'Só para A', { alcance: 'empresas' })
    await doc(ids.soParaB, 'Só para B', { alcance: 'empresas' })
    await doc(ids.infectado, 'Infectado', { estado: 'infectado' })
    await doc(ids.emVerificacao, 'Em verificação', { estado: 'pendente_varredura' })
    await doc(ids.oculto, 'Oculto', { visivel: false })
    await doc(ids.excluido, 'Excluído', { excluido: true })
    await tx`INSERT INTO documento_empresas (id, tenant_id, documento_id, empresa_id) VALUES (${novoId()}, ${tenantId}, ${ids.soParaA}, ${ids.empresaA})`
    await tx`INSERT INTO documento_empresas (id, tenant_id, documento_id, empresa_id) VALUES (${novoId()}, ${tenantId}, ${ids.soParaB}, ${ids.empresaB})`
  })
  const sessaoA: Sessao = { acesso: ids.acessoA, empresa: ids.empresaA, contato: ids.contatoA }
  const sessaoB: Sessao = { acesso: ids.acessoB, empresa: ids.empresaB, contato: ids.contatoB }
  return { tenantId, ids, sessaoA, sessaoB }
}

describe('documentos: o que o cliente enxerga', () => {
  it('só os limpos, visíveis, não excluídos e do alcance da empresa dele', async () => {
    const c = await cenario()
    const titulosDe = async (s: Sessao) =>
      (await comoCliente(c, s, (tx) => tx`SELECT titulo FROM documentos`))
        .map((l) => String(l['titulo']))
        .sort()
    expect(await titulosDe(c.sessaoA)).toEqual(['Para todos', 'Só para A'])
    expect(await titulosDe(c.sessaoB)).toEqual(['Para todos', 'Só para B'])
  })

  it('a equipe vê tudo, inclusive infectado, em verificação, oculto e excluído', async () => {
    const c = await cenario()
    await comTenant(app, c.tenantId, async (tx) => {
      expect(await tx`SELECT id FROM documentos`).toHaveLength(7)
    })
  })

  it('o cliente não cria, altera nem apaga documento nem alcance', async () => {
    const c = await cenario()
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO documentos (id, tenant_id, titulo, chave_arquivo, nome, mime, tamanho)
            VALUES (${novoId()}, ${c.tenantId}, 'X', 'k', 'a.pdf', 'application/pdf', 10)`,
      ),
    ).rejects.toThrow(/row-level security/)
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`UPDATE documentos SET titulo = 'Mudou' RETURNING id`).toHaveLength(0)
      expect(await tx`DELETE FROM documentos RETURNING id`).toHaveLength(0)
      expect(await tx`DELETE FROM documento_empresas RETURNING id`).toHaveLength(0)
    })
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO documento_empresas (id, tenant_id, documento_id, empresa_id)
            VALUES (${novoId()}, ${c.tenantId}, ${c.ids.paraTodos}, ${c.ids.empresaA})`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('só enxerga as próprias linhas de alcance e a sessão fica presa ao tenant', async () => {
    const c = await cenario()
    const outro = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      const linhas = await tx`SELECT empresa_id FROM documento_empresas`
      expect(linhas.map((l) => String(l['empresa_id']))).toEqual([c.ids.empresaA])
      expect(await tx`SELECT id FROM documentos WHERE id = ${outro.ids.paraTodos}`).toHaveLength(0)
    })
  })
})

describe('documentos: downloads', () => {
  const baixar = (
    c: Awaited<ReturnType<typeof cenario>>,
    s: Sessao,
    documento: string,
    acesso = s.acesso,
    empresa = s.empresa,
  ) =>
    comoCliente(
      c,
      s,
      (tx) =>
        tx`INSERT INTO documento_acessos (id, tenant_id, documento_id, acesso_id, empresa_id)
          VALUES (${novoId()}, ${c.tenantId}, ${documento}, ${acesso}, ${empresa})`,
    )
  const total = (c: Awaited<ReturnType<typeof cenario>>, documento: string) =>
    comTenant(owner, c.tenantId, async (tx) => {
      const [d] = await tx`SELECT total_downloads FROM documentos WHERE id = ${documento}`
      return Number(d?.['total_downloads'])
    })

  it('registra o download e o gatilho soma no total; o cliente vê só os próprios registros', async () => {
    const c = await cenario()
    await baixar(c, c.sessaoA, c.ids.paraTodos)
    await baixar(c, c.sessaoA, c.ids.paraTodos)
    await baixar(c, c.sessaoB, c.ids.paraTodos)
    expect(await total(c, c.ids.paraTodos)).toBe(3)
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM documento_acessos`).toHaveLength(2)
      expect(await tx`UPDATE documento_acessos SET baixado_em = now() RETURNING id`).toHaveLength(0)
      expect(await tx`DELETE FROM documento_acessos RETURNING id`).toHaveLength(0)
    })
    expect(await total(c, c.ids.paraTodos)).toBe(3)
  })

  it('não registra download de documento que não enxerga, nem em nome de outro acesso ou empresa', async () => {
    const c = await cenario()
    for (const documento of [
      c.ids.soParaB,
      c.ids.infectado,
      c.ids.emVerificacao,
      c.ids.oculto,
      c.ids.excluido,
    ]) {
      await expect(baixar(c, c.sessaoA, documento)).rejects.toThrow(/row-level security/)
    }
    await expect(baixar(c, c.sessaoA, c.ids.paraTodos, c.ids.acessoB)).rejects.toThrow(
      /row-level security/,
    )
    await expect(
      baixar(c, c.sessaoA, c.ids.paraTodos, c.ids.acessoA, c.ids.empresaB),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('documentos: regras da tabela', () => {
  it('o infectado exige a assinatura e o tamanho fica entre 1 byte e 25 MB', async () => {
    const c = await cenario()
    const inserir = (extra: { estado?: string; tamanho?: number }) =>
      comTenant(
        owner,
        c.tenantId,
        (tx) =>
          tx`INSERT INTO documentos (id, tenant_id, titulo, chave_arquivo, nome, mime, tamanho, estado)
            VALUES (${novoId()}, ${c.tenantId}, 'T', ${novoId()}, 'a.pdf', 'application/pdf',
              ${extra.tamanho ?? 10}, ${extra.estado ?? 'limpo'}::estado_anexo)`,
      )
    await expect(inserir({ estado: 'infectado' })).rejects.toThrow(/documentos_infectado_chk/)
    await expect(inserir({ tamanho: 0 })).rejects.toThrow(/documentos_tamanho_chk/)
    await expect(inserir({ tamanho: 25 * 1024 * 1024 + 1 })).rejects.toThrow(
      /documentos_tamanho_chk/,
    )
    await inserir({ tamanho: 25 * 1024 * 1024 })
  })

  it('a chave do arquivo é única', async () => {
    const c = await cenario()
    const chave = novoId()
    const inserir = () =>
      comTenant(
        owner,
        c.tenantId,
        (tx) =>
          tx`INSERT INTO documentos (id, tenant_id, titulo, chave_arquivo, nome, mime, tamanho)
            VALUES (${novoId()}, ${c.tenantId}, 'T', ${chave}, 'a.pdf', 'application/pdf', 10)`,
      )
    await inserir()
    await expect(inserir()).rejects.toThrow(/documentos_chave_uq/)
  })
})
