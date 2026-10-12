import type { Conexao } from '@leadtogo/db'
import { sql } from '@leadtogo/db'
import type { Logger } from 'pino'

import type { WorkerFilas } from '../worker-filas.service.js'

export type Transacao = Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]

export interface EventoDoOutbox {
  id: string
  tenantId: string
  tipo: string
  payload: unknown
  /** Tentativas até agora, contando a atual */
  tentativas: number
}

/**
 * Entrega um evento ao seu destino (em geral, enfileira um job). Roda numa transação com o tenant do
 * evento ativo (`SET LOCAL app.tenant_id`). Se lançar erro, o evento volta com espera progressiva.
 * Se enfileirar usando `jobId: 'evento-<id>'`, uma segunda entrega do mesmo evento é descartada
 * enquanto o job existir; depois disso, quem consome precisa ser idempotente.
 *
 * Um manipulador pode devolver uma função `aposCommit`: o relay faz o commit da transação do
 * manipulador, **depois** chama a função (sem transação aberta, sem segurar conexão do pool) e só então
 * marca o evento como entregue. Serve a efeitos externos que dependem do que a transação gravou (ex.:
 * enviar um e-mail com um link cujo hash precisa estar visível quando a pessoa clicar). Se a função
 * lançar erro, o evento volta com espera progressiva, e o manipulador roda de novo na próxima tentativa.
 */
export type ManipuladorDeEvento = (
  evento: EventoDoOutbox,
  contexto: { tx: Transacao; filas: WorkerFilas },
) => Promise<void | (() => Promise<void>)>

/** Espera antes da tentativa seguinte: 5 s, 10 s, 20 s... até 1 h. */
export function esperaProgressivaMs(tentativas: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, tentativas - 1), 3_600_000)
}

export interface OpcoesDoRelay {
  banco: Conexao
  filas: WorkerFilas
  log: Logger
  manipuladores: Record<string, ManipuladorDeEvento>
  /** Depois desta tentativa o evento deixa de ser reservado (`falhou_em`) */
  maxTentativas?: number
  lote?: number
  /** Quanto tempo um relay segura um evento reservado, em segundos */
  reservaS?: number
}

/**
 * Relay do outbox: entrega à fila os eventos gravados pelas transações de negócio, sem papel que
 * ignore o RLS. A função `app_reservar_eventos` (SECURITY DEFINER) só devolve (id, tenant_id); o
 * resto é lido com o tenant do evento ativo, sob RLS. Vários relays podem rodar juntos: a reserva
 * usa `FOR UPDATE SKIP LOCKED`.
 */
export class RelayDoOutbox {
  private readonly maxTentativas: number
  private readonly lote: number
  private readonly reservaS: number

  constructor(private readonly o: OpcoesDoRelay) {
    this.maxTentativas = o.maxTentativas ?? 8
    this.lote = o.lote ?? 50
    this.reservaS = o.reservaS ?? 60
  }

  /** Um ciclo: reserva um lote e entrega cada evento. */
  async rodarCiclo(): Promise<{ reservados: number; entregues: number; falhas: number }> {
    const reservados = await this.o.banco.cliente<{ id: string; tenant_id: string }[]>`
      SELECT id, tenant_id FROM app_reservar_eventos(${this.lote}, ${this.reservaS})`
    let entregues = 0
    let falhas = 0
    for (const r of reservados) {
      if (await this.processar(r.id, r.tenant_id)) entregues += 1
      else falhas += 1
    }
    return { reservados: reservados.length, entregues, falhas }
  }

  private noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.o.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  private async processar(id: string, tenantId: string): Promise<boolean> {
    try {
      let aposCommit: (() => Promise<void>) | undefined
      await this.noTenant(tenantId, async (tx) => {
        const [linha] = await tx.execute<{
          tipo: string
          payload: unknown
          tentativas: number
        }>(sql`
          SELECT tipo, payload, tentativas FROM eventos_outbox
          WHERE id = ${id} AND processado_em IS NULL AND falhou_em IS NULL FOR UPDATE`)
        if (!linha) return // outro relay já entregou, ou o evento sumiu
        // O cliente do Drizzle devolve jsonb como texto: lê o JSON aqui, uma vez
        const payload: unknown =
          typeof linha.payload === 'string' ? JSON.parse(linha.payload) : linha.payload
        const manipulador = this.o.manipuladores[linha.tipo]
        if (!manipulador) throw new Error(`tipo de evento desconhecido: ${linha.tipo}`)
        const depois = await manipulador(
          { id, tenantId, tipo: linha.tipo, payload, tentativas: linha.tentativas },
          { tx, filas: this.o.filas },
        )
        if (typeof depois === 'function') {
          aposCommit = depois // a marcação de entregue fica para depois do efeito externo
          return
        }
        await this.marcarEntregue(tx, id)
      })
      if (aposCommit) {
        await aposCommit()
        await this.noTenant(tenantId, (tx) => this.marcarEntregue(tx, id))
      }
      return true
    } catch (erro) {
      await this.registrarFalha(id, tenantId, erro)
      return false
    }
  }

  /** Entregue: o payload sai do banco (o job o carrega) e a reserva é liberada. */
  private async marcarEntregue(tx: Transacao, id: string): Promise<void> {
    await tx.execute(sql`
      UPDATE eventos_outbox
      SET processado_em = now(), payload = '{}'::jsonb, reservado_ate = NULL, ultimo_erro = NULL
      WHERE id = ${id} AND processado_em IS NULL`)
  }

  /** Falhou: marca o erro e agenda a próxima tentativa; esgotadas as tentativas, `falhou_em` (o payload é MANTIDO, para o `--reprocessar` do `outbox-tratar`). */
  private async registrarFalha(id: string, tenantId: string, erro: unknown): Promise<void> {
    const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500)
    try {
      await this.noTenant(tenantId, async (tx) => {
        const [linha] = await tx.execute<{ tentativas: number }>(
          sql`SELECT tentativas FROM eventos_outbox WHERE id = ${id}`,
        )
        if (!linha) return
        const esgotou = linha.tentativas >= this.maxTentativas
        const espera = esperaProgressivaMs(linha.tentativas)
        if (esgotou) {
          await tx.execute(sql`
            UPDATE eventos_outbox
            SET falhou_em = now(), reservado_ate = NULL, ultimo_erro = ${mensagem}
            WHERE id = ${id}`)
          this.o.log.error(
            { evento: id, tentativas: linha.tentativas },
            'evento do outbox esgotou as tentativas',
          )
        } else {
          await tx.execute(sql`
            UPDATE eventos_outbox
            SET proxima_tentativa_em = now() + ${`${espera} milliseconds`}::interval, reservado_ate = NULL, ultimo_erro = ${mensagem}
            WHERE id = ${id}`)
          this.o.log.warn(
            { evento: id, tentativas: linha.tentativas, esperaMs: espera },
            'entrega do evento falhou; nova tentativa agendada',
          )
        }
      })
    } catch (e) {
      // Sem conseguir nem registrar: a reserva expira sozinha e o evento volta ao lote
      this.o.log.error(
        { evento: id, erro: e instanceof Error ? e.message : String(e) },
        'não foi possível registrar a falha do evento',
      )
    }
  }
}
