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
type Tx = Parameters<Parameters<Sql['begin']>[1]>[0]

const comoCliente = <T>(c: { tenantId: string }, sessao: Sessao, fn: (tx: Tx) => Promise<T>) =>
  comTenant(app, c.tenantId, async (tx) => {
    await tx`SELECT set_config('app.portal_acesso_id', ${sessao.acesso}, true)`
    await tx`SELECT set_config('app.portal_empresa_id', ${sessao.empresa}, true)`
    await tx`SELECT set_config('app.portal_contato_id', ${sessao.contato}, true)`
    return fn(tx)
  })

interface Pessoa extends Sessao {
  nome: string
}

/** Duas empresas-clientes (A com 3 pessoas, B com 2) e um evento publicado em cada situação que interessa. */
async function cenario(
  evento: { vagasTotais?: number | null; vagasPorEmpresa?: number | null } = {},
) {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const membro = novoId()
  const empresaA = novoId()
  const empresaB = novoId()
  const pessoas: Pessoa[] = []
  const ids = {
    evento: novoId(),
    soParaA: novoId(),
    soParaB: novoId(),
    rascunho: novoId(),
    cancelado: novoId(),
    passado: novoId(),
    prazoVencido: novoId(),
  }
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membro}, ${tenantId}, 'Equipe')`
    for (const [empresa, nome] of [
      [empresaA, 'Cliente A'],
      [empresaB, 'Cliente B'],
    ] as const) {
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresa}, ${tenantId}, ${nome}, ${membro})`
    }
    for (const [empresa, quantidade] of [
      [empresaA, 3],
      [empresaB, 2],
    ] as const) {
      for (let i = 0; i < quantidade; i++) {
        const contato = novoId()
        const acesso = novoId()
        await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${contato}, ${tenantId}, ${`Pessoa ${pessoas.length}`})`
        await tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (${novoId()}, ${tenantId}, ${empresa}, ${contato})`
        await tx`INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email, situacao)
          VALUES (${acesso}, ${tenantId}, ${contato}, ${empresa}, ${`${acesso}@exemplo.com.br`}, 'ativo')`
        pessoas.push({ acesso, empresa, contato, nome: `Pessoa ${pessoas.length}` })
      }
    }
    const novo = (
      id: string,
      titulo: string,
      extra: {
        situacao?: string
        alcance?: string
        inicio?: string
        prazo?: string | null
        vagasTotais?: number | null
        vagasPorEmpresa?: number | null
        publicado?: boolean
      } = {},
    ) =>
      tx.unsafe(
        `INSERT INTO eventos (id, tenant_id, titulo, inicio_em, fim_em, prazo_confirmacao, vagas_totais, vagas_por_empresa,
          alcance, situacao, publicado_em, cancelado_em)
         VALUES ($1, $2, $3, now() + interval '${extra.inicio ?? '10 days'}', now() + interval '${extra.inicio ?? '10 days'}' + interval '2 hours',
          ${extra.prazo === undefined ? 'NULL' : extra.prazo === null ? 'NULL' : `now() + interval '${extra.prazo}'`},
          $4, $5, $6::alcance_evento, $7::situacao_evento, ${extra.publicado === false ? 'NULL' : 'now()'},
          ${extra.situacao === 'cancelado' ? 'now()' : 'NULL'})`,
        [
          id,
          tenantId,
          titulo,
          extra.vagasTotais ?? null,
          extra.vagasPorEmpresa ?? null,
          extra.alcance ?? 'todos',
          extra.situacao ?? 'publicado',
        ],
      )
    await novo(ids.evento, 'Evento principal', {
      vagasTotais: evento.vagasTotais ?? null,
      vagasPorEmpresa: evento.vagasPorEmpresa ?? null,
    })
    await novo(ids.soParaA, 'Só para A', { alcance: 'empresas' })
    await novo(ids.soParaB, 'Só para B', { alcance: 'empresas' })
    await novo(ids.rascunho, 'Rascunho', { situacao: 'rascunho', publicado: false })
    await novo(ids.cancelado, 'Cancelado', { situacao: 'cancelado' })
    await novo(ids.passado, 'Passado', { inicio: '-1 hour' })
    await novo(ids.prazoVencido, 'Prazo vencido', { prazo: '-1 minute' })
    await tx`INSERT INTO evento_empresas (id, tenant_id, evento_id, empresa_id) VALUES (${novoId()}, ${tenantId}, ${ids.soParaA}, ${empresaA})`
    await tx`INSERT INTO evento_empresas (id, tenant_id, evento_id, empresa_id) VALUES (${novoId()}, ${tenantId}, ${ids.soParaB}, ${empresaB})`
  })
  return { tenantId, ids, pessoas }
}

type Cenario = Awaited<ReturnType<typeof cenario>>

const confirmar = (c: Cenario, p: Sessao, evento: string) =>
  comoCliente(c, p, async (tx) => {
    const [r] = await tx`SELECT app_evento_confirmar(${evento}, ${novoId()}) AS s`
    return String(r?.['s'])
  })
const cancelar = (c: Cenario, p: Sessao, evento: string) =>
  comoCliente(c, p, async (tx) =>
    (await tx`SELECT app_evento_cancelar_presenca(${evento}) AS id`).map((l) => String(l['id'])),
  )
const situacoes = (c: Cenario, evento: string) =>
  comTenant(owner, c.tenantId, async (tx) => {
    const linhas =
      await tx`SELECT acesso_id, situacao::text AS situacao FROM evento_confirmacoes WHERE evento_id = ${evento}`
    return new Map(linhas.map((l) => [String(l['acesso_id']), String(l['situacao'])]))
  })
const totais = (c: Cenario, evento: string) =>
  comTenant(owner, c.tenantId, async (tx) => {
    const [e] =
      await tx`SELECT total_confirmados, total_lista_espera FROM eventos WHERE id = ${evento}`
    return [Number(e?.['total_confirmados']), Number(e?.['total_lista_espera'])]
  })
const falhaCom = async (p: Promise<unknown>, mensagem: string) =>
  expect(p).rejects.toThrow(mensagem)

describe('agenda: o que o cliente enxerga', () => {
  it('só eventos publicados ou cancelados (não rascunho), do alcance da empresa dele', async () => {
    const c = await cenario()
    const [a, , , b] = c.pessoas as [Pessoa, Pessoa, Pessoa, Pessoa]
    const titulosDe = async (p: Sessao) =>
      (await comoCliente(c, p, (tx) => tx`SELECT titulo FROM eventos`))
        .map((l) => String(l['titulo']))
        .sort()
    expect(await titulosDe(a)).toEqual([
      'Cancelado',
      'Evento principal',
      'Passado',
      'Prazo vencido',
      'Só para A',
    ])
    expect(await titulosDe(b)).toEqual([
      'Cancelado',
      'Evento principal',
      'Passado',
      'Prazo vencido',
      'Só para B',
    ])
  })

  it('a equipe vê tudo; o cliente não grava em eventos, alcance nem confirmações', async () => {
    const c = await cenario()
    const a = c.pessoas[0] as Pessoa
    await comTenant(app, c.tenantId, async (tx) => {
      expect(await tx`SELECT id FROM eventos`).toHaveLength(7)
    })
    await expect(
      comoCliente(
        c,
        a,
        (tx) =>
          tx`INSERT INTO eventos (id, tenant_id, titulo, inicio_em, fim_em) VALUES (${novoId()}, ${c.tenantId}, 'X', now(), now() + interval '1 hour')`,
      ),
    ).rejects.toThrow(/row-level security/)
    await comoCliente(c, a, async (tx) => {
      expect(await tx`UPDATE eventos SET titulo = 'Mudou' RETURNING id`).toHaveLength(0)
      expect(await tx`DELETE FROM eventos RETURNING id`).toHaveLength(0)
      expect(await tx`DELETE FROM evento_empresas RETURNING id`).toHaveLength(0)
    })
    await expect(
      comoCliente(
        c,
        a,
        (
          tx,
        ) => tx`INSERT INTO evento_confirmacoes (id, tenant_id, evento_id, acesso_id, empresa_id, situacao, confirmado_em)
        VALUES (${novoId()}, ${c.tenantId}, ${c.ids.evento}, ${a.acesso}, ${a.empresa}, 'confirmado', now())`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('as confirmações visíveis são as da própria empresa; a sessão fica presa ao tenant', async () => {
    const c = await cenario()
    const outro = await cenario()
    const [a1, a2, , b1] = c.pessoas as [Pessoa, Pessoa, Pessoa, Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await confirmar(c, a2, c.ids.evento)
    await confirmar(c, b1, c.ids.evento)
    await comoCliente(c, a1, async (tx) => {
      expect(await tx`SELECT id FROM evento_confirmacoes`).toHaveLength(2)
      expect(
        await tx`UPDATE evento_confirmacoes SET situacao = 'cancelado', cancelado_em = now() RETURNING id`,
      ).toHaveLength(0)
      expect(await tx`SELECT id FROM eventos WHERE id = ${outro.ids.evento}`).toHaveLength(0)
    })
  })
})

describe('agenda: confirmar', () => {
  it('sem limite de vagas, todos confirmam; confirmar de novo é inofensivo', async () => {
    const c = await cenario()
    const [a1, a2] = c.pessoas as [Pessoa, Pessoa]
    expect(await confirmar(c, a1, c.ids.evento)).toBe('confirmado')
    expect(await confirmar(c, a1, c.ids.evento)).toBe('confirmado')
    expect(await confirmar(c, a2, c.ids.evento)).toBe('confirmado')
    expect(await totais(c, c.ids.evento)).toEqual([2, 0])
  })

  it('lotado vai para a lista de espera; o limite por empresa também', async () => {
    const c = await cenario({ vagasTotais: 3, vagasPorEmpresa: 2 })
    const [a1, a2, a3, b1, b2] = c.pessoas as [Pessoa, Pessoa, Pessoa, Pessoa, Pessoa]
    expect(await confirmar(c, a1, c.ids.evento)).toBe('confirmado')
    expect(await confirmar(c, a2, c.ids.evento)).toBe('confirmado')
    // a empresa A já tem as 2 vagas dela: a terceira pessoa espera, mesmo sobrando vaga no total
    expect(await confirmar(c, a3, c.ids.evento)).toBe('lista_espera')
    expect(await confirmar(c, b1, c.ids.evento)).toBe('confirmado')
    // o total (3) acabou: a empresa B espera, mesmo com vaga da empresa
    expect(await confirmar(c, b2, c.ids.evento)).toBe('lista_espera')
    expect(await totais(c, c.ids.evento)).toEqual([3, 2])
  })

  it('recusa evento fora do alcance, rascunho, cancelado, encerrado e com prazo vencido', async () => {
    const c = await cenario()
    const [a1] = c.pessoas as [Pessoa]
    await falhaCom(confirmar(c, a1, c.ids.soParaB), 'evento_nao_encontrado')
    await falhaCom(confirmar(c, a1, c.ids.rascunho), 'evento_nao_encontrado')
    await falhaCom(confirmar(c, a1, novoId()), 'evento_nao_encontrado')
    await falhaCom(confirmar(c, a1, c.ids.cancelado), 'evento_cancelado')
    await falhaCom(confirmar(c, a1, c.ids.passado), 'evento_encerrado')
    await falhaCom(confirmar(c, a1, c.ids.prazoVencido), 'prazo_encerrado')
    expect(await confirmar(c, a1, c.ids.soParaA)).toBe('confirmado')
  })

  it('sem a sessão do portal a função recusa', async () => {
    const c = await cenario()
    await falhaCom(
      comTenant(
        app,
        c.tenantId,
        (tx) => tx`SELECT app_evento_confirmar(${c.ids.evento}, ${novoId()})`,
      ),
      'sem_sessao_do_portal',
    )
  })

  it('CONCORRÊNCIA: 5 pessoas confirmando ao mesmo tempo para 2 vagas: exatamente 2 confirmadas e 3 na fila', async () => {
    const c = await cenario({ vagasTotais: 2 })
    const resultados = await Promise.all(c.pessoas.map((p) => confirmar(c, p, c.ids.evento)))
    expect(resultados.filter((r) => r === 'confirmado')).toHaveLength(2)
    expect(resultados.filter((r) => r === 'lista_espera')).toHaveLength(3)
    expect(await totais(c, c.ids.evento)).toEqual([2, 3])
    const linhas = [...(await situacoes(c, c.ids.evento)).values()]
    expect(linhas.filter((s) => s === 'confirmado')).toHaveLength(2)
  })

  it('CONCORRÊNCIA: o limite por empresa também vale com todos confirmando juntos', async () => {
    const c = await cenario({ vagasPorEmpresa: 1 })
    const resultados = await Promise.all(c.pessoas.map((p) => confirmar(c, p, c.ids.evento)))
    expect(resultados.filter((r) => r === 'confirmado')).toHaveLength(2) // uma de cada empresa
    const confirmadas = await comTenant(owner, c.tenantId, async (tx) =>
      (
        await tx`SELECT empresa_id, count(*)::int AS n FROM evento_confirmacoes WHERE evento_id = ${c.ids.evento} AND situacao = 'confirmado' GROUP BY empresa_id`
      ).map((l) => Number(l['n'])),
    )
    expect(confirmadas).toEqual([1, 1])
  })

  it('CONCORRÊNCIA: a mesma pessoa confirmando duas vezes ao mesmo tempo fica com uma presença só', async () => {
    const c = await cenario({ vagasTotais: 5 })
    const [a1] = c.pessoas as [Pessoa]
    await Promise.all([
      confirmar(c, a1, c.ids.evento),
      confirmar(c, a1, c.ids.evento),
      confirmar(c, a1, c.ids.evento),
    ])
    expect(await totais(c, c.ids.evento)).toEqual([1, 0])
    expect((await situacoes(c, c.ids.evento)).size).toBe(1)
  })
})

describe('agenda: cancelar e promover a lista de espera', () => {
  it('o cancelamento promove o primeiro da fila a quem cabe; os contadores batem', async () => {
    const c = await cenario({ vagasTotais: 2 })
    const [a1, a2, a3, b1] = c.pessoas as [Pessoa, Pessoa, Pessoa, Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await confirmar(c, a2, c.ids.evento)
    await confirmar(c, a3, c.ids.evento) // fila 1
    await confirmar(c, b1, c.ids.evento) // fila 2
    const promovidas = await cancelar(c, a1, c.ids.evento)
    expect(promovidas).toHaveLength(1)
    const situacao = await situacoes(c, c.ids.evento)
    expect(situacao.get(a1.acesso)).toBe('cancelado')
    expect(situacao.get(a3.acesso)).toBe('confirmado')
    expect(situacao.get(b1.acesso)).toBe('lista_espera')
    expect(await totais(c, c.ids.evento)).toEqual([2, 1])
  })

  it('pula quem a empresa já está no limite e promove o próximo que cabe', async () => {
    const c = await cenario({ vagasTotais: 3, vagasPorEmpresa: 2 })
    const [a1, a2, a3, b1, b2] = c.pessoas as [Pessoa, Pessoa, Pessoa, Pessoa, Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await confirmar(c, a2, c.ids.evento)
    await confirmar(c, b1, c.ids.evento) // total 3: lotado
    await confirmar(c, a3, c.ids.evento) // fila 1 (A no limite e total lotado)
    await confirmar(c, b2, c.ids.evento) // fila 2
    // b1 cancela: abre 1 vaga. a3 é o primeiro da fila, mas a empresa A já tem 2: pula e promove b2
    await cancelar(c, b1, c.ids.evento)
    const situacao = await situacoes(c, c.ids.evento)
    expect(situacao.get(a3.acesso)).toBe('lista_espera')
    expect(situacao.get(b2.acesso)).toBe('confirmado')
  })

  it('cancelar quem está na fila só tira da fila; cancelar duas vezes é recusado; cancelar e reconfirmar volta ao fim', async () => {
    const c = await cenario({ vagasTotais: 1 })
    const [a1, a2, a3] = c.pessoas as [Pessoa, Pessoa, Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await confirmar(c, a2, c.ids.evento)
    await confirmar(c, a3, c.ids.evento)
    expect(await cancelar(c, a2, c.ids.evento)).toEqual([])
    expect(await totais(c, c.ids.evento)).toEqual([1, 1])
    await falhaCom(cancelar(c, a2, c.ids.evento), 'sem_presenca')
    expect(await confirmar(c, a2, c.ids.evento)).toBe('lista_espera') // volta ao fim da fila
    await cancelar(c, a1, c.ids.evento)
    const situacao = await situacoes(c, c.ids.evento)
    expect(situacao.get(a3.acesso)).toBe('confirmado') // a3 entrou antes do retorno da a2
  })

  it('CONCORRÊNCIA: vários cancelamentos juntos promovem exatamente quem cabe, sem passar do limite', async () => {
    const c = await cenario({ vagasTotais: 2 })
    const [a1, a2, a3, b1, b2] = c.pessoas as [Pessoa, Pessoa, Pessoa, Pessoa, Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await confirmar(c, a2, c.ids.evento)
    await confirmar(c, a3, c.ids.evento)
    await confirmar(c, b1, c.ids.evento)
    await confirmar(c, b2, c.ids.evento)
    await Promise.all([cancelar(c, a1, c.ids.evento), cancelar(c, a2, c.ids.evento)])
    expect(await totais(c, c.ids.evento)).toEqual([2, 1])
    const situacao = await situacoes(c, c.ids.evento)
    expect(situacao.get(a3.acesso)).toBe('confirmado')
    expect(situacao.get(b1.acesso)).toBe('confirmado')
    expect(situacao.get(b2.acesso)).toBe('lista_espera')
  })

  it('só cancela a própria presença e só até o início do evento', async () => {
    const c = await cenario({ vagasTotais: 5 })
    const [a1, a2] = c.pessoas as [Pessoa, Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await falhaCom(cancelar(c, a2, c.ids.evento), 'sem_presenca')
    await falhaCom(cancelar(c, a1, c.ids.passado), 'evento_encerrado')
    await falhaCom(cancelar(c, a1, c.ids.rascunho), 'evento_nao_encontrado')
  })
})

describe('agenda: a equipe', () => {
  const comoEquipe = <T>(c: Cenario, fn: (tx: Tx) => Promise<T>) => comTenant(app, c.tenantId, fn)

  it('remover um participante promove a fila; aumentar as vagas promove quem passa a caber', async () => {
    const c = await cenario({ vagasTotais: 1 })
    const [a1, a2, a3] = c.pessoas as [Pessoa, Pessoa, Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await confirmar(c, a2, c.ids.evento)
    await confirmar(c, a3, c.ids.evento)
    const confirmacaoA1 = await comTenant(owner, c.tenantId, async (tx) =>
      String(
        (await tx`SELECT id FROM evento_confirmacoes WHERE acesso_id = ${a1.acesso}`)[0]?.['id'],
      ),
    )
    const promovidas = await comoEquipe(c, async (tx) =>
      (await tx`SELECT app_evento_remover_participante(${confirmacaoA1}) AS id`).map((l) =>
        String(l['id']),
      ),
    )
    expect(promovidas).toHaveLength(1)
    expect((await situacoes(c, c.ids.evento)).get(a2.acesso)).toBe('confirmado')
    await comoEquipe(c, (tx) => tx`UPDATE eventos SET vagas_totais = 3 WHERE id = ${c.ids.evento}`)
    const depois = await comoEquipe(c, async (tx) =>
      (await tx`SELECT app_evento_reprocessar_vagas(${c.ids.evento}) AS id`).map((l) =>
        String(l['id']),
      ),
    )
    expect(depois).toHaveLength(1)
    expect((await situacoes(c, c.ids.evento)).get(a3.acesso)).toBe('confirmado')
    expect(await totais(c, c.ids.evento)).toEqual([2, 0])
  })

  it('o cliente não chama as funções da equipe', async () => {
    const c = await cenario()
    const [a1] = c.pessoas as [Pessoa]
    await confirmar(c, a1, c.ids.evento)
    const confirmacao = await comTenant(owner, c.tenantId, async (tx) =>
      String((await tx`SELECT id FROM evento_confirmacoes`)[0]?.['id']),
    )
    await falhaCom(
      comoCliente(c, a1, (tx) => tx`SELECT app_evento_remover_participante(${confirmacao})`),
      'acesso_negado',
    )
    await falhaCom(
      comoCliente(c, a1, (tx) => tx`SELECT app_evento_reprocessar_vagas(${c.ids.evento})`),
      'acesso_negado',
    )
    await falhaCom(
      comTenant(app, c.tenantId, (tx) => tx`SELECT app_evento_remover_participante(${novoId()})`),
      'sem_presenca',
    )
  })

  it('as funções internas não são chamáveis pelo papel da API', async () => {
    const c = await cenario()
    await falhaCom(
      comTenant(app, c.tenantId, (tx) => tx`SELECT app_evento_promover(${c.ids.evento})`),
      'permission denied',
    )
    await falhaCom(
      comTenant(app, c.tenantId, (tx) => tx`SELECT app_evento_cancelar_confirmacao(${novoId()})`),
      'permission denied',
    )
  })
})

describe('agenda: regras da tabela e lembrete', () => {
  it('fim depois do início, vagas positivas, prazo até o início e link http(s)', async () => {
    const c = await cenario()
    const inserir = (extra: string) =>
      comTenant(owner, c.tenantId, (tx) =>
        tx.unsafe(`INSERT INTO eventos (id, tenant_id, titulo, inicio_em, fim_em ${extra.includes('|') ? ', ' + extra.split('|')[0] : ''})
          VALUES ('${novoId()}', '${c.tenantId}', 'T', now() + interval '1 day', now() + interval '2 days' ${extra.includes('|') ? ', ' + extra.split('|')[1] : ''})`),
      )
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) =>
          tx`INSERT INTO eventos (id, tenant_id, titulo, inicio_em, fim_em) VALUES (${novoId()}, ${c.tenantId}, 'T', now() + interval '2 days', now() + interval '1 day')`,
      ),
    ).rejects.toThrow(/eventos_periodo_chk/)
    await expect(inserir('vagas_totais|0')).rejects.toThrow(/eventos_vagas_chk/)
    await expect(inserir('vagas_por_empresa|0')).rejects.toThrow(/eventos_vagas_chk/)
    await expect(inserir("prazo_confirmacao|now() + interval '3 days'")).rejects.toThrow(
      /eventos_prazo_chk/,
    )
    await expect(inserir("link_online|'ftp://x'")).rejects.toThrow(/eventos_link_chk/)
    await inserir("link_online|'https://meet.exemplo.com/abc'")
  })

  it('uma presença ativa por pessoa e evento; cancelada não impede nova', async () => {
    const c = await cenario()
    const [a1] = c.pessoas as [Pessoa]
    await confirmar(c, a1, c.ids.evento)
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`INSERT INTO evento_confirmacoes (id, tenant_id, evento_id, acesso_id, empresa_id)
        VALUES (${novoId()}, ${c.tenantId}, ${c.ids.evento}, ${a1.acesso}, ${a1.empresa})`,
      ),
    ).rejects.toThrow(/evento_confirmacoes_ativa_uq/)
    await cancelar(c, a1, c.ids.evento)
    expect(await confirmar(c, a1, c.ids.evento)).toBe('confirmado')
  })

  it('app_eventos_a_lembrar acha só os publicados que começam em até 24 h e ainda sem lembrete', async () => {
    const c = await cenario()
    const proximo = novoId()
    const longe = novoId()
    const jaLembrado = novoId()
    const rascunho = novoId()
    await comTenant(owner, c.tenantId, async (tx) => {
      const criar = (
        id: string,
        inicio: string,
        extra: { rascunho?: boolean; lembrado?: boolean } = {},
      ) =>
        tx.unsafe(
          `INSERT INTO eventos (id, tenant_id, titulo, inicio_em, fim_em, situacao, publicado_em, lembrete_enviado_em)
           VALUES ($1, $2, 'Lembrar', now() + interval '${inicio}', now() + interval '${inicio}' + interval '1 hour',
             $3::situacao_evento, ${extra.rascunho ? 'NULL' : 'now()'}, ${extra.lembrado ? 'now()' : 'NULL'})`,
          [id, c.tenantId, extra.rascunho ? 'rascunho' : 'publicado'],
        )
      await criar(proximo, '5 hours')
      await criar(longe, '3 days')
      await criar(jaLembrado, '6 hours', { lembrado: true })
      await criar(rascunho, '7 hours', { rascunho: true })
    })
    const achados = (await app`SELECT id, tenant_id FROM app_eventos_a_lembrar()`).map((l) =>
      String(l['id']),
    )
    expect(achados).toContain(proximo)
    for (const id of [longe, jaLembrado, rascunho, c.ids.evento, c.ids.passado]) {
      expect(achados).not.toContain(id)
    }
    // sem a função, o app sem empresa não lê eventos
    expect(await app`SELECT id FROM eventos`).toHaveLength(0)
  })
})
