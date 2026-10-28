import { type Conexao, novoId, sql } from '@leadtogo/db'

import { perfilEfetivo } from '../acesso/permissoes-do-membro.js'

/** Para onde o aviso leva: a tela das chaves de API. */
export const LINK_DAS_CHAVES = '/configuracoes/integracoes'

/**
 * Aviso de vencimento das chaves de API (docs/plano_api_aberta.md, seção 4.2): 15 dias antes e de novo no último
 * dia, no sino de quem tem `integracoes.gerir`. Acha as chaves em todas as empresas (`app_chaves_a_vencer`) e, para
 * cada uma, dentro da empresa dela, marca o aviso e grava as notificações na mesma transação.
 */
export async function avisarChavesAVencer(banco: Conexao): Promise<number> {
  const achadas = await banco.cliente<{ chave_id: string; tenant_id: string }[]>`
    SELECT chave_id, tenant_id FROM app_chaves_a_vencer()`
  let avisadas = 0
  for (const { chave_id: chaveId, tenant_id: tenantId } of achadas) {
    const feito = await banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      const [chave] = await tx.execute<{ nome: string; dias: number }>(sql`
        UPDATE api_chaves SET aviso_vencimento_em = now()
        WHERE id = ${chaveId} AND revogada_em IS NULL AND expira_em > now()
        RETURNING nome, greatest(1, ceil(extract(epoch FROM expira_em - now()) / 86400))::int AS dias`)
      if (!chave) return false
      const quem = await tx.execute<{ id: string }>(sql`
        SELECT DISTINCT m.id FROM membros m
        JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
        JOIN perfil_permissoes pp ON pp.perfil_id = p.id AND pp.permissao = 'integracoes.gerir'
        WHERE m.ativo AND m.excluido_em IS NULL AND m.usuario_id IS NOT NULL`)
      const quando = chave.dias === 1 ? 'em até 1 dia' : `em ${chave.dias} dias`
      for (const { id } of quem) {
        await tx.execute(sql`
          INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo, mensagem, link)
          VALUES (${novoId()}, ${tenantId}, ${id}, 'integracao.chave_vencendo',
                  ${`A chave de API "${chave.nome}" vence ${quando}`},
                  'Rotacione a chave e troque o valor na integração (n8n) antes do vencimento.',
                  ${LINK_DAS_CHAVES})`)
      }
      return true
    })
    if (feito) avisadas += 1
  }
  return avisadas
}
