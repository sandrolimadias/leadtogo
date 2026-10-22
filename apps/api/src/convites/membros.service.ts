import { sql } from '@leadtogo/db'
import type { AlterarMembroEntrada, MembroDaEquipe } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { perfilEfetivo } from '../acesso/permissoes-do-membro.js'
import type { PapelMembro } from '../acesso/requisicao.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { ehDonoDaConta, exigirQuemGerePerfis, travar } from '../perfis/guarda-de-perfis.js'

type LinhaMembro = {
  id: string
  nome: string
  cargo: string | null
  email: string | null
  papel: PapelMembro
  ativo: boolean
  usuario_id: string | null
  cor: string | null
  perfil_id: string | null
  perfil_nome: string | null
}

/**
 * Gestão da equipe da empresa ativa: situação (ativo/inativo, `equipe.gerir`) e, pelo legado, o papel
 * (vira o perfil de sistema dele, `perfis.gerir`; o novo é PUT /v1/membros/:id/perfil).
 */
@Injectable()
export class MembrosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly permissao: PermissaoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async alterar(id: string, dados: AlterarMembroEntrada): Promise<MembroDaEquipe> {
    if (dados.ativo !== undefined) this.permissao.exigir('equipe.gerir')
    if (dados.papel !== undefined) this.permissao.exigir('perfis.gerir')
    const db = this.ctx.db()

    // Serializa com as demais mudanças de perfis e da equipe e confere de novo, já com a trava, que quem
    // age ainda pode (dois administradores tirando o acesso um do outro ao mesmo tempo: o segundo leva 403)
    for (const chave of [
      ...(dados.ativo !== undefined ? ['equipe.gerir'] : []),
      ...(dados.papel !== undefined ? ['perfis.gerir'] : []),
    ]) {
      await travar(this.ctx, chave)
    }

    // RLS: um membro de outra empresa (ou inexistente, ou excluído) é "não encontrado", igual para todos
    const [alvo] = await db.execute<LinhaMembro>(sql`
      SELECT m.id, m.nome, m.cargo, m.email, m.papel, m.ativo, m.usuario_id, m.cor,
        p.id AS perfil_id, p.nome AS perfil_nome
      FROM membros m LEFT JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
      WHERE m.id = ${id} AND m.excluido_em IS NULL FOR UPDATE OF m`)
    if (!alvo) throw new ErroApi('membro_nao_encontrado', 'Membro não encontrado.', 404)

    const novoPapel = dados.papel ?? alvo.papel
    const novoAtivo = dados.ativo ?? alvo.ativo
    const mudouPapel = novoPapel !== alvo.papel
    const mudouAtivo = novoAtivo !== alvo.ativo
    if (!mudouPapel && !mudouAtivo) return this.resumo(alvo)

    if (alvo.id === this.ctx.membro.id) {
      throw new ErroApi(
        'alterar_a_si_mesmo',
        'Você não pode alterar o seu próprio perfil nem a sua situação. Peça a outro administrador.',
        403,
      )
    }
    if (alvo.usuario_id && (await ehDonoDaConta(this.ctx, alvo.usuario_id))) {
      throw new ErroApi(
        'dono_da_conta',
        'O dono da conta não pode ser rebaixado nem desativado por outro administrador.',
        403,
      )
    }

    let perfil = alvo.perfil_id ? { id: alvo.perfil_id, nome: alvo.perfil_nome ?? '' } : null
    if (mudouPapel) {
      const [deSistema] = await db.execute<{ id: string; nome: string }>(sql`
        SELECT id, nome FROM perfis_acesso
        WHERE chave_sistema = ${novoPapel}::chave_perfil_sistema AND excluido_em IS NULL AND ativo`)
      if (!deSistema) throw new ErroApi('perfil_nao_encontrado', 'Perfil não encontrado.', 404)
      perfil = deSistema
    }
    await db.execute(sql`
      UPDATE membros
      SET papel = ${novoPapel}, ativo = ${novoAtivo},
        perfil_id = ${mudouPapel ? (perfil?.id ?? null) : sql`perfil_id`},
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${alvo.id}`)
    await exigirQuemGerePerfis(this.ctx)
    if (mudouPapel) {
      await this.auditoria.registrar({
        entidade: 'membro',
        entidadeId: alvo.id,
        acao: 'mudar_papel',
        alteracoes: {
          de: alvo.papel,
          para: novoPapel,
          perfil: {
            de: alvo.perfil_id ? { id: alvo.perfil_id, nome: alvo.perfil_nome } : null,
            para: perfil,
          },
        },
      })
    }
    if (mudouAtivo) {
      await this.auditoria.registrar({
        entidade: 'membro',
        entidadeId: alvo.id,
        acao: novoAtivo ? 'reativar' : 'desativar',
      })
    }
    return this.resumo({
      ...alvo,
      papel: novoPapel,
      ativo: novoAtivo,
      perfil_id: perfil?.id ?? null,
      perfil_nome: perfil?.nome ?? null,
    })
  }

  private resumo(m: LinhaMembro): MembroDaEquipe {
    return {
      id: m.id,
      nome: m.nome,
      cargo: m.cargo,
      email: m.email,
      papel: m.papel,
      perfil: m.perfil_id ? { id: m.perfil_id, nome: m.perfil_nome ?? '' } : null,
      ativo: m.ativo,
      temLogin: m.usuario_id !== null,
      cor: m.cor,
    }
  }
}
