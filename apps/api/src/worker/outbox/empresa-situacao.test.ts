import { criarConexao, novoId } from '@leadtogo/db'
import { completarCnpj } from '@leadtogo/shared'
import { pino } from 'pino'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EnviadorSmtp } from '../../email/enviador.js'
import { FalhaDaReceita, type ProvedorDeReceita } from '../../receita/provedores.js'
import { respostaDaReceita } from '../../receita/servidor-falso.js'
import { ReceitaService } from '../../receita/receita.service.js'
import { configuracaoDeTeste } from '../../testes/app-teste.js'
import { dono, empresaDeOutraConta } from '../../testes/mundo.js'
import { WorkerFilas } from '../worker-filas.service.js'
import { manipuladoresPadrao } from './manipuladores.js'
import { RelayDoOutbox } from './relay.js'

const log = pino({ level: 'silent' })
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
const cnpjsUsados: string[] = []
let filas: WorkerFilas
let n = 0
beforeEach(() => {
  n += 1
  filas = new WorkerFilas(
    configuracaoDeTeste({ FILA_PREFIXO: `leadtogo:fila:s${Date.now()}-${n}` }),
    log,
  )
})
afterEach(async () => {
  await filas.encerrar(2000)
})
afterAll(async () => {
  if (cnpjsUsados.length > 0)
    await dono`DELETE FROM receita_consultas WHERE cnpj = ANY(${cnpjsUsados})`
  await banco.cliente.end({ timeout: 5 })
  await dono.end()
})

let seq = 0
const cnpjNovo = () => {
  seq += 1
  const c = completarCnpj(
    `S${Date.now().toString(36).slice(-6).toUpperCase()}${seq}`.padEnd(8, '0').slice(0, 8) + '0001',
  )
  cnpjsUsados.push(c)
  return c
}

/** Empresa salva "sem verificar" + o evento de reconsulta pendente, no tenant dado. */
async function cenario(
  opcoes: { tentativa?: number; verificada?: boolean; excluida?: boolean } = {},
) {
  const { tenantId } = await empresaDeOutraConta()
  const membroId = novoId()
  const empresaId = novoId()
  const eventoId = novoId()
  const cnpj = cnpjNovo()
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Vendedora')`
    await tx`INSERT INTO empresas (id, tenant_id, tipo_documento, documento, razao_social, nome_fantasia, vendedor_id, situacao_nao_verificada, excluido_em)
      VALUES (${empresaId}, ${tenantId}, 'cnpj', ${cnpj}, 'EXEMPLO LTDA', 'Exemplo', ${membroId}, ${!(opcoes.verificada ?? false)}, ${opcoes.excluida ? new Date() : null})`
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
      VALUES (${eventoId}, ${tenantId}, 'empresa.verificar_situacao', ${empresaId}, ${JSON.stringify({ empresaId, tentativa: opcoes.tentativa ?? 1 })}::jsonb)`
  })
  const lido = <T>(consulta: (tx: Parameters<Parameters<typeof dono.begin>[1]>[0]) => Promise<T>) =>
    dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return consulta(tx as never)
    })
  return {
    tenantId,
    membroId,
    empresaId,
    eventoId,
    cnpj,
    empresa: () =>
      lido(
        async (tx) =>
          (
            await tx`SELECT situacao_nao_verificada AS nv, receita_atualizado_em AS em FROM empresas WHERE id = ${empresaId}`
          )[0],
      ),
    notificacoes: () =>
      lido(
        async (tx) =>
          await tx`SELECT id, membro_id, tipo, titulo, mensagem, link FROM notificacoes WHERE membro_id = ${membroId}`,
      ),
    eventos: () =>
      lido(
        async (tx) =>
          await tx`SELECT id, processado_em, payload, proxima_tentativa_em FROM eventos_outbox WHERE entidade_id = ${empresaId} ORDER BY criado_em`,
      ),
  }
}

function relayCom(provedor: ProvedorDeReceita) {
  const config = configuracaoDeTeste()
  return new RelayDoOutbox({
    banco,
    filas,
    log,
    manipuladores: manipuladoresPadrao(config, new EnviadorSmtp(config, log), {
      banco,
      servico: new ReceitaService(banco, [provedor]),
    }),
  })
}
/**
 * Quantas consultas o relay fez para este CNPJ. O relay reserva eventos do banco inteiro: um evento de
 * reconsulta que sobrou de outro teste também passa pelo provedor, e isso não diz nada sobre este cenário.
 */
const consultasDe = (provedor: { mock: { mock: { calls: unknown[][] } } }, cnpj: string) =>
  provedor.mock.mock.calls.filter(([c]) => c === cnpj).length

const respondendo = (fn: (cnpj: string) => unknown) => {
  const mock = vi.fn(async (cnpj: string) => await fn(cnpj))
  return { nome: 'falso', consultar: mock, mock } satisfies ProvedorDeReceita & {
    mock: typeof mock
  }
}

describe('empresa.verificar_situacao', () => {
  it('a Receita responde e a empresa está ativa: o selo sai e ninguém é avisado', async () => {
    const c = await cenario()
    const provedor = respondendo((cnpj) => respostaDaReceita(cnpj))
    await relayCom(provedor).rodarCiclo()
    expect((await c.empresa())?.['nv']).toBe(false)
    expect((await c.empresa())?.['em']).toBeTruthy()
    expect(await c.notificacoes()).toHaveLength(0)
    expect(consultasDe(provedor, c.cnpj)).toBe(1) // ignora o cache: consulta de verdade
    expect((await c.eventos())[0]?.['processado_em']).toBeTruthy()
  })

  it('empresa baixada: o selo sai e o vendedor responsável é avisado, sem excluir nem alterar a empresa', async () => {
    const c = await cenario()
    await relayCom(
      respondendo((cnpj) =>
        respostaDaReceita(cnpj, {
          situacao_cadastral: 8,
          descricao_situacao_cadastral: 'BAIXADA',
          descricao_motivo_situacao_cadastral: 'EXTINCAO',
        }),
      ),
    ).rodarCiclo()
    expect((await c.empresa())?.['nv']).toBe(false)
    const avisos = await c.notificacoes()
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      id: c.eventoId,
      membro_id: c.membroId,
      tipo: 'empresa.situacao',
      titulo: 'Exemplo não está ativa na Receita',
      link: `/empresas/${c.empresaId}`,
    })
    expect(avisos[0]?.['mensagem']).toContain('BAIXADA (EXTINCAO)')
    const [e] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`
      return tx`SELECT excluido_em, razao_social FROM empresas WHERE id = ${c.empresaId}`
    })
    expect(e).toEqual({ excluido_em: null, razao_social: 'EXEMPLO LTDA' })
  })

  it('CNPJ que a Receita não conhece: o selo sai e o vendedor é avisado', async () => {
    const c = await cenario()
    await relayCom(
      respondendo(() => {
        throw new FalhaDaReceita('nao_encontrado', 'não existe', 'falso')
      }),
    ).rodarCiclo()
    expect((await c.empresa())?.['nv']).toBe(false)
    expect((await c.notificacoes())[0]?.['titulo']).toBe('Exemplo: CNPJ não encontrado na Receita')
  })

  it('Receita ainda fora do ar: mantém o selo e agenda a próxima tentativa para daqui a 1 hora', async () => {
    const c = await cenario({ tentativa: 3 })
    await relayCom(
      respondendo(() => {
        throw new FalhaDaReceita('indisponivel', 'fora', 'falso')
      }),
    ).rodarCiclo()
    expect((await c.empresa())?.['nv']).toBe(true)
    expect(await c.notificacoes()).toHaveLength(0)
    const eventos = await c.eventos()
    expect(eventos).toHaveLength(2)
    expect(eventos[0]?.['processado_em']).toBeTruthy()
    const proximo = eventos[1]
    expect(proximo?.['processado_em']).toBeNull()
    expect(proximo?.['payload']).toMatchObject({ empresaId: c.empresaId, tentativa: 4 })
    const espera = new Date(String(proximo?.['proxima_tentativa_em'])).getTime() - Date.now()
    expect(espera).toBeGreaterThan(55 * 60_000)
    expect(espera).toBeLessThanOrEqual(60 * 60_000)

    // O evento adiado não é entregue antes da hora: um novo ciclo não faz nada
    const provedor = respondendo((cnpj) => respostaDaReceita(cnpj))
    await relayCom(provedor).rodarCiclo()
    expect(consultasDe(provedor, c.cnpj)).toBe(0)
  })

  it('depois da 24ª tentativa desiste: avisa que não foi possível verificar e não agenda mais', async () => {
    const c = await cenario({ tentativa: 24 })
    await relayCom(
      respondendo(() => {
        throw new FalhaDaReceita('indisponivel', 'fora', 'falso')
      }),
    ).rodarCiclo()
    expect((await c.empresa())?.['nv']).toBe(true)
    expect((await c.notificacoes())[0]?.['titulo']).toBe(
      'Exemplo: situação na Receita não verificada',
    )
    expect(await c.eventos()).toHaveLength(1)
  })

  it('empresa excluída ou já verificada: não consulta a Receita nem avisa', async () => {
    for (const opcoes of [{ excluida: true }, { verificada: true }]) {
      const c = await cenario(opcoes)
      const provedor = respondendo((cnpj) => respostaDaReceita(cnpj))
      await relayCom(provedor).rodarCiclo()
      expect(consultasDe(provedor, c.cnpj), JSON.stringify(opcoes)).toBe(0)
      expect(await c.notificacoes()).toHaveLength(0)
      expect((await c.eventos())[0]?.['processado_em']).toBeTruthy()
    }
  })

  it('erro inesperado: o evento volta com espera progressiva e o selo continua', async () => {
    const c = await cenario()
    await relayCom(
      respondendo(() => {
        throw new Error('falha inesperada')
      }),
    ).rodarCiclo()
    // o erro vira "indisponível" dentro do serviço (cai para a próxima fonte e, sem cache, para 503): agenda de novo
    expect((await c.empresa())?.['nv']).toBe(true)
    expect(await c.eventos()).toHaveLength(2)
  })
})
