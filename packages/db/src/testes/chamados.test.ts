import { afterAll, describe, expect, it } from 'vitest'

import { feriadosNacionaisMoveis, criarPadroesChamadosDoTenant } from '../padroes.js'
import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarDrizzleOwner, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'
import { sql } from 'drizzle-orm'

const owner = conectarOwner()
const { db, cliente } = conectarDrizzleOwner()
afterAll(async () => {
  await owner.end()
  await cliente.end()
})

async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const ids = {
    membro: novoId(),
    outro: novoId(),
    area: novoId(),
    perfil: novoId(),
    contato: novoId(),
  }
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.membro}, ${tenantId}, 'Atendente')`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.outro}, ${tenantId}, 'Outro')`
    await tx`INSERT INTO areas_atendimento (id, tenant_id, nome) VALUES (${ids.area}, ${tenantId}, 'Suporte')`
    await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${ids.perfil}, ${tenantId}, 'Triadores')`
    await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${ids.contato}, ${tenantId}, 'Cliente')`
  })
  return { tenantId, ...ids }
}

const inserirChamado = (
  c: Awaited<ReturnType<typeof cenario>>,
  extra: {
    origem?: string
    solicitante?: string | null
    contato?: string | null
    area?: string | null
    status?: string
  } = {},
) =>
  comTenant(
    owner,
    c.tenantId,
    (
      tx,
    ) => tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, status, origem, solicitante_membro_id, contato_id)
      VALUES (${novoId()}, ${c.tenantId}, ${Math.floor(Math.random() * 1e9)}, 'Assunto',
        ${extra.area === undefined ? c.area : extra.area},
        ${extra.status ?? 'pendente'}::status_chamado, ${extra.origem ?? 'interna'}::origem_chamado,
        ${extra.solicitante === undefined ? c.membro : extra.solicitante}::uuid,
        ${extra.contato ?? null}::uuid)`,
  )

describe('chamados (0031)', () => {
  it('o solicitante combina com a origem: interna exige membro, portal exige contato', async () => {
    const c = await cenario()
    await inserirChamado(c)
    await inserirChamado(c, { origem: 'portal', solicitante: null, contato: c.contato })
    await expect(inserirChamado(c, { solicitante: null })).rejects.toThrow(/chamados_origem_chk/)
    await expect(
      inserirChamado(c, { origem: 'portal', solicitante: c.membro, contato: c.contato }),
    ).rejects.toThrow(/chamados_origem_chk/)
    await expect(inserirChamado(c, { origem: 'portal', solicitante: null })).rejects.toThrow(
      /chamados_origem_chk/,
    )
  })

  it('sem área só no estado aguardando triagem; resolvido e fechado exigem as datas', async () => {
    const c = await cenario()
    await inserirChamado(c, { area: null, status: 'aguardando_triagem' })
    await expect(inserirChamado(c, { area: null })).rejects.toThrow(/chamados_area_chk/)
    await expect(inserirChamado(c, { status: 'resolvido' })).rejects.toThrow(
      /chamados_fechamento_chk/,
    )
    await expect(inserirChamado(c, { status: 'fechado' })).rejects.toThrow(
      /chamados_fechamento_chk/,
    )
  })

  it('o número é único por empresa', async () => {
    const c = await cenario()
    const inserir = (n: number) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, solicitante_membro_id)
          VALUES (${novoId()}, ${c.tenantId}, ${n}, 'A', ${c.area}, ${c.membro})`,
      )
    await inserir(1)
    await expect(inserir(1)).rejects.toThrow(/chamados_numero_uq/)
  })

  it('membro da área: um membro OU um perfil; gestor só vale para membro', async () => {
    const c = await cenario()
    const inserir = (membro: string | null, perfil: string | null, gestor = false) =>
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`INSERT INTO area_membros (id, tenant_id, area_id, membro_id, perfil_id, gestor)
          VALUES (${novoId()}, ${c.tenantId}, ${c.area}, ${membro}::uuid, ${perfil}::uuid, ${gestor})`,
      )
    await inserir(c.membro, null, true)
    await inserir(null, c.perfil)
    await expect(inserir(c.membro, c.perfil)).rejects.toThrow(/area_membros_alvo_chk/)
    await expect(inserir(null, null)).rejects.toThrow(/area_membros_alvo_chk/)
    await expect(inserir(null, c.perfil, true)).rejects.toThrow(
      /area_membros_perfil_uq|area_membros_gestor_chk/,
    )
    await expect(inserir(c.membro, null)).rejects.toThrow(/area_membros_membro_uq/)
  })

  it('metas da área só aceitam minutos positivos; vazio = sem meta', async () => {
    const c = await cenario()
    await comTenant(
      owner,
      c.tenantId,
      (tx) => tx`UPDATE areas_atendimento SET meta_resposta_min = 60`,
    )
    await expect(
      comTenant(owner, c.tenantId, (tx) => tx`UPDATE areas_atendimento SET meta_resolucao_min = 0`),
    ).rejects.toThrow(/areas_atendimento_metas_chk/)
  })

  it('mensagem tem um autor coerente; anexo respeita o limite de 25 MB e o infectado traz a assinatura', async () => {
    const c = await cenario()
    const chamadoId = novoId()
    await comTenant(owner, c.tenantId, async (tx) => {
      await tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, solicitante_membro_id)
        VALUES (${chamadoId}, ${c.tenantId}, 1, 'A', ${c.area}, ${c.membro})`
    })
    const mensagem = (tipo: string, membro: string | null, contato: string | null) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO chamado_mensagens (id, tenant_id, chamado_id, autor_tipo, autor_membro_id, autor_contato_id, corpo)
          VALUES (${novoId()}, ${c.tenantId}, ${chamadoId}, ${tipo}::autor_do_chamado, ${membro}::uuid, ${contato}::uuid, 'Oi')`,
      )
    await mensagem('membro', c.membro, null)
    await mensagem('contato', null, c.contato)
    await expect(mensagem('membro', null, c.contato)).rejects.toThrow(/chamado_mensagens_autor_chk/)

    const anexo = (
      tamanho: number,
      estado = 'pendente_varredura',
      assinatura: string | null = null,
    ) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO chamado_anexos (id, tenant_id, chamado_id, chave_arquivo, nome, mime, tamanho, estado, assinatura)
          VALUES (${novoId()}, ${c.tenantId}, ${chamadoId}, ${`k-${novoId()}`}, 'a.pdf', 'application/pdf',
            ${tamanho}, ${estado}::estado_anexo, ${assinatura})`,
      )
    await anexo(25 * 1024 * 1024)
    await expect(anexo(25 * 1024 * 1024 + 1)).rejects.toThrow(/chamado_anexos_tamanho_chk/)
    await expect(anexo(10, 'infectado')).rejects.toThrow(/chamado_anexos_infectado_chk/)
    await anexo(10, 'infectado', 'Eicar-Test-Signature')
  })

  it('expediente: dia de 0 a 6, fim depois do início, sem faixa repetida; feriado único por data', async () => {
    const c = await cenario()
    const faixa = (dia: number, ini: string, fim: string) =>
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`INSERT INTO calendario_expediente (id, tenant_id, dia_semana, inicio, fim)
          VALUES (${novoId()}, ${c.tenantId}, ${dia}, ${ini}, ${fim})`,
      )
    await faixa(1, '08:00', '12:00')
    await faixa(1, '13:00', '18:00')
    await expect(faixa(7, '08:00', '18:00')).rejects.toThrow(/calendario_expediente_dia_chk/)
    await expect(faixa(2, '18:00', '08:00')).rejects.toThrow(/calendario_expediente_faixa_chk/)
    await expect(faixa(1, '08:00', '09:00')).rejects.toThrow(/calendario_expediente_uq/)
    const feriado = () =>
      comTenant(
        owner,
        c.tenantId,
        (tx) =>
          tx`INSERT INTO feriados (id, tenant_id, data, nome) VALUES (${novoId()}, ${c.tenantId}, '2026-09-07', 'Independência')`,
      )
    await feriado()
    await expect(feriado()).rejects.toThrow(/feriados_data_uq/)
  })

  it('o app só acrescenta eventos: não altera nem apaga', async () => {
    const c = await cenario()
    const app = conectarApp()
    try {
      const chamadoId = novoId()
      const eventoId = novoId()
      await comTenant(owner, c.tenantId, async (tx) => {
        await tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, solicitante_membro_id)
          VALUES (${chamadoId}, ${c.tenantId}, 1, 'A', ${c.area}, ${c.membro})`
      })
      await comTenant(app, c.tenantId, async (tx) => {
        await tx`INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo, ator_membro_id)
          VALUES (${eventoId}, ${c.tenantId}, ${chamadoId}, 'aberto', 'membro', ${c.membro})`
      })
      await expect(
        comTenant(
          app,
          c.tenantId,
          (tx) => tx`UPDATE chamado_eventos SET dados = '{}'::jsonb WHERE id = ${eventoId}`,
        ),
      ).rejects.toThrow(/permission denied/)
      await expect(
        comTenant(app, c.tenantId, (tx) => tx`DELETE FROM chamado_eventos WHERE id = ${eventoId}`),
      ).rejects.toThrow(/permission denied/)
      await expect(
        comTenant(
          owner,
          c.tenantId,
          (
            tx,
          ) => tx`INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo, ator_membro_id)
            VALUES (${novoId()}, ${c.tenantId}, ${chamadoId}, 'aberto', 'sistema', ${c.membro})`,
        ),
      ).rejects.toThrow(/chamado_eventos_ator_chk/)
    } finally {
      await app.end()
    }
  })

  it('notificação: o destinatário é um membro ou um contato, nunca nenhum nem os dois', async () => {
    const c = await cenario()
    const notificar = (tipo: string, membro: string | null, contato: string | null) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, membro_id, contato_id, tipo, titulo)
          VALUES (${novoId()}, ${c.tenantId}, ${tipo}::destinatario_da_notificacao, ${membro}::uuid, ${contato}::uuid, 'teste', 'Olá')`,
      )
    await notificar('membro', c.membro, null)
    await notificar('contato', null, c.contato)
    await expect(notificar('membro', null, null)).rejects.toThrow(/notificacoes_destinatario_chk/)
    await expect(notificar('membro', c.membro, c.contato)).rejects.toThrow(
      /notificacoes_destinatario_chk/,
    )
    await expect(notificar('contato', c.membro, null)).rejects.toThrow(
      /notificacoes_destinatario_chk/,
    )
  })
})

describe('padrões dos chamados', () => {
  const criar = (tenantId: string, hoje = new Date('2026-10-23T12:00:00Z')) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return criarPadroesChamadosDoTenant(tx, tenantId, null, hoje)
    })

  it('cria as quatro áreas, o expediente de segunda a sexta, os feriados e a triagem desligada, uma única vez', async () => {
    const { tenantId } = await cenario()
    expect(await criar(tenantId)).toBe(true)
    expect(await criar(tenantId)).toBe(false)
    const q = async <T extends object>(
      consulta: (tx: Parameters<Parameters<typeof comTenant>[2]>[0]) => Promise<T[]>,
    ) => comTenant(owner, tenantId, consulta)
    const areas = await q(
      (tx) => tx<{ nome: string; metas: boolean }[]>`
      SELECT nome, (meta_resposta_min IS NOT NULL OR meta_resolucao_min IS NOT NULL) AS metas
      FROM areas_atendimento WHERE chave_sistema IS NOT NULL ORDER BY ordem`,
    )
    expect(areas.map((a) => a.nome)).toEqual([
      'Jurídico',
      'Financeiro',
      'Comercial',
      'Administrativo',
    ])
    expect(areas.some((a) => a.metas)).toBe(false)
    const expediente = await q(
      (tx) => tx<{ dia: number; inicio: string; fim: string }[]>`
      SELECT dia_semana AS dia, inicio::text AS inicio, fim::text AS fim FROM calendario_expediente ORDER BY dia_semana`,
    )
    expect(expediente).toEqual(
      [1, 2, 3, 4, 5].map((dia) => ({ dia, inicio: '08:00:00', fim: '18:00:00' })),
    )
    const triagem = await q((tx) => tx<{ ativa: boolean }[]>`SELECT ativa FROM config_triagem`)
    expect(triagem).toEqual([{ ativa: false }])
    const datas = await q(
      (tx) => tx<{ data: string }[]>`SELECT data::text AS data FROM feriados ORDER BY data`,
    )
    expect(datas.map((d) => d.data)).toContain('2026-12-25')
    expect(datas.map((d) => d.data)).toContain('2026-06-04') // Corpus Christi 2026
    expect(datas.map((d) => d.data)).toContain('2027-03-26') // Sexta-feira Santa 2027
  })

  it('feriados móveis: Carnaval, Sexta-feira Santa e Corpus Christi (2026)', () => {
    expect(feriadosNacionaisMoveis(2026)).toEqual([
      { data: '2026-02-16', nome: 'Segunda-feira de Carnaval' },
      { data: '2026-02-17', nome: 'Terça-feira de Carnaval' },
      { data: '2026-04-03', nome: 'Sexta-feira Santa' },
      { data: '2026-06-04', nome: 'Corpus Christi' },
    ])
  })

  it('empresa antiga (sem a marca) aparece em app_tenants_sem_padroes_chamados() e o app não executa', async () => {
    const { tenantId } = await cenario()
    const pendentes = await owner<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes_chamados()`
    expect(pendentes.map((p) => p.tenant_id)).toContain(tenantId)
    await criar(tenantId)
    const depois = await owner<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes_chamados()`
    expect(depois.map((p) => p.tenant_id)).not.toContain(tenantId)
    const app = conectarApp()
    try {
      await expect(app`SELECT * FROM app_tenants_sem_padroes_chamados()`).rejects.toThrow(
        /permission denied/,
      )
    } finally {
      await app.end()
    }
  })
})
