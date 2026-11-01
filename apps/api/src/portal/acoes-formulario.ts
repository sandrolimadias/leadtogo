import { novoId, sql } from '@leadtogo/db'
import {
  type Acao,
  type Botao,
  type DefinicaoDeFormulario,
  interpolar,
  regraVale,
  type Respostas,
} from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { assinar, entregar } from '../integracoes/webhooks/entrega.js'
import { politicaDe } from '../integracoes/webhooks/webhooks.service.js'
import { chavesDe, cifrar, decifrar } from '../seguranca/cifra.js'
import type { ManipuladorDeEvento } from '../worker/outbox/relay.js'
import { FILAS } from '../worker/filas.js'

/** Evento do outbox: rodar as ações do botão usado numa resposta (Fase 4E). */
export const EVENTO_ACOES_DO_FORMULARIO = 'formulario.acoes'

/** Tentativas de um webhook de formulário antes de marcar como falhou (o evento volta com espera progressiva). */
export const TENTATIVAS_DO_WEBHOOK_DO_FORMULARIO = 3

export async function agendarAcoesDoFormulario(
  tx: Transacao,
  tenantId: string,
  respostaId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_ACOES_DO_FORMULARIO}, ${respostaId},
            ${JSON.stringify({ respostaId })}::jsonb)`)
}

/** O texto do e-mail: a mensagem com os valores, sem HTML vindo de fora. */
const escapar = (t: string) =>
  t.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

/**
 * As ações do botão usado (Fase 4E, FB-2), no worker:
 *  - e-mail: vai para a fila de e-mail na mesma transação (id do job fixo: reentrega não duplica);
 *  - webhook: POST assinado (`X-Leadtogo-Assinatura`, com o segredo do formulário), sem seguir redirecionamento e
 *    recusando rede interna. Falhou: o evento volta com espera progressiva (até 3 vezes) e só o que faltou roda de
 *    novo. Cada ação fica registrada em `formulario_acoes_execucoes`.
 * Ação com condição só roda se a condição valer para as respostas.
 */
export function manipuladorDasAcoesDoFormulario(config: Configuracao): ManipuladorDeEvento {
  return async (evento, { tx, filas }) => {
    const { respostaId } = evento.payload as { respostaId: string }
    const [r] = await tx.execute<{
      formulario_id: string
      nome: string
      botao: string
      respostas: Respostas
      definicao: DefinicaoDeFormulario
      segredo: string | null
      criado_em: string | Date
    }>(sql`
      SELECT r.formulario_id, f.nome, r.botao, r.respostas, v.definicao, f.segredo_webhook AS segredo, r.criado_em
      FROM formulario_respostas r
      JOIN formularios f ON f.id = r.formulario_id
      JOIN formulario_versoes v ON v.formulario_id = r.formulario_id AND v.versao = r.versao
      WHERE r.id = ${respostaId}`)
    if (!r) return
    const botao: Botao | undefined = r.definicao.botoes.find((b) => b.id === r.botao)
    if (!botao) return

    const pendentes: { indice: number; acao: Acao }[] = []
    for (const [indice, acao] of botao.acoes.entries()) {
      if (!regraVale(acao.condicao, r.respostas)) continue
      await tx.execute(sql`
        INSERT INTO formulario_acoes_execucoes (id, tenant_id, resposta_id, indice, tipo)
        VALUES (${novoId()}, ${evento.tenantId}, ${respostaId}, ${indice}, ${acao.tipo})
        ON CONFLICT (resposta_id, indice) DO NOTHING`)
      const [e] = await tx.execute<{ situacao: string }>(sql`
        SELECT situacao::text AS situacao FROM formulario_acoes_execucoes
        WHERE resposta_id = ${respostaId} AND indice = ${indice}`)
      if (e?.situacao === 'pendente') pendentes.push({ indice, acao })
    }

    let falhou = false
    for (const { indice, acao } of pendentes) {
      if (acao.tipo === 'email') {
        const para =
          acao.para === 'fixo'
            ? (acao.enderecos ?? [])
            : [r.respostas[acao.campo ?? ''] ?? ''].filter(
                (v): v is string => typeof v === 'string' && v.includes('@'),
              )
        const texto = interpolar(acao.mensagem, r.respostas)
        const assunto = interpolar(acao.assunto, r.respostas).slice(0, 200)
        for (const [n, destino] of para.entries()) {
          const conteudo = cifrar(
            JSON.stringify({
              para: destino,
              assunto,
              texto,
              html: `<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;line-height:1.5;color:#1f2937"><p style="white-space:pre-wrap">${escapar(texto)}</p></body></html>`,
            }),
            chavesDe(config),
          )
          await filas.fila(FILAS.email).add(
            'enviar',
            { p: conteudo },
            {
              jobId: `form-email-${respostaId}-${indice}-${n}`,
              attempts: config.EMAIL_TENTATIVAS,
              backoff: { type: 'exponential', delay: config.EMAIL_ESPERA_MS },
            },
          )
        }
        await tx.execute(sql`
          UPDATE formulario_acoes_execucoes SET situacao = ${para.length > 0 ? 'ok' : 'falhou'}::situacao_acao_formulario,
            tentativas = tentativas + 1, detalhe = ${para.length > 0 ? `${para.length} e-mail(s) na fila` : 'sem destinatário'},
            atualizado_em = now()
          WHERE resposta_id = ${respostaId} AND indice = ${indice}`)
        continue
      }
      // Webhook
      const corpo = JSON.stringify({
        tipo: 'formulario.resposta',
        formulario: { id: r.formulario_id, nome: r.nome },
        resposta: { id: respostaId, botao: r.botao, criadaEm: new Date(r.criado_em).toISOString() },
        valores: r.respostas,
      })
      const segredos = r.segredo ? [decifrar(r.segredo, chavesDe(config))] : []
      const resultado = await entregar(
        acao.url,
        corpo,
        {
          'X-Leadtogo-Evento': 'formulario.resposta',
          'X-Leadtogo-Entrega': `${respostaId}.${indice}`,
          ...(segredos.length > 0 ? { 'X-Leadtogo-Assinatura': assinar(corpo, segredos) } : {}),
        },
        politicaDe(config),
        config.WEBHOOK_TIMEOUT_MS,
      )
      const ultima = evento.tentativas + 1 >= TENTATIVAS_DO_WEBHOOK_DO_FORMULARIO
      const situacao = resultado.ok ? 'ok' : ultima ? 'falhou' : 'pendente'
      await tx.execute(sql`
        UPDATE formulario_acoes_execucoes SET situacao = ${situacao}::situacao_acao_formulario,
          tentativas = tentativas + 1, status_http = ${resultado.statusHttp},
          detalhe = ${resultado.ok ? null : (resultado.erro ?? `HTTP ${resultado.statusHttp ?? '?'}`).slice(0, 300)},
          atualizado_em = now()
        WHERE resposta_id = ${respostaId} AND indice = ${indice}`)
      if (situacao === 'pendente') falhou = true
    }
    if (falhou) {
      // A transação volta e o relay tenta o evento de novo com espera: o e-mail já enfileirado não duplica (jobId)
      throw new Error('webhook do formulário falhou; nova tentativa com espera')
    }
  }
}
