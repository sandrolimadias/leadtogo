import { criarConexao, novoId } from '@leadtogo/db'
import { afterAll, describe, expect, it } from 'vitest'

import { dono, empresaDeOutraConta } from '../../testes/mundo.js'
import {
  AJUDA,
  type BancoDoOutbox,
  bancoReal,
  executarTratar,
  type SaidaDoComando,
} from './tratar.js'

const url = process.env['DATABASE_URL'] ?? ''
const principal = criarConexao(url, { max: 2, onnotice: () => undefined })
afterAll(async () => {
  await principal.cliente.end()
  await dono.end()
})

function io() {
  const saida: string[] = []
  const erros: string[] = []
  const comando: SaidaDoComando = {
    imprimir: (l) => saida.push(l),
    imprimirErro: (l) => erros.push(l),
  }
  return { comando, saida, erros, tudo: () => [...saida, ...erros].join('\n') }
}
const rodar = (argv: string[], saida: SaidaDoComando) =>
  executarTratar(argv, () => bancoReal(url), saida)

async function eventoEsgotado(erro = 'smtp fora do ar') {
  const { tenantId } = await empresaDeOutraConta()
  const id = novoId()
  await principal.cliente.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, payload, falhou_em, tentativas, ultimo_erro)
      VALUES (${id}, ${tenantId}, 'convite.enviar', ${JSON.stringify({ conviteId: 'c1' })}::jsonb, now(), 8, ${erro})`
  })
  return { id, tenantId }
}
const estado = (tenantId: string, id: string) =>
  principal.cliente.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    const [l] = await tx<
      {
        falhou_em: string | null
        tentativas: number
        tratado_em: string | null
        tratado_por: string | null
        tratamento: string | null
        payload: unknown
      }[]
    >`SELECT falhou_em, tentativas, tratado_em, tratado_por, tratamento, payload FROM eventos_outbox WHERE id = ${id}`
    return l
  })

describe('outbox-tratar: uso', () => {
  it('--ajuda mostra o uso e sai com 0', async () => {
    const o = io()
    expect(await rodar(['--ajuda'], o.comando)).toBe(0)
    expect(o.saida.join('\n')).toBe(AJUDA)
  })

  it('exige exatamente uma ação, um UUID e quem trata (código 2, sem tocar no banco)', async () => {
    const fake = (): BancoDoOutbox => {
      throw new Error('não deveria abrir o banco')
    }
    const casos: string[][] = [
      [],
      ['--listar', '--descartar', novoId(), '--por', 'Ale'],
      ['--reprocessar', 'nao-e-uuid', '--por', 'Ale'],
      ['--descartar', novoId()],
      ['--descartar', novoId(), '--por', '   '],
      ['--descartar', novoId(), '--por', 'x'.repeat(101)],
      ['--apagar-tudo'],
    ]
    for (const argv of casos) {
      const o = io()
      expect(await executarTratar(argv, fake, o.comando), argv.join(' ')).toBe(2)
      expect(o.erros.length).toBeGreaterThan(0)
    }
  })
})

describe('outbox-tratar: contra o banco', () => {
  it('--listar mostra os esgotados sem o payload e com o erro mascarado', async () => {
    const { id, tenantId } = await eventoEsgotado('550 destinatário ana@empresa.com.br rejeitado')
    const o = io()
    const codigo = await rodar(['--listar'], o.comando)
    expect(o.tudo(), 'saída').not.toContain('Falha')
    expect(codigo).toBe(0)
    const linha = o.saida.find((l) => l.startsWith(id))
    expect(linha).toContain(tenantId)
    expect(linha).toContain('convite.enviar')
    expect(linha).toContain('8 tentativas')
    expect(linha).toContain('[email]')
    expect(o.tudo()).not.toContain('ana@empresa')
    expect(o.tudo()).not.toContain('conviteId')
    await rodar(['--descartar', id, '--por', 'teste'], io().comando)
  })

  it('--reprocessar devolve o evento ao relay e registra quem e quando; não trata duas vezes', async () => {
    const { id, tenantId } = await eventoEsgotado()
    const o = io()
    expect(await rodar(['--reprocessar', id, '--por', 'Ale'], o.comando)).toBe(0)
    expect(o.saida[0]).toContain('devolvido ao relay')
    const e = await estado(tenantId, id)
    expect(e).toMatchObject({
      falhou_em: null,
      tentativas: 0,
      tratado_por: 'Ale',
      tratamento: 'reprocessado',
      payload: { conviteId: 'c1' },
    })
    expect(Number.isNaN(new Date(e?.tratado_em ?? '').getTime())).toBe(false)

    const repetido = io()
    expect(await rodar(['--reprocessar', id, '--por', 'Ale'], repetido.comando)).toBe(1)
    expect(repetido.erros[0]).toContain('não encontrado, ou já tratado')
  })

  it('--descartar apaga o conteúdo, registra o tratamento e some da listagem', async () => {
    const { id, tenantId } = await eventoEsgotado()
    const o = io()
    expect(await rodar(['--descartar', id, '--por', 'Ale'], o.comando)).toBe(0)
    expect(o.saida[0]).toContain('descartado')
    expect(await estado(tenantId, id)).toMatchObject({
      payload: {},
      tratado_por: 'Ale',
      tratamento: 'descartado',
    })
    const lista = io()
    await rodar(['--listar'], lista.comando)
    expect(lista.tudo()).not.toContain(id)
  })

  it('evento inexistente: código 1', async () => {
    const o = io()
    expect(await rodar(['--descartar', novoId(), '--por', 'Ale'], o.comando)).toBe(1)
  })

  it('banco inacessível: código 1 com a falha, sem expor a URL', async () => {
    const o = io()
    const codigo = await executarTratar(
      ['--listar'],
      () => bancoReal(['postgres://leadtogo_app', ':segredo123@localhost:1/leadtogo'].join('')),
      o.comando,
    )
    expect(codigo).toBe(1)
    expect(o.tudo()).not.toContain('segredo123')
  })
})
