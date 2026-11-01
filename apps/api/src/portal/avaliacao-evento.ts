import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { canalDoSino, idDeterministico, type Publicador } from '../chamados/notificar-chamado.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { emailPortalAvaliacaoDeEvento } from '../email/modelos.js'
import { chavesDe, cifrar } from '../seguranca/cifra.js'
import { FILAS } from '../worker/filas.js'
import type { ManipuladorDeEvento } from '../worker/outbox/relay.js'
import { novoTokenDoPortal } from './portal-token.js'

/** Evento do outbox: pedir a avaliação do evento aos presentes (Fase 4G, B-15 e B-16). */
export const EVENTO_PEDIR_AVALIACAO = 'portal.evento_pedir_avaliacao'

export async function agendarPedidoDeAvaliacao(
  tx: Transacao,
  tenantId: string,
  eventoId: string,
  participacaoIds: string[],
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_PEDIR_AVALIACAO}, ${eventoId},
            ${JSON.stringify({ eventoId, participacaoIds })}::jsonb)`)
}

type Participante = {
  id: string
  acesso_id: string | null
  empresa_id: string | null
  contato_id: string | null
  nome: string | null
  email: string | null
  tem_push: boolean
  ativo: boolean
}

/**
 * Pede a avaliação (no worker). Quem tem acesso ao portal recebe pelo caminho dos Avisos: um aviso URGENTE só para
 * essas pessoas (sino, push no celular na hora e o aviso na lista do hub). Quem não tem acesso recebe um e-mail com
 * um link pessoal de uso para responder, se a empresa ligou "avaliação por e-mail" (R-13). Cada pedido soma um
 * lembrete na participação.
 */
export function manipuladorDoPedidoDeAvaliacao(
  config: Configuracao,
  publicar: Publicador,
): ManipuladorDeEvento {
  return async (evento, { tx, filas }) => {
    const { eventoId, participacaoIds } = evento.payload as {
      eventoId: string
      participacaoIds: string[]
    }
    const [ev] = await tx.execute<{
      titulo: string
      inicio_em: string | Date
      portal_ativo: boolean
      portal_nome: string | null
      por_email: boolean
    }>(sql`
      SELECT e.titulo, e.inicio_em, tc.portal_ativo, tc.portal_nome, tc.portal_avaliacao_por_email AS por_email
      FROM eventos e JOIN tenant_configuracoes tc ON tc.tenant_id = e.tenant_id
      WHERE e.id = ${eventoId} AND e.formulario_avaliacao_id IS NOT NULL`)
    if (!ev || participacaoIds.length === 0) return
    const pessoas = await tx.execute<Participante>(sql`
      SELECT c.id, c.acesso_id, coalesce(c.empresa_id, pa.empresa_id) AS empresa_id,
             coalesce(c.contato_id, pa.contato_id) AS contato_id, coalesce(c.nome, ct.nome) AS nome,
             coalesce(c.email::text, pa.email::text) AS email,
             (pa.situacao = 'ativo' AND pa.excluido_em IS NULL) AS ativo,
             EXISTS (SELECT 1 FROM portal_push_inscricoes i WHERE i.acesso_id = c.acesso_id AND i.revogada_em IS NULL)
               AS tem_push
      FROM evento_confirmacoes c
      LEFT JOIN portal_acessos pa ON pa.id = c.acesso_id
      LEFT JOIN contatos ct ON ct.id = coalesce(c.contato_id, pa.contato_id)
      WHERE c.id = ANY (${`{${participacaoIds.join(',')}}`}::uuid[]) AND c.evento_id = ${eventoId}
        AND c.situacao <> 'cancelado' AND c.presenca <> 'nao_registrada' AND c.avaliacao_resposta_id IS NULL`)
    if (pessoas.length === 0) return

    const titulo = 'Avalie o evento'
    const mensagem = `Como foi “${ev.titulo}”? Sua avaliação leva um minuto.`.slice(0, 140)
    const doPortal = pessoas.filter(
      (p) => p.acesso_id && p.ativo && p.contato_id && ev.portal_ativo,
    )
    const novos: { contatoId: string; id: string }[] = []
    let comPush = 0
    if (doPortal.length > 0) {
      const avisoId = idDeterministico(evento.id, eventoId, 'aviso-avaliacao')
      const [aviso] = await tx.execute<{ id: string }>(sql`
        INSERT INTO avisos (id, tenant_id, mensagem, link, urgencia, alcance, situacao, enviar_em, enviado_em)
        VALUES (${avisoId}, ${evento.tenantId}, ${mensagem}, '/agenda', 'urgente', 'empresas', 'enviado', now(), now())
        ON CONFLICT (id) DO NOTHING RETURNING id`)
      if (aviso) {
        for (const p of doPortal) {
          const notificacaoId = idDeterministico(
            evento.id,
            p.contato_id as string,
            'sino-avaliacao',
          )
          const [sino] = await tx.execute<{ id: string }>(sql`
            INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, canal, tipo, titulo, mensagem, link)
            VALUES (${notificacaoId}, ${evento.tenantId}, 'contato', ${p.contato_id}, 'sino', 'evento.avaliacao',
                    ${titulo}, ${mensagem}, '/agenda')
            ON CONFLICT (id) DO NOTHING RETURNING id`)
          if (sino) novos.push({ contatoId: p.contato_id as string, id: notificacaoId })
          if (p.tem_push) comPush += 1
          await tx.execute(sql`
            INSERT INTO aviso_entregas (id, tenant_id, aviso_id, acesso_id, empresa_id, notificacao_id, push_enviar_em)
            VALUES (${novoId()}, ${evento.tenantId}, ${avisoId}, ${p.acesso_id}, ${p.empresa_id}, ${notificacaoId},
                    ${p.tem_push ? sql`now()` : null})
            ON CONFLICT (aviso_id, acesso_id) DO NOTHING`)
        }
        await tx.execute(
          sql`UPDATE avisos SET destinatarios = ${doPortal.length} WHERE id = ${avisoId}`,
        )
      }
    }

    // Sem acesso ao portal: e-mail com o link pessoal (só com a configuração ligada)
    const porEmail = pessoas.filter((p) => !(p.acesso_id && p.ativo) && p.email)
    const emailPossivel = Boolean(
      ev.por_email && config.PORTAL_URL && config.TOKEN_ENCRYPTION_KEY && config.SMTP_HOST,
    )
    const enviadosPorEmail: string[] = []
    if (emailPossivel) {
      for (const p of porEmail) {
        const { token, hash } = novoTokenDoPortal(evento.tenantId)
        await tx.execute(sql`
          UPDATE evento_confirmacoes SET avaliacao_token_hash = ${hash}, atualizado_em = now() WHERE id = ${p.id}`)
        const modelo = emailPortalAvaliacaoDeEvento({
          nome: p.nome ?? 'participante',
          portal: ev.portal_nome ?? 'Portal do Cliente',
          titulo: ev.titulo,
          link: `${new URL(config.PORTAL_URL as string).origin}/avaliacao/${token}`,
        })
        const conteudo = cifrar(JSON.stringify({ para: p.email, ...modelo }), chavesDe(config))
        await filas.fila(FILAS.email).add(
          'enviar',
          { p: conteudo },
          {
            jobId: `avaliacao-email-${evento.id}-${p.id}`,
            attempts: config.EMAIL_TENTATIVAS,
            backoff: { type: 'exponential', delay: config.EMAIL_ESPERA_MS },
          },
        )
        enviadosPorEmail.push(p.id)
      }
    }

    const tocados = [...doPortal.map((p) => p.id), ...enviadosPorEmail]
    if (tocados.length > 0) {
      await tx.execute(sql`
        UPDATE evento_confirmacoes SET avaliacao_pedida_em = coalesce(avaliacao_pedida_em, now()),
          avaliacao_lembretes = avaliacao_lembretes + 1, atualizado_em = now()
        WHERE id = ANY (${`{${tocados.join(',')}}`}::uuid[])`)
    }
    if (novos.length === 0 && comPush === 0) return
    return async () => {
      for (const n of novos) {
        await publicar(
          canalDoSino(config, evento.tenantId, n.contatoId),
          JSON.stringify({ id: n.id, tipo: 'evento.avaliacao', titulo }),
        ).catch(() => undefined)
      }
      if (comPush > 0) {
        await filas
          .fila(FILAS.manutencao)
          .add('enviar-pushes', {}, { jobId: `enviar-pushes-avaliacao-${evento.id}` })
          .catch(() => undefined)
      }
    }
  }
}
