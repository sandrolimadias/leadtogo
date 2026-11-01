import { novoId, sql } from '@leadtogo/db'
import { type DefinicaoDeFormulario, normalizarCnpj, type Respostas } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { ManipuladorDeEvento } from '../worker/outbox/relay.js'
import { diaUtilSeguinte, feriadosDe, levarAoCrm, type PessoaParaOCrm } from './evento-crm.js'
import { dadosDaPessoa } from './pessoa-do-formulario.js'

/** Evento do outbox: levar ao CRM o pedido de associação com CNPJ (Fase 4H, F-4). */
export const EVENTO_ASSOCIACAO_CRM = 'portal.associacao_vincular_crm'

/** Só com o vínculo ao CRM ligado na hora do pedido (o manipulador confere de novo). */
export async function agendarAssociacaoNoCrm(
  tx: Transacao,
  tenantId: string,
  respostaId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    SELECT ${novoId()}, ${tenantId}, ${EVENTO_ASSOCIACAO_CRM}, ${respostaId},
           ${JSON.stringify({ respostaId })}::jsonb
    WHERE EXISTS (SELECT 1 FROM tenant_configuracoes
                  WHERE tenant_id = ${tenantId} AND portal_eventos_crm_ativo
                    AND portal_eventos_crm_responsavel_id IS NOT NULL)`)
}

/**
 * Pedido de associação com CNPJ: a empresa entra como Lead (ou é achada pelo CNPJ), o contato é ligado e o
 * responsável recebe SEMPRE a tarefa "Pedido de associação" no dia útil seguinte (o pedido pede resposta, mesmo
 * de quem já está no CRM). A resposta completa fica em Formulários → Respostas.
 */
export function manipuladorDaAssociacaoNoCrm(
  receita?: Parameters<typeof levarAoCrm>[4],
): ManipuladorDeEvento {
  return async (evento, { tx }) => {
    const { respostaId } = evento.payload as { respostaId: string }
    const [r] = await tx.execute<{ respostas: Respostas; definicao: DefinicaoDeFormulario }>(sql`
      SELECT fr.respostas, v.definicao FROM formulario_respostas fr
      JOIN formulario_versoes v ON v.formulario_id = fr.formulario_id AND v.versao = fr.versao
      WHERE fr.id = ${respostaId}`)
    if (!r) return
    const d = dadosDaPessoa(r.definicao, r.respostas)
    const cnpj = d.cnpj ? normalizarCnpj(d.cnpj) : null
    if (!cnpj) return
    const pessoa: PessoaParaOCrm = { cnpj, nome: d.nome, email: d.email, telefone: d.telefone }
    const quem = d.nome ?? d.email ?? 'interessado'
    await levarAoCrm(
      tx,
      evento.tenantId,
      pessoa,
      {
        titulo: `Pedido de associação: ${quem}`,
        observacoes: `${quem} pediu para ser associado pela página pública do portal. A resposta completa está em Portal do Cliente → Formulários.`,
        dia: diaUtilSeguinte(new Date(), await feriadosDe(tx)),
        apenasEmpresaNova: false,
      },
      receita,
    )
  }
}
