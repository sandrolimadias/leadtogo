import { sql } from '@leadtogo/db'
import type { AlterarMembroEntrada, MembroDaEquipe } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { PapelMembro } from '../acesso/requisicao.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

type LinhaMembro = {
  id: string
  nome: string
  cargo: string | null
  email: string | null
  papel: PapelMembro
  ativo: boolean
  usuario_id: string | null
  cor: string | null
}

/** Gestão da equipe da empresa ativa: papel e situação (ativo/inativo) de cada membro. Só administradores. */
@Injectable()
export class MembrosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async alterar(id: string, dados: AlterarMembroEntrada): Promise<MembroDaEquipe> {
    if (this.ctx.membro.papel !== 'admin') {
      throw new ErroApi(
        'acesso_negado',
        'Só administradores da empresa podem alterar a equipe.',
        403,
      )
    }
    const db = this.ctx.db()

    // Serializa quem mexe nos administradores (sempre na mesma ordem: sem impasse) e confere que quem
    // age ainda é administrador ativo. Isso garante que a empresa nunca fica sem administrador: quem
    // altera é sempre um admin ativo, diferente do alvo (ninguém altera a si mesmo), e continua admin
    // depois; dois admins tirando o acesso um do outro ao mesmo tempo: o segundo já não é admin e leva 403.
    await db.execute(sql`
      SELECT id FROM membros WHERE papel = 'admin' AND excluido_em IS NULL ORDER BY id FOR UPDATE`)
    const [autor] = await db.execute<{ papel: PapelMembro; ativo: boolean }>(
      sql`SELECT papel, ativo FROM membros WHERE id = ${this.ctx.membro.id}`,
    )
    if (!autor || autor.papel !== 'admin' || !autor.ativo) {
      throw new ErroApi(
        'acesso_negado',
        'Só administradores da empresa podem alterar a equipe.',
        403,
      )
    }

    // RLS: um membro de outra empresa (ou inexistente, ou excluído) é "não encontrado", igual para todos
    const [alvo] = await db.execute<LinhaMembro>(sql`
      SELECT id, nome, cargo, email, papel, ativo, usuario_id, cor
      FROM membros WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`)
    if (!alvo) throw new ErroApi('membro_nao_encontrado', 'Membro não encontrado.', 404)

    const novoPapel = dados.papel ?? alvo.papel
    const novoAtivo = dados.ativo ?? alvo.ativo
    const mudouPapel = novoPapel !== alvo.papel
    const mudouAtivo = novoAtivo !== alvo.ativo
    if (!mudouPapel && !mudouAtivo) return this.resumo(alvo)

    if (alvo.id === this.ctx.membro.id) {
      throw new ErroApi(
        'alterar_a_si_mesmo',
        'Você não pode alterar o seu próprio papel nem a sua situação. Peça a outro administrador.',
        403,
      )
    }
    if (alvo.usuario_id && (await this.ehDonoDaConta(alvo.usuario_id))) {
      throw new ErroApi(
        'dono_da_conta',
        'O dono da conta não pode ser rebaixado nem desativado por outro administrador.',
        403,
      )
    }
    await db.execute(sql`
      UPDATE membros
      SET papel = ${novoPapel}, ativo = ${novoAtivo}, atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${alvo.id}`)
    if (mudouPapel) {
      await this.auditoria.registrar({
        entidade: 'membro',
        entidadeId: alvo.id,
        acao: 'mudar_papel',
        alteracoes: { de: alvo.papel, para: novoPapel },
      })
    }
    if (mudouAtivo) {
      await this.auditoria.registrar({
        entidade: 'membro',
        entidadeId: alvo.id,
        acao: novoAtivo ? 'reativar' : 'desativar',
      })
    }
    return this.resumo({ ...alvo, papel: novoPapel, ativo: novoAtivo })
  }

  /** O usuário é o dono da conta a que esta empresa pertence. */
  private async ehDonoDaConta(usuarioId: string): Promise<boolean> {
    const linhas = await this.ctx.db().execute(sql`
      SELECT 1 FROM conta_administradores ca
      JOIN tenants t ON t.conta_id = ca.conta_id
      WHERE t.id = ${this.ctx.tenantId} AND ca.usuario_id = ${usuarioId} AND ca.papel = 'dono'
      LIMIT 1`)
    return linhas.length > 0
  }

  private resumo(m: LinhaMembro): MembroDaEquipe {
    return {
      id: m.id,
      nome: m.nome,
      cargo: m.cargo,
      email: m.email,
      papel: m.papel,
      ativo: m.ativo,
      temLogin: m.usuario_id !== null,
      cor: m.cor,
    }
  }
}
