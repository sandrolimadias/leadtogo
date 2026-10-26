import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { canalDoSino, idDeterministico, type Publicador } from '../chamados/notificar-chamado.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { emailPortalEvento } from '../email/modelos.js'
import { chavesDe, cifrar } from '../seguranca/cifra.js'
import { FILAS } from '../worker/filas.js'
import type { ManipuladorDeEvento } from '../worker/outbox/relay.js'

/** Tipo do evento do outbox que vira aviso (sino e e-mail) ao cliente sobre um evento da agenda. */
export const EVENTO_NOTIFICAR_EVENTO = 'portal.evento_notificar'

export type PayloadDeEvento =
  /** Saiu da lista de espera para uma vaga */
  | { tipo: 'vaga'; confirmacaoId: string }
  /** A equipe cancelou o evento: avisa quem está confirmado ou na lista de espera */
  | { tipo: 'cancelado'; eventoId: string }
  /** Falta (até) 24 horas: avisa quem está confirmado */
  | { tipo: 'lembrete'; eventoId: string }

/** Grava o evento na mesma transação do ato (o sino e o e-mail só saem depois do commit). */
export async function agendarNotificacaoDeEvento(
  tx: Transacao,
  tenantId: string,
  payload: PayloadDeEvento,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_NOTIFICAR_EVENTO},
            ${'confirmacaoId' in payload ? payload.confirmacaoId : payload.eventoId},
            ${JSON.stringify(payload)}::jsonb)`)
}

type Destinatario = {
  contato_id: string
  nome: string
  email: string
  confirmacao_id: string
  evento_id: string
  titulo: string
  inicio_em: string | Date
  local: string | null
  cancelado_motivo: string | null
  portal_nome: string | null
  empresa_nome: string
  quer_email: boolean
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

/** "quinta-feira, 12 de novembro às 18:30" */
export const dataDoEvento = (d: string | Date): string =>
  FORMATO_DATA.format(new Date(d))
    .replace(/,? (\d{2}:\d{2})$/, ' às $1')
    .replace(/^(\S+),? /, '$1, ')

const TEXTO: Record<PayloadDeEvento['tipo'], (titulo: string) => string> = {
  vaga: (t) => `Vaga confirmada: ${t}`,
  cancelado: (t) => `Evento cancelado: ${t}`,
  lembrete: (t) => `Lembrete: ${t}`,
}

function linhasDoAviso(p: PayloadDeEvento, d: Destinatario): string[] {
  const quando = dataDoEvento(d.inicio_em)
  switch (p.tipo) {
    case 'vaga':
      return [
        `Abriu uma vaga e a sua presença em “${d.titulo}” está confirmada.`,
        `${quando}${d.local ? ` · ${d.local}` : ''}`,
      ]
    case 'cancelado':
      return [
        `A equipe cancelou “${d.titulo}”, que seria ${quando}.`,
        ...(d.cancelado_motivo ? [`Motivo: ${d.cancelado_motivo}`] : []),
      ]
    case 'lembrete':
      return [`“${d.titulo}” é em breve: ${quando}${d.local ? ` · ${d.local}` : ''}.`]
  }
}

/**
 * Manipulador do evento `portal.evento_notificar`: resolve quem recebe, grava o sino do cliente (idempotente: o id
 * sai do evento e do destinatário), enfileira o e-mail e, DEPOIS do commit, avisa o tempo real. Só avisa quem tem
 * acesso ativo e só com o portal ligado.
 */
export function manipuladorDeNotificacaoDeEvento(
  config: Configuracao,
  publicar: Publicador,
): ManipuladorDeEvento {
  return async (evento, { tx, filas }) => {
    const p = evento.payload as PayloadDeEvento
    const filtro =
      p.tipo === 'vaga'
        ? sql`ec.id = ${p.confirmacaoId} AND ec.situacao = 'confirmado'`
        : p.tipo === 'lembrete'
          ? sql`ec.evento_id = ${p.eventoId} AND ec.situacao = 'confirmado'`
          : sql`ec.evento_id = ${p.eventoId} AND ec.situacao IN ('confirmado', 'lista_espera')`
    const destinatarios = await tx.execute<Destinatario>(sql`
      SELECT pa.contato_id, ct.nome, pa.email::text AS email, ec.id AS confirmacao_id, ev.id AS evento_id,
             ev.titulo, ev.inicio_em, ev.local, ev.cancelado_motivo, tc.portal_nome,
             coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome,
             coalesce(pp.email_eventos, true) AS quer_email
      FROM evento_confirmacoes ec
      JOIN eventos ev ON ev.id = ec.evento_id AND ev.excluido_em IS NULL
      JOIN portal_acessos pa ON pa.id = ec.acesso_id AND pa.situacao = 'ativo' AND pa.excluido_em IS NULL
      JOIN contatos ct ON ct.id = pa.contato_id
      JOIN empresas e ON e.id = pa.empresa_id
      LEFT JOIN portal_preferencias pp ON pp.acesso_id = pa.id
      JOIN tenant_configuracoes tc ON tc.tenant_id = ev.tenant_id AND tc.portal_ativo
      WHERE ${filtro}`)
    if (destinatarios.length === 0) return

    const novos: { contatoId: string; id: string; tipo: string; titulo: string }[] = []
    for (const d of destinatarios) {
      const titulo = TEXTO[p.tipo](d.titulo)
      const linhas = linhasDoAviso(p, d)
      const mensagem = linhas.join(' ')
      const link = '/agenda'
      const id = idDeterministico(evento.id, d.contato_id, 'sino-evento')
      const [feita] = await tx.execute<{ id: string }>(sql`
        INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, canal, tipo, titulo, mensagem, link)
        VALUES (${id}, ${evento.tenantId}, 'contato', ${d.contato_id}, 'sino', ${`evento.${p.tipo}`}, ${titulo}, ${mensagem}, ${link})
        ON CONFLICT (id) DO NOTHING RETURNING id`)
      if (!feita) continue
      novos.push({ contatoId: d.contato_id, id, tipo: `evento.${p.tipo}`, titulo })
      // O cliente pode desligar o e-mail dos eventos em Preferências; o sino continua
      if (d.quer_email && config.PORTAL_URL && config.TOKEN_ENCRYPTION_KEY && config.SMTP_HOST) {
        const idEmail = idDeterministico(evento.id, d.contato_id, 'email-evento')
        await tx.execute(sql`
          INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, canal, tipo, titulo, mensagem, link, enviada_em)
          VALUES (${idEmail}, ${evento.tenantId}, 'contato', ${d.contato_id}, 'email', ${`evento.${p.tipo}`}, ${titulo}, ${mensagem}, ${link}, now())
          ON CONFLICT (id) DO NOTHING`)
        const modelo = emailPortalEvento({
          nome: d.nome,
          portal: d.portal_nome ?? d.empresa_nome,
          titulo,
          linhas,
          link: `${new URL(config.PORTAL_URL).origin}${link}`,
        })
        const conteudo = cifrar(JSON.stringify({ para: d.email, ...modelo }), chavesDe(config))
        await filas.fila(FILAS.email).add(
          'enviar',
          { p: conteudo },
          {
            jobId: `evento-email-${idEmail}`,
            attempts: config.EMAIL_TENTATIVAS,
            backoff: { type: 'exponential', delay: config.EMAIL_ESPERA_MS },
          },
        )
      }
    }
    if (novos.length === 0) return
    return async () => {
      for (const n of novos) {
        await publicar(
          canalDoSino(config, evento.tenantId, n.contatoId),
          JSON.stringify({ id: n.id, tipo: n.tipo, titulo: n.titulo }),
        ).catch(() => undefined)
      }
    }
  }
}
