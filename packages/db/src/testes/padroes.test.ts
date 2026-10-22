import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import {
  criarPadroesDoTenant,
  criarPadroesGeoDoTenant,
  criarPadroesVisitaDoTenant,
} from '../padroes.js'
import { novoId } from '../id.js'
import { comTenant, conectarDrizzleOwner, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const owner = conectarOwner()
const { db, cliente } = conectarDrizzleOwner()
afterAll(async () => {
  await owner.end()
  await cliente.end()
})

/** Tenant com a linha de configurações (a marca mora nela), como o primeiro acesso deixa. */
async function novoTenant(): Promise<string> {
  const id = novoId()
  await prepararTenants(owner, [id])
  await comTenant(
    owner,
    id,
    (tx) => tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${id})`,
  )
  return id
}

const criar = (tenantId: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sqlTenant(tenantId))
    return criarPadroesDoTenant(tx, tenantId)
  })

const criarGeo = (tenantId: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sqlTenant(tenantId))
    return criarPadroesGeoDoTenant(tx, tenantId)
  })

const criarVisita = (tenantId: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sqlTenant(tenantId))
    return criarPadroesVisitaDoTenant(tx, tenantId)
  })

const sqlTenant = (id: string) => sql`SELECT set_config('app.tenant_id', ${id}, true)`

const contar = (tenantId: string, tabela: string, onde = '') =>
  comTenant(owner, tenantId, async (tx) => {
    const [l] = await tx.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM ${tabela} WHERE excluido_em IS NULL ${onde}`,
    )
    return l?.n
  })

describe('criarPadroesDoTenant', () => {
  it('cria os padrões e marca a empresa', async () => {
    const t = await novoTenant()
    expect(await criar(t)).toBe(true)
    expect(await contar(t, 'tag_grupos')).toBe(3)
    expect(await contar(t, 'tags')).toBe(7)
    expect(await contar(t, 'tipos_atividade')).toBe(6)
    expect(await contar(t, 'funis')).toBe(1)
    expect(await contar(t, 'funil_fases')).toBe(4)
    expect(await contar(t, 'origens')).toBe(5)
    expect(await contar(t, 'motivos')).toBe(12)
    expect(await contar(t, 'verticais')).toBe(0)
    expect(await contar(t, 'solucoes')).toBe(0)
    const [m] = await comTenant(
      owner,
      t,
      (tx) =>
        tx<
          { ok: boolean }[]
        >`SELECT padroes_criados_em IS NOT NULL AS ok FROM tenant_configuracoes`,
    )
    expect(m?.ok).toBe(true)
  })

  it('traz os valores certos: Status único e obrigatório, Visitação e Cadastro automáticos, funil padrão', async () => {
    const t = await novoTenant()
    await criar(t)
    const grupos = await comTenant(
      owner,
      t,
      (tx) => tx<
        {
          nome: string
          selecao: string
          obrigatorio: boolean
          automatico: boolean
          sistema: boolean
        }[]
      >`
        SELECT nome, selecao, obrigatorio, automatico, sistema FROM tag_grupos ORDER BY ordem`,
    )
    expect(grupos).toEqual([
      { nome: 'Status', selecao: 'unica', obrigatorio: true, automatico: false, sistema: true },
      {
        nome: 'Visitação',
        selecao: 'multipla',
        obrigatorio: false,
        automatico: true,
        sistema: true,
      },
      {
        nome: 'Cadastro',
        selecao: 'multipla',
        obrigatorio: false,
        automatico: true,
        sistema: true,
      },
    ])
    const tipos = await comTenant(
      owner,
      t,
      (tx) => tx<{ chave: string; conta: string; exige: boolean }[]>`
        SELECT chave_sistema AS chave, conta_como AS conta, exige_empresa AS exige FROM tipos_atividade ORDER BY ordem`,
    )
    expect(tipos.map((x) => `${x.chave}:${x.conta}:${x.exige}`)).toEqual([
      'ligacao:contato:true',
      'whatsapp:contato:true',
      'email:contato:true',
      'visita:visita:true',
      'reuniao:contato:true',
      'tarefa:nenhum:false',
    ])
    const fases = await comTenant(
      owner,
      t,
      (tx) => tx<{ nome: string; p: number; d: number; padrao: boolean }[]>`
        SELECT f.nome, f.probabilidade_padrao AS p, f.dias_alerta_parada AS d, u.padrao
        FROM funil_fases f JOIN funis u ON u.id = f.funil_id ORDER BY f.ordem`,
    )
    expect(fases.map((f) => `${f.nome}:${f.p}:${f.d}:${f.padrao}`)).toEqual([
      'Qualificação:10:14:true',
      'Diagnóstico:25:14:true',
      'Proposta:50:14:true',
      'Negociação:75:14:true',
    ])
    expect(await contar(t, 'origens', "AND chave_sistema = 'importacao'")).toBe(1)
    expect(await contar(t, 'motivos', "AND aplica_a = '{perdido}'")).toBe(5)
  })

  it('só uma vez: excluir um padrão e rodar de novo NÃO o recria', async () => {
    const t = await novoTenant()
    await criar(t)
    await comTenant(
      owner,
      t,
      (tx) => tx`UPDATE tags SET excluido_em = now() WHERE nome = 'Prospect'`,
    )
    await comTenant(
      owner,
      t,
      (tx) => tx`UPDATE motivos SET excluido_em = now() WHERE nome = 'Preço'`,
    )
    expect(await criar(t)).toBe(false)
    expect(await contar(t, 'tags')).toBe(6)
    expect(await contar(t, 'motivos')).toBe(11)
    expect(await contar(t, 'tags', "AND nome = 'Prospect'")).toBe(0)
  })

  it('não vaza entre empresas: cada uma tem os seus', async () => {
    const [a, b] = [await novoTenant(), await novoTenant()]
    await criar(a)
    expect(await contar(b, 'tags')).toBe(0)
    await criar(b)
    expect(await contar(a, 'tags')).toBe(7)
    expect(await contar(b, 'tags')).toBe(7)
  })

  it('duas execuções simultâneas não duplicam (a marca é reservada antes)', async () => {
    const t = await novoTenant()
    const [x, y] = await Promise.all([criar(t), criar(t)])
    expect([x, y].filter(Boolean)).toHaveLength(1)
    expect(await contar(t, 'tags')).toBe(7)
  })
})

describe('app_tenants_sem_padroes()', () => {
  it('lista só as empresas sem a marca, e só o dono consegue', async () => {
    const [feita, pendente] = [await novoTenant(), await novoTenant()]
    await criar(feita)
    const ids = (
      await owner<{ tenant_id: string }[]>`SELECT tenant_id FROM app_tenants_sem_padroes()`
    ).map((l) => l.tenant_id)
    expect(ids).toContain(pendente)
    expect(ids).not.toContain(feita)
    // a trava volta ao normal: fora da função, o dono continua sem enxergar outras empresas
    const [fora] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM tenant_configuracoes`
    expect(fora?.n).toBe(0)
  })

  it('o leadtogo_app não tem permissão de executar', async () => {
    const { conectarApp } = await import('./conexoes.js')
    const app = conectarApp()
    try {
      await expect(app`SELECT * FROM app_tenants_sem_padroes()`).rejects.toThrow(
        /permission denied/,
      )
    } finally {
      await app.end()
    }
  })
})

describe('criarPadroesGeoDoTenant (G1)', () => {
  it('cria o grupo Cadastro com a tag "Endereço a confirmar" e acerta as flags do mapa', async () => {
    const t = await novoTenant()
    await criar(t)
    const tags = await comTenant(
      owner,
      t,
      (tx) => tx<{ chave: string; mapa: boolean; aberto: boolean }[]>`
        SELECT chave_sistema AS chave, aparece_no_mapa AS mapa, visivel_ao_abrir AS aberto
        FROM tags WHERE chave_sistema IS NOT NULL ORDER BY chave_sistema`,
    )
    expect(tags.map((x) => `${x.chave}:${x.mapa}:${x.aberto}`)).toEqual([
      'cliente:true:true',
      'contactada:true:true',
      'endereco_a_confirmar:false:false',
      'inativo:false:false',
      'lead:true:true',
      'prospect:true:false',
      'visitada:true:true',
    ])
    const [g] = await comTenant(
      owner,
      t,
      (tx) => tx<{ chave: string; sistema: boolean }[]>`
        SELECT chave_sistema AS chave, sistema FROM tag_grupos WHERE chave_sistema = 'cadastro'`,
    )
    expect(g).toEqual({ chave: 'cadastro', sistema: true })
  })

  it('é feito uma única vez e não duplica a tag', async () => {
    const t = await novoTenant()
    await criar(t)
    expect(await criarGeo(t)).toBe(false)
    expect(await contar(t, 'tags', "AND chave_sistema = 'endereco_a_confirmar'")).toBe(1)
  })

  it('empresa antiga (sem a marca): cria o grupo e acerta as flags', async () => {
    const t = await novoTenant()
    await criar(t)
    await comTenant(owner, t, async (tx) => {
      await tx`UPDATE tenant_configuracoes SET geo_padroes_criados_em = NULL`
      await tx`DELETE FROM tags WHERE chave_sistema = 'endereco_a_confirmar'`
      await tx`DELETE FROM tag_grupos WHERE chave_sistema = 'cadastro'`
      await tx`UPDATE tags SET aparece_no_mapa = true, visivel_ao_abrir = true`
    })
    expect(await criarGeo(t)).toBe(true)
    expect(await contar(t, 'tag_grupos', "AND chave_sistema = 'cadastro'")).toBe(1)
    expect(await contar(t, 'tags', "AND chave_sistema = 'inativo' AND NOT aparece_no_mapa")).toBe(1)
    expect(await contar(t, 'tags', "AND chave_sistema = 'prospect' AND NOT visivel_ao_abrir")).toBe(
      1,
    )
  })

  it('grupo "Cadastro" que o administrador já criou: o de sistema ganha outro nome', async () => {
    const t = await novoTenant()
    await comTenant(owner, t, async (tx) => {
      await tx`INSERT INTO tag_grupos (id, tenant_id, nome) VALUES (${novoId()}, ${t}, 'cadastro')`
    })
    expect(await criarGeo(t)).toBe(true)
    const nomes = await comTenant(
      owner,
      t,
      (tx) => tx<{ nome: string }[]>`SELECT nome FROM tag_grupos ORDER BY nome COLLATE "C"`,
    )
    expect(nomes.map((n) => n.nome)).toEqual(['Cadastro (sistema)', 'cadastro'])
  })
})

describe('criarPadroesVisitaDoTenant (G3a)', () => {
  it('cria o modelo padrão (versão 1, 7 campos) e os seis resultados apontando para ele', async () => {
    const t = await novoTenant()
    await criar(t)
    const [modelo] = await comTenant(
      owner,
      t,
      (tx) => tx<
        { id: string; nome: string; padrao: boolean; numero: number; campos: unknown[] }[]
      >`
        SELECT m.id, m.nome, m.padrao, v.numero, v.campos
        FROM visita_modelos m JOIN visita_modelo_versoes v ON v.id = m.versao_atual_id`,
    )
    expect(modelo).toMatchObject({ nome: 'Relatório de visita', padrao: true, numero: 1 })
    const campos = modelo?.campos as { tipo: string; id: string }[]
    expect(campos.map((c) => c.tipo)).toEqual([
      'contato',
      'dados_empresa',
      'escolha_unica',
      'texto_longo',
      'multipla_escolha',
      'proximo_passo',
      'texto_longo',
    ])
    expect(new Set(campos.map((c) => c.id)).size).toBe(7)
    const resultados = await comTenant(
      owner,
      t,
      (tx) => tx<{ nome: string; chave: string | null; modelo: string }[]>`
        SELECT nome, chave_sistema AS chave, modelo_id AS modelo FROM visita_resultados ORDER BY ordem`,
    )
    expect(resultados.map((r) => `${r.nome}:${r.chave ?? ''}`)).toEqual([
      'Visita realizada:',
      'Retornar depois:',
      'Sem interesse:',
      'Responsável ausente:',
      'Não localizada:nao_localizada',
      'Empresa encerrada:encerrada',
    ])
    expect(resultados.every((r) => r.modelo === modelo?.id)).toBe(true)
  })

  it('é feito uma única vez', async () => {
    const t = await novoTenant()
    await criar(t)
    expect(await criarVisita(t)).toBe(false)
    expect(await contar(t, 'visita_modelos')).toBe(1)
    expect(await contar(t, 'visita_resultados')).toBe(6)
  })

  it('empresa antiga (sem a marca): cria; modelo homônimo do administrador ganha outro nome', async () => {
    const t = await novoTenant()
    await criar(t)
    await comTenant(owner, t, async (tx) => {
      await tx`DELETE FROM visita_resultados`
      await tx`UPDATE visita_modelos SET versao_atual_id = NULL, padrao = false`
      await tx`DELETE FROM visita_modelo_versoes`
      await tx`UPDATE tenant_configuracoes SET visitas_padroes_criados_em = NULL`
    })
    expect(await criarVisita(t)).toBe(true)
    const nomes = await comTenant(
      owner,
      t,
      (tx) => tx<{ nome: string }[]>`SELECT nome FROM visita_modelos ORDER BY nome COLLATE "C"`,
    )
    expect(nomes.map((n) => n.nome)).toEqual([
      'Relatório de visita',
      'Relatório de visita (padrão)',
    ])
  })

  it('configurações do check-in nascem com os padrões e o limite é verificado', async () => {
    const t = await novoTenant()
    const [c] = await comTenant(
      owner,
      t,
      (tx) => tx<{ modo: string; limite: number; hora: string }[]>`
        SELECT checkin_modo AS modo, checkin_limite_m AS limite, lembrete_relatorios_hora::text AS hora
        FROM tenant_configuracoes`,
    )
    expect(c).toEqual({ modo: 'avisar', limite: 300, hora: '17:30:00' })
    await expect(
      comTenant(owner, t, (tx) => tx`UPDATE tenant_configuracoes SET checkin_limite_m = 5`),
    ).rejects.toThrow(/checkin_limite_chk/)
  })
})

describe('app_tenants_sem_padroes_visita()', () => {
  it('lista as empresas sem a marca; o leadtogo_app não executa', async () => {
    const t = await novoTenant()
    const pendentes = await owner<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes_visita()`
    expect(pendentes.map((p) => p.tenant_id)).toContain(t)
    await criar(t)
    const depois = await owner<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes_visita()`
    expect(depois.map((p) => p.tenant_id)).not.toContain(t)
    const { conectarApp } = await import('./conexoes.js')
    const app = conectarApp()
    try {
      await expect(app`SELECT * FROM app_tenants_sem_padroes_visita()`).rejects.toThrow(
        /permission denied/,
      )
    } finally {
      await app.end()
    }
  })
})
