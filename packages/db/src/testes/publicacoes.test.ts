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
    rascunho: novoId(),
    agendada: novoId(),
    excluida: novoId(),
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
    const publicar = (id: string, titulo: string, alcance: 'todos' | 'empresas') =>
      tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, alcance, publicada_em)
        VALUES (${id}, ${tenantId}, ${titulo}, 'Corpo', 'publicada', ${alcance}, now())`
    await publicar(ids.paraTodos, 'Para todos', 'todos')
    await publicar(ids.soParaA, 'Só para A', 'empresas')
    await publicar(ids.soParaB, 'Só para B', 'empresas')
    await tx`INSERT INTO publicacao_empresas (id, tenant_id, publicacao_id, empresa_id) VALUES (${novoId()}, ${tenantId}, ${ids.soParaA}, ${ids.empresaA})`
    await tx`INSERT INTO publicacao_empresas (id, tenant_id, publicacao_id, empresa_id) VALUES (${novoId()}, ${tenantId}, ${ids.soParaB}, ${ids.empresaB})`
    await tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo) VALUES (${ids.rascunho}, ${tenantId}, 'Rascunho', 'x')`
    await tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, agendada_para)
      VALUES (${ids.agendada}, ${tenantId}, 'Agendada', 'x', 'agendada', now() + interval '1 day')`
    await tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, publicada_em, excluido_em)
      VALUES (${ids.excluida}, ${tenantId}, 'Excluída', 'x', 'publicada', now(), now())`
  })
  const sessaoA: Sessao = { acesso: ids.acessoA, empresa: ids.empresaA, contato: ids.contatoA }
  const sessaoB: Sessao = { acesso: ids.acessoB, empresa: ids.empresaB, contato: ids.contatoB }
  return { tenantId, ids, sessaoA, sessaoB }
}

const comentar = (
  c: Awaited<ReturnType<typeof cenario>>,
  sessao: Sessao,
  publicacao: string,
  corpo = 'Olá',
) =>
  comoCliente(
    c,
    sessao,
    (tx) =>
      tx`INSERT INTO publicacao_comentarios (id, tenant_id, publicacao_id, acesso_id, empresa_id, autor_nome, corpo)
        VALUES (${novoId()}, ${c.tenantId}, ${publicacao}, ${sessao.acesso}, ${sessao.empresa}, 'Fulano S.', ${corpo})`,
  )

describe('publicações: o que o cliente enxerga', () => {
  it('só as publicadas, não excluídas e do alcance da empresa dele', async () => {
    const c = await cenario()
    const titulosDe = async (s: Sessao) =>
      (await comoCliente(c, s, (tx) => tx`SELECT titulo FROM publicacoes`))
        .map((l) => String(l['titulo']))
        .sort()
    expect(await titulosDe(c.sessaoA)).toEqual(['Para todos', 'Só para A'])
    expect(await titulosDe(c.sessaoB)).toEqual(['Para todos', 'Só para B'])
  })

  it('a equipe (sem sessão do portal) vê tudo, inclusive rascunho, agendada e excluída', async () => {
    const c = await cenario()
    await comTenant(app, c.tenantId, async (tx) => {
      expect(await tx`SELECT id FROM publicacoes`).toHaveLength(6)
    })
  })

  it('alcance por empresa: o cliente só vê as próprias linhas de publicacao_empresas', async () => {
    const c = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      const linhas = await tx`SELECT empresa_id FROM publicacao_empresas`
      expect(linhas.map((l) => String(l['empresa_id']))).toEqual([c.ids.empresaA])
    })
  })

  it('o cliente não cria, altera nem apaga publicação', async () => {
    const c = await cenario()
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo) VALUES (${novoId()}, ${c.tenantId}, 'X', 'Y')`,
      ),
    ).rejects.toThrow(/row-level security/)
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`UPDATE publicacoes SET titulo = 'Mudou' RETURNING id`).toHaveLength(0)
      expect(await tx`DELETE FROM publicacoes RETURNING id`).toHaveLength(0)
    })
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO publicacao_empresas (id, tenant_id, publicacao_id, empresa_id)
            VALUES (${novoId()}, ${c.tenantId}, ${c.ids.paraTodos}, ${c.ids.empresaA})`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('a sessão do portal continua presa ao tenant', async () => {
    const c = await cenario()
    const outro = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM publicacoes WHERE id = ${outro.ids.paraTodos}`).toHaveLength(0)
      expect(await tx`SELECT id FROM publicacoes`).toHaveLength(2)
    })
  })
})

describe('publicações: reações e totais', () => {
  const reagir = (
    c: Awaited<ReturnType<typeof cenario>>,
    s: Sessao,
    publicacao: string,
    tipo: 'curtir' | 'apoiar' | 'parabens',
  ) =>
    comoCliente(
      c,
      s,
      (tx) =>
        tx`INSERT INTO publicacao_reacoes (id, tenant_id, publicacao_id, acesso_id, empresa_id, tipo)
          VALUES (${novoId()}, ${c.tenantId}, ${publicacao}, ${s.acesso}, ${s.empresa}, ${tipo})`,
    )
  const totais = (c: Awaited<ReturnType<typeof cenario>>, publicacao: string) =>
    comTenant(owner, c.tenantId, async (tx) => {
      const [p] =
        await tx`SELECT total_curtir, total_apoiar, total_parabens FROM publicacoes WHERE id = ${publicacao}`
      return [
        Number(p?.['total_curtir']),
        Number(p?.['total_apoiar']),
        Number(p?.['total_parabens']),
      ]
    })

  it('o gatilho soma e desfaz os totais, e o cliente vê o total de todas as empresas', async () => {
    const c = await cenario()
    await reagir(c, c.sessaoA, c.ids.paraTodos, 'curtir')
    await reagir(c, c.sessaoB, c.ids.paraTodos, 'curtir')
    await reagir(c, c.sessaoB, c.ids.paraTodos, 'parabens')
    expect(await totais(c, c.ids.paraTodos)).toEqual([2, 0, 1])
    await comoCliente(c, c.sessaoA, async (tx) => {
      const [p] = await tx`SELECT total_curtir FROM publicacoes WHERE id = ${c.ids.paraTodos}`
      expect(Number(p?.['total_curtir'])).toBe(2)
      // as linhas de reação, só as da própria empresa
      expect(await tx`SELECT id FROM publicacao_reacoes`).toHaveLength(1)
      const apagadas = await tx`DELETE FROM publicacao_reacoes RETURNING id`
      expect(apagadas).toHaveLength(1)
    })
    expect(await totais(c, c.ids.paraTodos)).toEqual([1, 0, 1])
  })

  it('uma reação de cada tipo por pessoa; outra pessoa pode reagir igual', async () => {
    const c = await cenario()
    await reagir(c, c.sessaoA, c.ids.paraTodos, 'apoiar')
    await expect(reagir(c, c.sessaoA, c.ids.paraTodos, 'apoiar')).rejects.toThrow(
      /publicacao_reacoes_uq/,
    )
    await reagir(c, c.sessaoA, c.ids.paraTodos, 'curtir')
    await reagir(c, c.sessaoB, c.ids.paraTodos, 'apoiar')
    expect(await totais(c, c.ids.paraTodos)).toEqual([1, 2, 0])
  })

  it('não reage em publicação que não enxerga, nem em nome de outro acesso ou empresa', async () => {
    const c = await cenario()
    await expect(reagir(c, c.sessaoA, c.ids.soParaB, 'curtir')).rejects.toThrow(
      /row-level security/,
    )
    await expect(reagir(c, c.sessaoA, c.ids.rascunho, 'curtir')).rejects.toThrow(
      /row-level security/,
    )
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO publicacao_reacoes (id, tenant_id, publicacao_id, acesso_id, empresa_id, tipo)
            VALUES (${novoId()}, ${c.tenantId}, ${c.ids.paraTodos}, ${c.ids.acessoB}, ${c.ids.empresaA}, 'curtir')`,
      ),
    ).rejects.toThrow(/row-level security/)
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO publicacao_reacoes (id, tenant_id, publicacao_id, acesso_id, empresa_id, tipo)
            VALUES (${novoId()}, ${c.tenantId}, ${c.ids.paraTodos}, ${c.ids.acessoA}, ${c.ids.empresaB}, 'curtir')`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('não desfaz a reação de outra pessoa', async () => {
    const c = await cenario()
    await reagir(c, c.sessaoA, c.ids.paraTodos, 'curtir')
    await comoCliente(c, c.sessaoB, async (tx) => {
      expect(await tx`DELETE FROM publicacao_reacoes RETURNING id`).toHaveLength(0)
    })
    expect(await totais(c, c.ids.paraTodos)).toEqual([1, 0, 0])
  })
})

describe('publicações: comentários, denúncias e leituras', () => {
  it('o comentário é visível a todos que enxergam a publicação, não só à empresa do autor', async () => {
    const c = await cenario()
    await comentar(c, c.sessaoA, c.ids.paraTodos, 'Ótima notícia')
    await comoCliente(c, c.sessaoB, async (tx) => {
      const linhas = await tx`SELECT corpo, autor_nome FROM publicacao_comentarios`
      expect(linhas.map((l) => String(l['corpo']))).toEqual(['Ótima notícia'])
    })
  })

  it('comentário em publicação que o cliente não enxerga não vale; e só em nome próprio', async () => {
    const c = await cenario()
    await expect(comentar(c, c.sessaoA, c.ids.soParaB)).rejects.toThrow(/row-level security/)
    await expect(comentar(c, c.sessaoA, c.ids.rascunho)).rejects.toThrow(/row-level security/)
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO publicacao_comentarios (id, tenant_id, publicacao_id, acesso_id, empresa_id, autor_nome, corpo)
            VALUES (${novoId()}, ${c.tenantId}, ${c.ids.paraTodos}, ${c.ids.acessoB}, ${c.ids.empresaB}, 'Outro', 'Falso')`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('publicação bloqueada e chave geral desligada impedem o comentário; ler continua', async () => {
    const c = await cenario()
    await comentar(c, c.sessaoA, c.ids.paraTodos, 'Antes')
    await comTenant(
      owner,
      c.tenantId,
      (tx) =>
        tx`UPDATE publicacoes SET comentarios_bloqueados = true WHERE id = ${c.ids.paraTodos}`,
    )
    await expect(comentar(c, c.sessaoA, c.ids.paraTodos)).rejects.toThrow(/row-level security/)
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM publicacao_comentarios`).toHaveLength(1)
    })
    await comTenant(owner, c.tenantId, async (tx) => {
      await tx`UPDATE publicacoes SET comentarios_bloqueados = false WHERE id = ${c.ids.paraTodos}`
      await tx`UPDATE tenant_configuracoes SET portal_comentarios_ativos = false`
    })
    await expect(comentar(c, c.sessaoA, c.ids.paraTodos)).rejects.toThrow(/row-level security/)
  })

  it('comentário oculto some para os outros, mas o autor continua vendo; o cliente não edita nem apaga', async () => {
    const c = await cenario()
    await comentar(c, c.sessaoA, c.ids.paraTodos, 'Spam')
    await comTenant(
      owner,
      c.tenantId,
      (tx) => tx`UPDATE publicacao_comentarios SET situacao = 'oculto', oculto_em = now(),
        oculto_motivo = 'Propaganda', oculto_por = ${c.ids.membro}`,
    )
    await comoCliente(c, c.sessaoB, async (tx) => {
      expect(await tx`SELECT id FROM publicacao_comentarios`).toHaveLength(0)
    })
    await comoCliente(c, c.sessaoA, async (tx) => {
      const [l] = await tx`SELECT oculto_motivo FROM publicacao_comentarios`
      expect(l?.['oculto_motivo']).toBe('Propaganda')
      expect(
        await tx`UPDATE publicacao_comentarios SET situacao = 'visivel', oculto_em = NULL RETURNING id`,
      ).toHaveLength(0)
      expect(await tx`DELETE FROM publicacao_comentarios RETURNING id`).toHaveLength(0)
    })
  })

  it('o comentário respeita o tamanho (1 a 1000) e o estado oculto exige a data', async () => {
    const c = await cenario()
    await expect(comentar(c, c.sessaoA, c.ids.paraTodos, '')).rejects.toThrow(
      /publicacao_comentarios_corpo_chk/,
    )
    await expect(comentar(c, c.sessaoA, c.ids.paraTodos, 'x'.repeat(1001))).rejects.toThrow(
      /publicacao_comentarios_corpo_chk/,
    )
    await comentar(c, c.sessaoA, c.ids.paraTodos)
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`UPDATE publicacao_comentarios SET situacao = 'oculto'`,
      ),
    ).rejects.toThrow(/publicacao_comentarios_oculto_chk/)
  })

  it('denuncia só comentário que enxerga, em nome próprio, uma vez', async () => {
    const c = await cenario()
    await comentar(c, c.sessaoA, c.ids.paraTodos, 'Spam')
    const comentarioId = await comTenant(owner, c.tenantId, async (tx) =>
      String((await tx`SELECT id FROM publicacao_comentarios`)[0]?.['id']),
    )
    const denunciar = (s: Sessao, acesso = s.acesso) =>
      comoCliente(
        c,
        s,
        (tx) =>
          tx`INSERT INTO publicacao_denuncias (id, tenant_id, comentario_id, acesso_id, motivo)
            VALUES (${novoId()}, ${c.tenantId}, ${comentarioId}, ${acesso}, 'spam')`,
      )
    await denunciar(c.sessaoB)
    await expect(denunciar(c.sessaoB)).rejects.toThrow(/publicacao_denuncias_uq/)
    await expect(denunciar(c.sessaoB, c.ids.acessoA)).rejects.toThrow(/row-level security/)
    // só as próprias denúncias
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM publicacao_denuncias`).toHaveLength(0)
    })
    await comoCliente(c, c.sessaoB, async (tx) => {
      expect(await tx`SELECT id FROM publicacao_denuncias`).toHaveLength(1)
      expect(
        await tx`UPDATE publicacao_denuncias SET tratada_em = now() RETURNING id`,
      ).toHaveLength(0)
    })
  })

  it('leitura: uma por pessoa e publicação, só a própria é visível, só em publicação visível', async () => {
    const c = await cenario()
    const ler = (s: Sessao, publicacao: string) =>
      comoCliente(
        c,
        s,
        (tx) =>
          tx`INSERT INTO publicacao_leituras (id, tenant_id, publicacao_id, acesso_id, empresa_id)
            VALUES (${novoId()}, ${c.tenantId}, ${publicacao}, ${s.acesso}, ${s.empresa})`,
      )
    await ler(c.sessaoA, c.ids.paraTodos)
    await ler(c.sessaoB, c.ids.paraTodos)
    await expect(ler(c.sessaoA, c.ids.paraTodos)).rejects.toThrow(/publicacao_leituras_uq/)
    await expect(ler(c.sessaoA, c.ids.soParaB)).rejects.toThrow(/row-level security/)
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM publicacao_leituras`).toHaveLength(1)
    })
  })
})

describe('publicações: fixar e agendar', () => {
  it('só uma publicação fixada por empresa (tenant)', async () => {
    const c = await cenario()
    await comTenant(
      owner,
      c.tenantId,
      (tx) => tx`UPDATE publicacoes SET fixada = true WHERE id = ${c.ids.paraTodos}`,
    )
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`UPDATE publicacoes SET fixada = true WHERE id = ${c.ids.soParaA}`,
      ),
    ).rejects.toThrow(/publicacoes_fixada_uq/)
  })

  it('a situação "agendada" exige a data, e "publicada" exige a data de publicação', async () => {
    const c = await cenario()
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) =>
          tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao) VALUES (${novoId()}, ${c.tenantId}, 'a', 'b', 'agendada')`,
      ),
    ).rejects.toThrow(/publicacoes_situacao_chk/)
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) =>
          tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao) VALUES (${novoId()}, ${c.tenantId}, 'a', 'b', 'publicada')`,
      ),
    ).rejects.toThrow(/publicacoes_situacao_chk/)
  })

  it('app_publicar_agendadas publica só as vencidas, em todas as empresas', async () => {
    const a = await cenario()
    const b = await cenario()
    for (const c of [a, b]) {
      await comTenant(
        owner,
        c.tenantId,
        (tx) =>
          tx`UPDATE publicacoes SET agendada_para = now() - interval '1 minute' WHERE id = ${c.ids.agendada}`,
      )
    }
    // a de B ainda no futuro
    await comTenant(
      owner,
      b.tenantId,
      (tx) =>
        tx`UPDATE publicacoes SET agendada_para = now() + interval '1 day' WHERE id = ${b.ids.agendada}`,
    )
    const [r] = await app`SELECT app_publicar_agendadas() AS n`
    expect(Number(r?.['n'])).toBeGreaterThanOrEqual(1)
    const situacao = async (c: typeof a) =>
      comTenant(owner, c.tenantId, async (tx) => {
        const [p] =
          await tx`SELECT situacao, publicada_em FROM publicacoes WHERE id = ${c.ids.agendada}`
        return [String(p?.['situacao']), p?.['publicada_em'] !== null] as const
      })
    expect(await situacao(a)).toEqual(['publicada', true])
    expect(await situacao(b)).toEqual(['agendada', false])
    // sem a função, o app sem tenant não lê nem altera publicações
    expect(await app`SELECT id FROM publicacoes`).toHaveLength(0)
    expect(
      await app`UPDATE publicacoes SET situacao = 'rascunho', agendada_para = NULL RETURNING id`,
    ).toHaveLength(0)
  })
})
