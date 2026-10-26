import { type Conexao, sql } from '@leadtogo/db'
import type { Logger } from 'pino'
import webpush from 'web-push'

import type { Configuracao } from '../configuracao/configuracao.js'

export interface InscricaoParaPush {
  endpoint: string
  p256dh: string
  auth: string
}

/** `expirada`: o serviço de push não conhece mais o aparelho (404/410): a inscrição é revogada. */
export type ResultadoDoPush = 'ok' | 'expirada' | 'falhou'

/** Quem de fato envia o push; nos testes entra um falso (nunca se fala com o serviço de push de verdade). */
export interface EnviadorDePush {
  enviar(inscricao: InscricaoParaPush, payload: string): Promise<ResultadoDoPush>
}

/** O enviador real (Web Push com VAPID), ou nulo quando o servidor não tem as chaves (push desligado). */
export function criarEnviadorDePush(config: Configuracao): EnviadorDePush | null {
  const { VAPID_PUBLIC_KEY: publica, VAPID_PRIVATE_KEY: privada, VAPID_SUBJECT: contato } = config
  if (!publica || !privada || !contato) return null
  return {
    async enviar(i, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          payload,
          {
            vapidDetails: { subject: contato, publicKey: publica, privateKey: privada },
            TTL: 24 * 3600,
            timeout: 10_000,
          },
        )
        return 'ok'
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode
        return status === 404 || status === 410 ? 'expirada' : 'falhou'
      }
    },
  }
}

/** Falhas seguidas (que não são "expirada") até a inscrição ser revogada */
const FALHAS_PARA_REVOGAR = 5

type Reivindicada = {
  mensagem: string
  link: string | null
  urgente: boolean
  portal: string
  inscricoes: { id: string; endpoint: string; p256dh: string; auth: string }[]
}

/**
 * Envia os pushes que já venceram (avisos urgentes, normais fora do silêncio e os que esperaram o fim dele).
 * No máximo uma vez por entrega: o `push_enviado_em` é gravado ANTES de enviar (se o processo cair no meio, o
 * aviso continua no sino e no e-mail; ninguém recebe o mesmo push duas vezes). Devolve quantos aparelhos aceitaram.
 */
export async function enviarPushesPendentes(
  banco: Conexao,
  enviador: EnviadorDePush | null,
  log?: Logger,
): Promise<number> {
  if (!enviador) return 0
  const achadas = await banco.cliente<{ id: string; tenant_id: string }[]>`
    SELECT id, tenant_id FROM app_pushes_pendentes()`
  let aceitos = 0
  for (const { id, tenant_id: tenantId } of achadas) {
    const r = await banco.db.transaction(async (tx): Promise<Reivindicada | null> => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      const [e] = await tx.execute<{ acesso_id: string; aviso_id: string }>(sql`
        UPDATE aviso_entregas SET push_enviado_em = now(), atualizado_em = now()
        WHERE id = ${id} AND push_enviado_em IS NULL AND push_enviar_em <= now()
        RETURNING acesso_id, aviso_id`)
      if (!e) return null
      const [a] = await tx.execute<{
        mensagem: string
        link: string | null
        urgencia: string
        portal: string | null
      }>(sql`
        SELECT a.mensagem, a.link, a.urgencia::text AS urgencia, tc.portal_nome AS portal
        FROM avisos a LEFT JOIN tenant_configuracoes tc ON tc.tenant_id = a.tenant_id
        WHERE a.id = ${e.aviso_id}`)
      if (!a) return null
      const inscricoes = await tx.execute<{
        id: string
        endpoint: string
        p256dh: string
        auth: string
      }>(sql`
        SELECT id, endpoint, chave_p256dh AS p256dh, chave_auth AS auth
        FROM portal_push_inscricoes WHERE acesso_id = ${e.acesso_id} AND revogada_em IS NULL`)
      return {
        mensagem: a.mensagem,
        link: a.link,
        urgente: a.urgencia === 'urgente',
        portal: a.portal ?? 'Portal do cliente',
        inscricoes: [...inscricoes],
      }
    })
    if (!r || r.inscricoes.length === 0) continue

    const payload = JSON.stringify({
      titulo: r.urgente ? `${r.portal}: aviso urgente` : r.portal,
      corpo: r.mensagem,
      destino: r.link,
      urgente: r.urgente,
      tag: id,
    })
    const resultados = await Promise.all(
      r.inscricoes.map(async (i) => ({ i, res: await enviador.enviar(i, payload) })),
    )
    const ok = resultados.filter((x) => x.res === 'ok').length
    aceitos += ok
    await banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      await tx.execute(sql`UPDATE aviso_entregas SET push_aceitos = ${ok} WHERE id = ${id}`)
      for (const { i, res } of resultados) {
        if (res === 'ok') {
          await tx.execute(sql`
            UPDATE portal_push_inscricoes SET ultimo_envio_em = now(), falhas = 0 WHERE id = ${i.id}`)
        } else if (res === 'expirada') {
          await tx.execute(sql`
            UPDATE portal_push_inscricoes SET revogada_em = now(), atualizado_em = now() WHERE id = ${i.id}`)
        } else {
          await tx.execute(sql`
            UPDATE portal_push_inscricoes
            SET falhas = falhas + 1,
                revogada_em = CASE WHEN falhas + 1 >= ${FALHAS_PARA_REVOGAR} THEN now() END,
                atualizado_em = now()
            WHERE id = ${i.id}`)
        }
      }
    })
    log?.info({ entrega: id, aceitos: ok, aparelhos: r.inscricoes.length }, 'push de aviso enviado')
  }
  return aceitos
}
