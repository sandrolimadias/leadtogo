import { sql } from '@leadtogo/db'
import type { Seguranca, SegurancaPatch } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { perfilEfetivo } from '../acesso/permissoes-do-membro.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

type LinhaPerfil = Seguranca['perfis'][number]

/** O perfil Administrador sempre exige 2FA (como em toda política antiga). */
export const ADMIN_EXIGE_2FA = () =>
  new ErroApi(
    'admin_exige_2fa',
    'O perfil Administrador sempre exige a verificação em duas etapas.',
    409,
  )

/**
 * Configurações de segurança da empresa ativa: quem precisa de 2FA, perfil por perfil (flag
 * `exige_2fa` do perfil de acesso). Vale na próxima requisição de cada pessoa. A política antiga por
 * papel (`tenant_configuracoes.dois_fatores_exigido`) só decide para quem ainda não tem perfil.
 */
@Injectable()
export class SegurancaService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async obter(): Promise<Seguranca> {
    const linhas = await this.ctx.db().execute<{
      id: string
      nome: string
      sistema: boolean
      chave_sistema: LinhaPerfil['chaveSistema']
      ativo: boolean
      membros: number
      exige_2fa: boolean
    }>(sql`
      SELECT p.id, p.nome, p.sistema, p.chave_sistema, p.ativo, p.exige_2fa,
        (SELECT count(*)::int FROM membros m WHERE m.excluido_em IS NULL AND ${perfilEfetivo(sql`m`, sql`p`)}) AS membros
      FROM perfis_acesso p
      WHERE p.excluido_em IS NULL
      ORDER BY p.sistema DESC, p.chave_sistema, lower(p.nome)`)
    return {
      perfis: [...linhas].map((l) => ({
        id: l.id,
        nome: l.nome,
        sistema: l.sistema,
        chaveSistema: l.chave_sistema,
        ativo: l.ativo,
        membros: l.membros,
        exige2fa: l.exige_2fa,
      })),
    }
  }

  /** `seguranca.gerir` (na rota). Perfil de outra empresa ou excluído: 404. Registra na auditoria. */
  async alterar(patch: SegurancaPatch): Promise<Seguranca> {
    const atuais = new Map((await this.obter()).perfis.map((p) => [p.id, p]))
    const mudancas: Record<string, { perfil: string; de: boolean; para: boolean }> = {}
    for (const [id, exige] of Object.entries(patch.perfis)) {
      const perfil = atuais.get(id)
      if (!perfil) throw new ErroApi('perfil_nao_encontrado', 'Perfil não encontrado.', 404)
      if (perfil.chaveSistema === 'admin' && !exige) throw ADMIN_EXIGE_2FA()
      if (perfil.exige2fa !== exige)
        mudancas[id] = { perfil: perfil.nome, de: perfil.exige2fa, para: exige }
    }
    for (const [id, m] of Object.entries(mudancas)) {
      await this.ctx.db().execute(sql`
        UPDATE perfis_acesso SET exige_2fa = ${m.para}, atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
        WHERE id = ${id}`)
    }
    if (Object.keys(mudancas).length > 0) {
      await this.auditoria.registrar({
        entidade: 'seguranca',
        acao: 'alterar_2fa_dos_perfis',
        alteracoes: mudancas,
      })
    }
    return this.obter()
  }
}
