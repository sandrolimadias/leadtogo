import { novoId, sql } from '@leadtogo/db'
import {
  type PapelDoPortal,
  type SessaoAtiva,
  VALIDADE_DA_SESSAO_DIAS,
  VALIDADE_MAXIMA_DA_SESSAO_DIAS,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { hashDoTokenDoPortal, novoTokenDoPortal } from './portal-token.js'
import type { ContextoDoPortal } from './portal.tipos.js'

/** O uso só é gravado de tempos em tempos (a janela deslizante não precisa de escrita a cada clique). */
const GRAVA_USO_A_CADA_MIN = 5

const naoAutenticado = () => new ErroApi('nao_autenticado', 'Entre para continuar.', 401)

type LinhaDaSessao = {
  sessao_id: string
  segundo_fator_em: string | Date | null
  ultimo_uso_em: string | Date
  acesso_id: string
  contato_id: string
  empresa_id: string
  papel: PapelDoPortal
  email: string
  contato_nome: string
  empresa_nome: string
  portal_ativo: boolean | null
  portal_nome: string | null
  exige_2fa: boolean | null
  tenant_situacao: string
  tem_2fa: boolean
}

@Injectable()
export class PortalSessaoService {
  /**
   * Cria a sessão do portal e devolve o token do cookie. O 2FA começa pendente: só a conferência o marca.
   * Roda na transação do tenant (o link já foi consumido nela).
   */
  async criar(
    tx: Transacao,
    p: { tenantId: string; acessoId: string; ip?: string | undefined; agente?: string | undefined },
  ): Promise<{ token: string; sessaoId: string; expiraEm: Date }> {
    const { token, hash } = novoTokenDoPortal(p.tenantId)
    const id = novoId()
    const [linha] = await tx.execute<{ expira_em: string | Date }>(sql`
      INSERT INTO portal_sessoes (id, tenant_id, acesso_id, token_hash, expira_em, valida_ate_em, ip, agente)
      VALUES (${id}, ${p.tenantId}, ${p.acessoId}, ${hash},
              now() + ${`${VALIDADE_DA_SESSAO_DIAS} days`}::interval,
              now() + ${`${VALIDADE_MAXIMA_DA_SESSAO_DIAS} days`}::interval,
              ${p.ip ?? null}, ${p.agente?.slice(0, 300) ?? null})
      RETURNING expira_em`)
    return { token, sessaoId: id, expiraEm: new Date(linha?.expira_em ?? Date.now()) }
  }

  /**
   * Acha a sessão pelo cookie, valida o acesso inteiro e devolve quem é o cliente. Roda na transação do
   * tenant e ANTES das variáveis `app.portal_*` (a busca é pelo hash do token, que só o dono do cookie
   * conhece); quem chama preenche as variáveis em seguida. Qualquer falha é o mesmo 401.
   */
  async resolver(tx: Transacao, tenantId: string, token: string): Promise<ContextoDoPortal> {
    const [s] = await tx.execute<LinhaDaSessao>(sql`
      SELECT ps.id AS sessao_id, ps.segundo_fator_em, ps.ultimo_uso_em,
             a.id AS acesso_id, a.contato_id, a.empresa_id, a.papel::text AS papel, a.email::text AS email,
             c.nome AS contato_nome, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome,
             tc.portal_ativo, tc.portal_nome, tc.portal_exige_dois_fatores_responsavel AS exige_2fa,
             t.situacao::text AS tenant_situacao,
             EXISTS (SELECT 1 FROM portal_segundo_fator sf
                     WHERE sf.acesso_id = a.id AND sf.confirmado_em IS NOT NULL) AS tem_2fa
      FROM portal_sessoes ps
      JOIN portal_acessos a ON a.id = ps.acesso_id
      JOIN contatos c ON c.id = a.contato_id
      JOIN empresas e ON e.id = a.empresa_id
      JOIN tenants t ON t.id = ps.tenant_id
      LEFT JOIN tenant_configuracoes tc ON tc.tenant_id = ps.tenant_id
      WHERE ps.token_hash = ${hashDoTokenDoPortal(token)}
        AND ps.tenant_id = ${tenantId}
        AND ps.revogada_em IS NULL AND ps.expira_em > now() AND ps.valida_ate_em > now()
        AND a.situacao = 'ativo' AND a.excluido_em IS NULL
        AND c.excluido_em IS NULL AND e.excluido_em IS NULL`)
    if (!s || !['teste', 'ativo'].includes(s.tenant_situacao) || s.portal_ativo !== true) {
      throw naoAutenticado()
    }

    const exigido = s.tem_2fa || (s.papel === 'responsavel' && s.exige_2fa === true)
    const passouMin = (Date.now() - new Date(s.ultimo_uso_em).getTime()) / 60_000
    if (passouMin >= GRAVA_USO_A_CADA_MIN) {
      await tx.execute(sql`
        UPDATE portal_sessoes
        SET ultimo_uso_em = now(), atualizado_em = now(),
            expira_em = least(now() + ${`${VALIDADE_DA_SESSAO_DIAS} days`}::interval, valida_ate_em)
        WHERE id = ${s.sessao_id}`)
      await tx.execute(sql`
        UPDATE portal_acessos SET ultimo_acesso_em = now() WHERE id = ${s.acesso_id}`)
    }
    return {
      tenantId,
      acessoId: s.acesso_id,
      contatoId: s.contato_id,
      empresaId: s.empresa_id,
      empresaNome: s.empresa_nome,
      papel: s.papel,
      sessaoId: s.sessao_id,
      nome: s.contato_nome,
      email: s.email,
      nomeDoPortal: s.portal_nome ?? s.empresa_nome,
      segundoFatorAtivo: s.tem_2fa,
      segundoFatorExigido: exigido,
      segundoFatorPendente: exigido && s.segundo_fator_em === null,
    }
  }

  async listar(tx: Transacao, acessoId: string, atualId: string): Promise<SessaoAtiva[]> {
    const linhas = await tx.execute<{
      id: string
      agente: string | null
      ip: string | null
      criado_em: string | Date
      ultimo_uso_em: string | Date
    }>(sql`
      SELECT id, agente, ip, criado_em, ultimo_uso_em FROM portal_sessoes
      WHERE acesso_id = ${acessoId} AND revogada_em IS NULL AND expira_em > now() AND valida_ate_em > now()
      ORDER BY ultimo_uso_em DESC`)
    return linhas.map((l) => ({
      id: l.id,
      agente: l.agente,
      ip: l.ip,
      criadaEm: new Date(l.criado_em).toISOString(),
      ultimoUsoEm: new Date(l.ultimo_uso_em).toISOString(),
      atual: l.id === atualId,
    }))
  }

  /** Revoga uma sessão do próprio acesso. Devolve se achou (outra pessoa ou inexistente: 404 na rota). */
  async revogar(tx: Transacao, acessoId: string, sessaoId: string): Promise<boolean> {
    const r = await tx.execute(sql`
      UPDATE portal_sessoes SET revogada_em = now(), atualizado_em = now()
      WHERE id = ${sessaoId} AND acesso_id = ${acessoId} AND revogada_em IS NULL RETURNING id`)
    return r.length > 0
  }

  /** Revoga todas as sessões do acesso (`exceto`: a atual, quando a pessoa pede "sair das outras"). */
  async revogarTodas(tx: Transacao, acessoId: string, exceto?: string): Promise<number> {
    const r = await tx.execute(sql`
      UPDATE portal_sessoes SET revogada_em = now(), atualizado_em = now()
      WHERE acesso_id = ${acessoId} AND revogada_em IS NULL
        ${exceto ? sql`AND id <> ${exceto}` : sql``} RETURNING id`)
    return r.length
  }
}
