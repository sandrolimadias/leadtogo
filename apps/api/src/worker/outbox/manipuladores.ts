import { randomBytes } from 'node:crypto'

import { sql } from '@leadtogo/db'

import type { Configuracao } from '../../configuracao/configuracao.js'
import { hashDoToken } from '../../convites/token.js'
import type { EnviadorSmtp } from '../../email/enviador.js'
import { emailConvite } from '../../email/modelos.js'
import { FILAS } from '../filas.js'
import type { JobDeNotificacao } from '../processadores.js'
import type { ManipuladorDeEvento } from './relay.js'

/** Id do job de um evento: o BullMQ descarta repetição enquanto o job existir. */
export const jobIdDoEvento = (eventoId: string) => `evento-${eventoId}`

/**
 * Tipos de evento entregues pelo relay. Os `teste.*` só existem fora de produção e servem aos testes
 * do relay.
 */
export function manipuladoresPadrao(
  config: Configuracao,
  enviador: EnviadorSmtp,
): Record<string, ManipuladorDeEvento> {
  const manipuladores: Record<string, ManipuladorDeEvento> = {}

  /**
   * Convite: o TOKEN nasce aqui, na hora do envio, e só o hash vai para o banco, na mesma transação
   * em que o e-mail é enviado. O token não passa pelo outbox, pelo Valkey nem por log. Se o envio
   * falhar, a transação desfaz a gravação do hash e o relay tenta de novo com espera progressiva.
   */
  manipuladores['convite.enviar'] = async (evento, { tx }) => {
    const { conviteId } = evento.payload as { conviteId: string }
    const [convite] = await tx.execute<{
      email: string
      papel: string
      convidado_por: string
      razao_social: string
      nome_fantasia: string | null
      convidante: string | null
    }>(sql`
      SELECT c.email, c.papel, c.convidado_por, t.razao_social, t.nome_fantasia, m.nome AS convidante
      FROM convites c
      JOIN tenants t ON t.id = c.tenant_id
      LEFT JOIN membros m ON m.id = c.convidado_por
      WHERE c.id = ${conviteId} AND c.aceito_em IS NULL AND c.revogado_em IS NULL AND c.expira_em > now()
      FOR UPDATE OF c`)
    if (!convite) return // cancelado, aceito, substituído ou vencido antes do envio: nada a enviar

    const token = randomBytes(32).toString('base64url')
    await tx.execute(sql`
      UPDATE convites SET token_hash = ${hashDoToken(token)}, atualizado_em = now() WHERE id = ${conviteId}`)
    const link = `${new URL(config.APP_URL).origin}/convite?token=${token}`
    await enviador.enviar(
      convite.email,
      emailConvite({
        empresa: convite.nome_fantasia ?? convite.razao_social,
        convidadoPor: convite.convidante ?? 'Um administrador',
        papel: convite.papel,
        link,
      }),
    )
  }

  /** Notificação para um membro: vira um job na fila `notificacoes`, com o id do evento como jobId. */
  manipuladores['notificacao.criar'] = async (evento, { filas }) => {
    const dados = evento.payload as Omit<JobDeNotificacao, 'tenantId' | 'eventoId'>
    await filas
      .fila(FILAS.notificacoes)
      .add(
        'criar',
        { ...dados, tenantId: evento.tenantId, eventoId: evento.id } satisfies JobDeNotificacao,
        { jobId: jobIdDoEvento(evento.id) },
      )
  }

  if (config.NODE_ENV !== 'production') {
    manipuladores['teste.evento'] = async (evento, { tx, filas }) => {
      // Registra o tenant que o banco enxergava ao entregar: prova que o evento rodou no tenant dele
      const [cfg] = await tx.execute<{ tenant: string }>(
        sql`SELECT current_setting('app.tenant_id', true) AS tenant`,
      )
      const dados = (evento.payload ?? {}) as Record<string, unknown>
      await filas
        .fila(FILAS.teste)
        .add(
          'espera',
          { ...dados, eventoId: evento.id, tenantVisto: cfg?.tenant },
          { jobId: jobIdDoEvento(evento.id) },
        )
    }
    manipuladores['teste.falha'] = () =>
      Promise.reject(new Error('falha de teste ao entregar o evento'))
  }
  return manipuladores
}
