import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { canalDoSino, idDeterministico, type Publicador } from '../chamados/notificar-chamado.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { emailPortalAviso } from '../email/modelos.js'
import { chavesDe, cifrar } from '../seguranca/cifra.js'
import { FILAS } from '../worker/filas.js'
import type { ManipuladorDeEvento } from '../worker/outbox/relay.js'
import { quandoPodeSair } from './silencio.js'

/** Tipo do evento do outbox que entrega um aviso (sino, e-mail e push) a quem ele alcança. */
export const EVENTO_ENVIAR_AVISO = 'portal.aviso_enviar'

/** Grava o evento na mesma transação (a entrega só roda depois do commit; é idempotente pela situação do aviso). */
export async function agendarEnvioDoAviso(
  tx: Transacao,
  tenantId: string,
  avisoId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_ENVIAR_AVISO}, ${avisoId},
            ${JSON.stringify({ avisoId })}::jsonb)`)
}

type Alvo = {
  acesso_id: string
  empresa_id: string
  contato_id: string
  nome: string
  email: string
  quer_email: boolean
  silencio_inicio: string | null
  silencio_fim: string | null
  tem_push: boolean
  empresa_nome: string
}

/** O endereço completo do link do aviso: caminho do portal, endereço externo ou o início do portal. */
export function enderecoDoLinkDoAviso(portalUrl: string, link: string | null): string {
  const origem = new URL(portalUrl).origin
  if (!link) return origem
  return link.startsWith('/') ? `${origem}${link}` : link
}

/**
 * Manipulador do evento `portal.aviso_enviar`. Na mesma transação: toma o aviso (agendado → enviado; quem chegar
 * depois não faz nada, então reentrega e varredura não duplicam), resolve quem recebe (acesso ativo, empresa do
 * alcance, portal ligado), grava o sino e a entrega de cada pessoa, enfileira o e-mail de quem não o desligou e
 * marca quando o push pode sair (urgente: já; normal: respeita o horário de silêncio). O push em si sai do job
 * `enviar-pushes`, depois do commit.
 */
export function manipuladorDeEnvioDeAviso(
  config: Configuracao,
  publicar: Publicador,
): ManipuladorDeEvento {
  return async (evento, { tx, filas }) => {
    const { avisoId } = evento.payload as { avisoId: string }
    const [aviso] = await tx.execute<{
      mensagem: string
      link: string | null
      urgencia: 'normal' | 'urgente'
      alcance: 'todos' | 'empresas' | 'tags'
    }>(sql`
      UPDATE avisos SET situacao = 'enviado', enviado_em = now(), atualizado_em = now()
      WHERE id = ${avisoId} AND situacao = 'agendado' AND excluido_em IS NULL
      RETURNING mensagem, link, urgencia::text AS urgencia, alcance::text AS alcance`)
    if (!aviso) return

    const [cfg] = await tx.execute<{ portal_ativo: boolean; portal_nome: string | null }>(sql`
      SELECT portal_ativo, portal_nome FROM tenant_configuracoes WHERE tenant_id = ${evento.tenantId}`)
    if (!cfg?.portal_ativo) return

    const alvos = await tx.execute<Alvo>(sql`
      SELECT pa.id AS acesso_id, pa.empresa_id, pa.contato_id, ct.nome, pa.email::text AS email,
             coalesce(pp.email_avisos, true) AS quer_email,
             to_char(pp.silencio_inicio, 'HH24:MI') AS silencio_inicio,
             to_char(pp.silencio_fim, 'HH24:MI') AS silencio_fim,
             EXISTS (SELECT 1 FROM portal_push_inscricoes i
                     WHERE i.acesso_id = pa.id AND i.revogada_em IS NULL) AS tem_push,
             coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome
      FROM portal_acessos pa
      JOIN contatos ct ON ct.id = pa.contato_id
      JOIN empresas e ON e.id = pa.empresa_id AND e.excluido_em IS NULL
      LEFT JOIN portal_preferencias pp ON pp.acesso_id = pa.id
      WHERE pa.situacao = 'ativo' AND pa.excluido_em IS NULL
        AND (${aviso.alcance} = 'todos'
             OR EXISTS (SELECT 1 FROM aviso_empresas ae
                        WHERE ae.aviso_id = ${avisoId} AND ae.empresa_id = pa.empresa_id)
             OR EXISTS (SELECT 1 FROM aviso_tags at JOIN contato_tags ctt ON ctt.tag_id = at.tag_id
                        WHERE at.aviso_id = ${avisoId} AND ctt.contato_id = pa.contato_id))`)

    const urgente = aviso.urgencia === 'urgente'
    const titulo = urgente ? 'Aviso urgente' : 'Aviso'
    const agora = new Date()
    const emailPossivel = Boolean(
      config.PORTAL_URL && config.TOKEN_ENCRYPTION_KEY && config.SMTP_HOST,
    )
    const pushLigado = Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY)
    const novos: { contatoId: string; id: string }[] = []
    let comPush = 0

    for (const a of alvos) {
      const notificacaoId = idDeterministico(evento.id, a.contato_id, 'sino-aviso')
      const [sino] = await tx.execute<{ id: string }>(sql`
        INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, canal, tipo, titulo, mensagem, link)
        VALUES (${notificacaoId}, ${evento.tenantId}, 'contato', ${a.contato_id}, 'sino', 'aviso', ${titulo},
                ${aviso.mensagem}, ${aviso.link})
        ON CONFLICT (id) DO NOTHING RETURNING id`)
      // A mesma pessoa com acesso em duas empresas recebe um sino e um e-mail só
      if (sino) novos.push({ contatoId: a.contato_id, id: notificacaoId })

      let emailEm: Date | null = null
      if (sino && a.quer_email && emailPossivel && config.PORTAL_URL) {
        const idEmail = idDeterministico(evento.id, a.contato_id, 'email-aviso')
        await tx.execute(sql`
          INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, canal, tipo, titulo, mensagem, link, enviada_em)
          VALUES (${idEmail}, ${evento.tenantId}, 'contato', ${a.contato_id}, 'email', 'aviso', ${titulo},
                  ${aviso.mensagem}, ${aviso.link}, now())
          ON CONFLICT (id) DO NOTHING`)
        const modelo = emailPortalAviso({
          nome: a.nome,
          portal: cfg.portal_nome ?? a.empresa_nome,
          urgente,
          mensagem: aviso.mensagem,
          link: enderecoDoLinkDoAviso(config.PORTAL_URL, aviso.link),
          rotuloDoLink: aviso.link ? 'Abrir' : 'Abrir o portal',
        })
        const conteudo = cifrar(JSON.stringify({ para: a.email, ...modelo }), chavesDe(config))
        await filas.fila(FILAS.email).add(
          'enviar',
          { p: conteudo },
          {
            jobId: `aviso-email-${idEmail}`,
            attempts: config.EMAIL_TENTATIVAS,
            backoff: { type: 'exponential', delay: config.EMAIL_ESPERA_MS },
          },
        )
        emailEm = agora
      }

      const pushEm =
        pushLigado && a.tem_push
          ? urgente
            ? agora
            : quandoPodeSair(agora, a.silencio_inicio, a.silencio_fim)
          : null
      if (pushEm) comPush += 1
      await tx.execute(sql`
        INSERT INTO aviso_entregas (id, tenant_id, aviso_id, acesso_id, empresa_id, notificacao_id, push_enviar_em,
                                    email_enfileirado_em)
        VALUES (${novoId()}, ${evento.tenantId}, ${avisoId}, ${a.acesso_id}, ${a.empresa_id}, ${notificacaoId},
                ${pushEm?.toISOString() ?? null}::timestamptz, ${emailEm?.toISOString() ?? null}::timestamptz)
        ON CONFLICT (aviso_id, acesso_id) DO NOTHING`)
    }

    await tx.execute(sql`UPDATE avisos SET destinatarios = ${alvos.length} WHERE id = ${avisoId}`)

    return async () => {
      for (const n of novos) {
        await publicar(
          canalDoSino(config, evento.tenantId, n.contatoId),
          JSON.stringify({ id: n.id, tipo: 'aviso', titulo }),
        ).catch(() => undefined)
      }
      // O que pode sair já sai agora; o que espera o fim do silêncio fica para a varredura de cada minuto
      if (comPush > 0) {
        await filas
          .fila(FILAS.manutencao)
          .add('enviar-pushes', {}, { jobId: `enviar-pushes-${avisoId}` })
          .catch(() => undefined)
      }
    }
  }
}
