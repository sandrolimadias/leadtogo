import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { AnexoDoChamado, Chamado, DownloadDeAnexo, EnvioDeAnexo } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas, configuracaoDeTeste } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { esperarAte } from '../testes/espera.js'
import { dono } from '../testes/mundo.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { type ClamdFalso, eicar, subirClamdFalso } from './clamd-falso.js'
import { chamarEm, empresaDeChamados, noTenant, PERMISSOES } from './teste-chamados.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
let app: INestApplication<Server>
let semAntivirus: INestApplication<Server>
let clamd: ClamdFalso
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const chamar = chamarEm(() => app)
const chamarSem = chamarEm(() => semAntivirus)
const erroDe = (r: { body: unknown }) => (r.body as RespostaDeErro).erro

beforeAll(async () => {
  await limparLimitesAuth(valkey)
  clamd = await subirClamdFalso()
  const antivirus = { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(clamd.porta) }
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1', ...antivirus }))
  semAntivirus = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
  worker = await subirWorkerDeTeste(antivirus)
})
afterAll(async () => {
  await worker.parar()
  await app.close()
  await semAntivirus.close()
  await clamd.parar()
  await valkey.quit()
  await dono.end()
})

async function cenario() {
  const e = await empresaDeChamados(app)
  const juridico = await e.areaPadrao('juridico')
  const financeiro = await e.areaPadrao('financeiro')
  const solicitante = await e.pessoa('Solicitante', PERMISSOES.solicitante)
  const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
  const outro = await e.pessoa('Atendente do Financeiro', PERMISSOES.atendente)
  const leitor = await e.pessoa('Leitor', { 'chamados.ver': 'todas' })
  await chamar('put', e.d.cookie, `/chamados/areas/${juridico}/membros`, {
    membros: [{ membroId: atendente.membroId }],
    perfilIds: [],
  })
  await chamar('put', e.d.cookie, `/chamados/areas/${financeiro}/membros`, {
    membros: [{ membroId: outro.membroId }],
    perfilIds: [],
  })
  const ch = (
    await chamar('post', solicitante.cookie, '/chamados', {
      assunto: 'Contrato do cliente X',
      areaId: juridico,
    })
  ).body as Chamado
  return { e, juridico, solicitante, atendente, outro, leitor, ch }
}

const tipos = (c: Chamado) => c.eventos.map((v) => v.tipo)

describe('mensagens', () => {
  it('a primeira resposta da equipe marca a métrica, assume o chamado e o coloca em atendimento; a segunda não repete', async () => {
    const c = await cenario()
    const r1 = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, {
      corpo: 'Vou analisar.',
    })
    expect(r1.status).toBe(201)
    const ch = r1.body as Chamado
    expect(ch).toMatchObject({ status: 'em_atendimento', responsavel: { nome: 'Atendente' } })
    expect(ch.primeiraRespostaEm).not.toBeNull()
    expect(ch.mensagens.map((m) => [m.autor.nome, m.corpo])).toEqual([
      ['Atendente', 'Vou analisar.'],
    ])
    expect(tipos(ch)).toEqual(['aberto', 'mensagem', 'primeira_resposta', 'assumido'])

    const r2 = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, {
      corpo: 'Mais uma dúvida.',
    })
    const de2 = r2.body as Chamado
    expect(de2.primeiraRespostaEm).toBe(ch.primeiraRespostaEm)
    expect(tipos(de2).filter((t) => t === 'primeira_resposta')).toHaveLength(1)
  })

  it('o solicitante complementa (sem contar como resposta da equipe) e, em Aguardando cliente, devolve ao atendimento', async () => {
    const c = await cenario()
    const doSolicitante = await chamar(
      'post',
      c.solicitante.cookie,
      `/chamados/${c.ch.id}/mensagens`,
      { corpo: 'Segue o contexto.' },
    )
    expect(doSolicitante.status).toBe(201)
    expect((doSolicitante.body as Chamado).primeiraRespostaEm).toBeNull()
    expect((doSolicitante.body as Chamado).status).toBe('pendente')

    await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/assumir`)
    await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/status`, {
      status: 'aguardando_cliente',
    })
    const volta = (
      await chamar('post', c.solicitante.cookie, `/chamados/${c.ch.id}/mensagens`, {
        corpo: 'Aqui está.',
      })
    ).body as Chamado
    expect(volta.status).toBe('em_atendimento')
    expect(volta.eventos.at(-1)).toMatchObject({
      tipo: 'status_alterado',
      statusDe: 'aguardando_cliente',
      statusPara: 'em_atendimento',
    })
  })

  it('não responde quem não atende nem abriu; resolvido e fechado recusam; outro tenant e outra área não alcançam', async () => {
    const c = await cenario()
    const leitor = await chamar('post', c.leitor.cookie, `/chamados/${c.ch.id}/mensagens`, {
      corpo: 'Opa',
    })
    expect(leitor.status).toBe(403)
    expect(erroDe(leitor)).toBe('acesso_negado')
    expect(
      (await chamar('post', c.outro.cookie, `/chamados/${c.ch.id}/mensagens`, { corpo: 'Opa' }))
        .status,
    ).toBe(404)
    const outraEmpresa = await empresaDeChamados(app)
    expect(
      (
        await chamar('post', outraEmpresa.d.cookie, `/chamados/${c.ch.id}/mensagens`, {
          corpo: 'Opa',
        })
      ).status,
    ).toBe(404)
    expect(
      (await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, { corpo: '   ' }))
        .status,
    ).toBe(400)

    await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/assumir`)
    await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/status`, { status: 'resolvido' })
    const resolvido = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, {
      corpo: 'Mais?',
    })
    expect(erroDe(resolvido)).toBe('chamado_resolvido')
    await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/status`, { status: 'fechado' })
    expect(
      erroDe(
        await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, {
          corpo: 'Mais?',
        }),
      ),
    ).toBe('chamado_fechado')
  })
})

describe('notas internas', () => {
  it('só quem atende anota; a nota nunca entra na conversa nem aparece para o solicitante', async () => {
    const c = await cenario()
    const negada = await chamar('post', c.solicitante.cookie, `/chamados/${c.ch.id}/notas`, {
      corpo: 'Segredo',
    })
    expect(negada.status).toBe(403)
    const ok = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/notas`, {
      corpo: 'Cliente inadimplente, cuidado.',
    })
    expect(ok.status).toBe(201)
    const doAtendente = ok.body as Chamado
    expect(doAtendente.notasInternas.map((n) => n.corpo)).toEqual([
      'Cliente inadimplente, cuidado.',
    ])
    expect(doAtendente.mensagens).toEqual([])
    expect(tipos(doAtendente)).toEqual(['aberto', 'nota_interna'])

    const doSolicitante = (await chamar('get', c.solicitante.cookie, `/chamados/${c.ch.id}`))
      .body as Chamado
    expect(doSolicitante.notasInternas).toEqual([])
    expect(JSON.stringify(doSolicitante)).not.toContain('inadimplente')
    expect(tipos(doSolicitante)).toEqual(['aberto'])
    // fica em tabela própria
    const [{ n } = { n: 0 }] = await noTenant(
      c.e.d.tenantId,
      (tx) =>
        tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM chamado_mensagens WHERE chamado_id = ${c.ch.id}`,
    )
    expect(n).toBe(0)
  })
})

/** Envia o arquivo pela URL pré-assinada, como o navegador faria. */
async function enviarArquivo(url: string, bytes: Buffer) {
  const r = await fetch(url, { method: 'PUT', body: new Uint8Array(bytes) })
  expect(r.ok).toBe(true)
}

async function anexar(cookie: string, chamadoId: string, nome: string, bytes: Buffer) {
  const pedido = await chamar('post', cookie, `/chamados/${chamadoId}/anexos`, {
    nome,
    mime: 'application/pdf',
    tamanho: bytes.length,
  })
  expect(pedido.status).toBe(201)
  const envio = pedido.body as EnvioDeAnexo
  await enviarArquivo(envio.url, bytes)
  const confirmado = await chamar(
    'post',
    cookie,
    `/chamados/${chamadoId}/anexos/${envio.anexoId}/confirmar`,
  )
  return { envio, confirmado }
}

const estadoDe = async (tenantId: string, anexoId: string) =>
  (
    await noTenant(
      tenantId,
      (tx) => tx<{ estado: string }[]>`SELECT estado FROM chamado_anexos WHERE id = ${anexoId}`,
    )
  )[0]?.estado

describe('anexos', () => {
  it('sem antivírus configurado, o envio de anexos fica desligado (503)', async () => {
    const e = await empresaDeChamados(semAntivirus)
    const quem = await e.pessoa('Atendente', PERMISSOES.tudo)
    const ch = (
      await chamarSem('post', quem.cookie, '/chamados', {
        assunto: 'Assunto qualquer',
        areaId: await e.areaPadrao('juridico'),
      })
    ).body as Chamado
    const r = await chamarSem('post', quem.cookie, `/chamados/${ch.id}/anexos`, {
      nome: 'a.pdf',
      mime: 'application/pdf',
      tamanho: 10,
    })
    expect(r.status).toBe(503)
    expect(erroDe(r)).toBe('anexos_indisponiveis')
  })

  it('arquivo limpo: envia direto ao Garage, o worker varre, vira "limpo" e baixa só depois', async () => {
    const c = await cenario()
    const conteudo = Buffer.from('%PDF-1.4 contrato de teste do cliente')
    const { envio, confirmado } = await anexar(
      c.atendente.cookie,
      c.ch.id,
      '../../contrato final.pdf',
      conteudo,
    )
    expect(confirmado.status).toBe(200)
    const anexo = confirmado.body as AnexoDoChamado
    // o nome vem limpo de caminho
    expect(anexo).toMatchObject({
      nome: 'contrato final.pdf',
      estado: 'pendente_varredura',
      tamanho: conteudo.length,
    })
    // idempotente
    expect(
      (
        await chamar(
          'post',
          c.atendente.cookie,
          `/chamados/${c.ch.id}/anexos/${envio.anexoId}/confirmar`,
        )
      ).status,
    ).toBe(200)

    await esperarAte(
      async () => (await estadoDe(c.e.d.tenantId, envio.anexoId)) === 'limpo',
      20_000,
    )
    expect(clamd.recebidos.at(-1)?.bytes.equals(conteudo)).toBe(true)

    const msg = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, {
      corpo: 'Segue o contrato.',
      anexoIds: [envio.anexoId],
    })
    expect(msg.status).toBe(201)
    const ch = msg.body as Chamado
    expect(ch.mensagens[0]?.anexos).toEqual([
      expect.objectContaining({ id: envio.anexoId, estado: 'limpo', nome: 'contrato final.pdf' }),
    ])
    expect(tipos(ch)).toContain('anexo')

    // o solicitante também baixa; a URL entrega os mesmos bytes
    const baixa = await chamar(
      'get',
      c.solicitante.cookie,
      `/chamados/${c.ch.id}/anexos/${envio.anexoId}/download`,
    )
    expect(baixa.status).toBe(200)
    const arquivo = await fetch((baixa.body as DownloadDeAnexo).url)
    expect(Buffer.from(await arquivo.arrayBuffer()).equals(conteudo)).toBe(true)
  })

  it('arquivo infectado (EICAR): fica bloqueado, aparece como bloqueado e nunca baixa', async () => {
    const c = await cenario()
    const { envio } = await anexar(c.atendente.cookie, c.ch.id, 'fatura.pdf', eicar())
    await esperarAte(
      async () => (await estadoDe(c.e.d.tenantId, envio.anexoId)) === 'infectado',
      20_000,
    )
    const [linha] = await noTenant(
      c.e.d.tenantId,
      (tx) =>
        tx<
          { assinatura: string }[]
        >`SELECT assinatura FROM chamado_anexos WHERE id = ${envio.anexoId}`,
    )
    expect(linha?.assinatura).toBe('Eicar-Test-Signature')

    const msg = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, {
      corpo: 'Anexo.',
      anexoIds: [envio.anexoId],
    })
    expect((msg.body as Chamado).mensagens[0]?.anexos[0]?.estado).toBe('infectado')
    for (const cookie of [c.atendente.cookie, c.solicitante.cookie, c.e.d.cookie]) {
      const r = await chamar('get', cookie, `/chamados/${c.ch.id}/anexos/${envio.anexoId}/download`)
      expect(r.status).toBe(409)
      expect(erroDe(r)).toBe('anexo_bloqueado')
    }
  })

  it('ainda em verificação: 409 anexo_em_verificacao; anexo solto ou de outra empresa: 404', async () => {
    const c = await cenario()
    const mensagem = (
      await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, { corpo: 'Oi' })
    ).body as Chamado
    const anexoId = novoId()
    await noTenant(c.e.d.tenantId, async (tx) => {
      await tx`INSERT INTO chamado_anexos (id, tenant_id, chamado_id, mensagem_id, chave_arquivo, nome, mime, tamanho, enviado_em)
        VALUES (${anexoId}, ${c.e.d.tenantId}, ${c.ch.id}, ${mensagem.mensagens[0]?.id as string}, ${`k-${anexoId}`}, 'a.pdf', 'application/pdf', 10, now())`
    })
    const pendente = await chamar(
      'get',
      c.atendente.cookie,
      `/chamados/${c.ch.id}/anexos/${anexoId}/download`,
    )
    expect(pendente.status).toBe(409)
    expect(erroDe(pendente)).toBe('anexo_em_verificacao')
    const outra = await empresaDeChamados(app)
    expect(
      (await chamar('get', outra.d.cookie, `/chamados/${c.ch.id}/anexos/${anexoId}/download`))
        .status,
    ).toBe(404)
    expect(
      (await chamar('get', c.atendente.cookie, `/chamados/${c.ch.id}/anexos/${novoId()}/download`))
        .status,
    ).toBe(404)
  })

  it('confirmar sem o arquivo no Garage: 409; com tamanho diferente do dito: 400 e o anexo some', async () => {
    const c = await cenario()
    const pedir = async (tamanho: number) =>
      (
        await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/anexos`, {
          nome: 'a.pdf',
          mime: 'application/pdf',
          tamanho,
        })
      ).body as EnvioDeAnexo
    const vazio = await pedir(20)
    const sem = await chamar(
      'post',
      c.atendente.cookie,
      `/chamados/${c.ch.id}/anexos/${vazio.anexoId}/confirmar`,
    )
    expect(sem.status).toBe(409)
    expect(erroDe(sem)).toBe('anexo_nao_enviado')

    const errado = await pedir(20)
    await enviarArquivo(errado.url, Buffer.alloc(50, 1))
    const r = await chamar(
      'post',
      c.atendente.cookie,
      `/chamados/${c.ch.id}/anexos/${errado.anexoId}/confirmar`,
    )
    expect(r.status).toBe(400)
    expect(erroDe(r)).toBe('anexo_invalido')
    expect(
      (
        await chamar(
          'post',
          c.atendente.cookie,
          `/chamados/${c.ch.id}/anexos/${errado.anexoId}/confirmar`,
        )
      ).status,
    ).toBe(404)
  })

  it('regras: 25 MB no máximo, só quem pode responder anexa, e a mensagem só leva anexos seus, enviados e livres', async () => {
    const c = await cenario()
    const grande = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/anexos`, {
      nome: 'a.bin',
      mime: 'application/octet-stream',
      tamanho: 25 * 1024 * 1024 + 1,
    })
    expect(grande.status).toBe(400)
    const leitor = await chamar('post', c.leitor.cookie, `/chamados/${c.ch.id}/anexos`, {
      nome: 'a.pdf',
      mime: 'application/pdf',
      tamanho: 10,
    })
    expect(leitor.status).toBe(403)

    const conteudo = Buffer.from('arquivo do solicitante')
    const { envio } = await anexar(c.solicitante.cookie, c.ch.id, 'meu.pdf', conteudo)
    // outra pessoa não leva o anexo do solicitante
    const roubado = await chamar('post', c.atendente.cookie, `/chamados/${c.ch.id}/mensagens`, {
      corpo: 'Olha',
      anexoIds: [envio.anexoId],
    })
    expect(roubado.status).toBe(400)
    expect(erroDe(roubado)).toBe('anexo_invalido')
    // o dono leva, e não leva duas vezes
    expect(
      (
        await chamar('post', c.solicitante.cookie, `/chamados/${c.ch.id}/mensagens`, {
          corpo: 'Anexo',
          anexoIds: [envio.anexoId],
        })
      ).status,
    ).toBe(201)
    expect(
      erroDe(
        await chamar('post', c.solicitante.cookie, `/chamados/${c.ch.id}/mensagens`, {
          corpo: 'De novo',
          anexoIds: [envio.anexoId],
        }),
      ),
    ).toBe('anexo_invalido')
    // mais de 5 anexos numa mensagem: recusado na entrada
    const seis = Array.from({ length: 6 }, () => novoId())
    expect(
      (
        await chamar('post', c.solicitante.cookie, `/chamados/${c.ch.id}/mensagens`, {
          corpo: 'Muitos',
          anexoIds: seis,
        })
      ).status,
    ).toBe(400)
  })
})
