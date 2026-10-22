import { novoId, sql } from '@leadtogo/db'
import {
  type Alcance,
  type AtribuirPerfilEntrada,
  type ChaveDeSistema,
  type CriarPerfilEntrada,
  type DuplicarPerfilEntrada,
  type EditarPerfilEntrada,
  type MembroDoPerfil,
  PERMISSOES_PROTEGIDAS_DO_ADMIN,
  type PerfilDeAcesso,
  type PerfilDoMembro,
  type PermissoesDoPerfil,
  linhasDasPermissoes,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { perfilEfetivo, permissoesDoCatalogo } from '../acesso/permissoes-do-membro.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

type LinhaPerfil = {
  id: string
  nome: string
  descricao: string | null
  sistema: boolean
  chave_sistema: ChaveDeSistema | null
  exige_2fa: boolean
  ativo: boolean
  membros: number
}

const naoEncontrado = () => new ErroApi('perfil_nao_encontrado', 'Perfil não encontrado.', 404)

/**
 * Perfis de acesso da empresa ativa (docs/funcionalidades.md, "Perfis de acesso"). As rotas exigem
 * `perfis.gerir`. Proteções:
 *  - Administrador, Gestor e Vendedor (de sistema) nunca se excluem nem se inativam; o Administrador
 *    não perde `perfis.gerir` nem `equipe.gerir`;
 *  - perfil com membros (ou convite pendente) não se exclui nem se inativa;
 *  - ninguém troca o próprio perfil nem tira `perfis.gerir` do perfil que usa;
 *  - a empresa nunca fica sem um membro ativo, com login, que tenha `perfis.gerir` (409).
 * Toda mudança é serializada por empresa (trava transacional) e registrada na auditoria.
 */
@Injectable()
export class PerfisService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(): Promise<PerfilDeAcesso[]> {
    const perfis = await this.linhas()
    const permissoes = await this.permissoesDe(perfis.map((p) => p.id))
    return perfis.map((p) => this.paraResposta(p, permissoes.get(p.id) ?? {}))
  }

  async obter(id: string): Promise<PerfilDeAcesso> {
    const [perfil] = await this.linhas(id)
    if (!perfil) throw naoEncontrado()
    const permissoes = await this.permissoesDe([id])
    return this.paraResposta(perfil, permissoes.get(id) ?? {})
  }

  async membros(id: string): Promise<MembroDoPerfil[]> {
    await this.obter(id)
    const linhas = await this.ctx.db().execute<{
      id: string
      nome: string
      ativo: boolean
      tem_login: boolean
    }>(sql`
      SELECT m.id, m.nome, m.ativo, (m.usuario_id IS NOT NULL) AS tem_login
      FROM membros m JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
      WHERE p.id = ${id} AND m.excluido_em IS NULL
      ORDER BY m.nome`)
    return linhas.map((l) => ({ id: l.id, nome: l.nome, ativo: l.ativo, temLogin: l.tem_login }))
  }

  async criar(dados: CriarPerfilEntrada): Promise<PerfilDeAcesso> {
    await this.travar()
    await this.exigirNomeLivre(dados.nome)
    const id = novoId()
    await this.ctx.db().execute(sql`
      INSERT INTO perfis_acesso (id, tenant_id, nome, descricao, exige_2fa, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${dados.nome}, ${dados.descricao ?? null}, ${dados.exige2fa},
        ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    await this.gravarPermissoes(id, dados.permissoes)
    await this.auditoria.registrar({
      entidade: 'perfil_acesso',
      entidadeId: id,
      acao: 'criar_perfil',
      alteracoes: {
        nome: dados.nome,
        exige2fa: dados.exige2fa,
        permissoes: dados.permissoes,
      },
    })
    return this.obter(id)
  }

  async duplicar(id: string, dados: DuplicarPerfilEntrada): Promise<PerfilDeAcesso> {
    const origem = await this.obter(id)
    const copia = await this.criar({
      nome: dados.nome,
      descricao: origem.descricao,
      exige2fa: origem.exige2fa,
      permissoes: origem.permissoes,
    })
    await this.auditoria.registrar({
      entidade: 'perfil_acesso',
      entidadeId: copia.id,
      acao: 'duplicar_perfil',
      alteracoes: { origem: { id: origem.id, nome: origem.nome } },
    })
    return copia
  }

  async editar(id: string, dados: EditarPerfilEntrada): Promise<PerfilDeAcesso> {
    await this.travar()
    const antes = await this.obter(id)
    const depois = {
      nome: dados.nome ?? antes.nome,
      descricao: dados.descricao !== undefined ? dados.descricao : antes.descricao,
      exige2fa: dados.exige2fa ?? antes.exige2fa,
      ativo: dados.ativo ?? antes.ativo,
      permissoes: dados.permissoes ?? antes.permissoes,
    }

    if (depois.nome.toLowerCase() !== antes.nome.toLowerCase())
      await this.exigirNomeLivre(depois.nome, id)
    if (!depois.ativo && antes.ativo) {
      if (antes.sistema) {
        throw new ErroApi(
          'perfil_de_sistema',
          'Os perfis Administrador, Gestor e Vendedor não podem ser inativados.',
          409,
        )
      }
      await this.exigirSemUso(id, 'inativar')
    }
    if (antes.chaveSistema === 'admin') {
      const faltando = PERMISSOES_PROTEGIDAS_DO_ADMIN.filter(
        (c) => depois.permissoes[c] === undefined,
      )
      if (faltando.length > 0) {
        throw new ErroApi(
          'permissao_protegida',
          'O perfil Administrador não pode perder a gestão da equipe nem a dos perfis de acesso.',
          409,
        )
      }
    }
    const meuPerfil = this.ctx.membro.perfil?.id
    if (meuPerfil === id && depois.permissoes['perfis.gerir'] === undefined) {
      throw new ErroApi(
        'propria_permissao',
        'Você não pode tirar do seu próprio perfil a gestão dos perfis de acesso. Peça a outro administrador.',
        409,
      )
    }

    await this.ctx.db().execute(sql`
      UPDATE perfis_acesso
      SET nome = ${depois.nome}, descricao = ${depois.descricao}, exige_2fa = ${depois.exige2fa},
        ativo = ${depois.ativo}, atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    const mudouPermissoes =
      dados.permissoes !== undefined && !mesmasPermissoes(antes.permissoes, depois.permissoes)
    if (mudouPermissoes) {
      await this.ctx.db().execute(sql`DELETE FROM perfil_permissoes WHERE perfil_id = ${id}`)
      await this.gravarPermissoes(id, depois.permissoes)
    }
    await this.exigirAdministrador()

    const alteracoes: Record<string, unknown> = {}
    for (const campo of ['nome', 'descricao', 'exige2fa', 'ativo'] as const) {
      if (antes[campo] !== depois[campo])
        alteracoes[campo] = { de: antes[campo], para: depois[campo] }
    }
    if (mudouPermissoes)
      alteracoes['permissoes'] = { de: antes.permissoes, para: depois.permissoes }
    if (Object.keys(alteracoes).length > 0) {
      await this.auditoria.registrar({
        entidade: 'perfil_acesso',
        entidadeId: id,
        acao: 'editar_perfil',
        alteracoes,
      })
    }
    return this.obter(id)
  }

  async excluir(id: string): Promise<void> {
    await this.travar()
    const perfil = await this.obter(id)
    if (perfil.sistema) {
      throw new ErroApi(
        'perfil_de_sistema',
        'Os perfis Administrador, Gestor e Vendedor não podem ser excluídos.',
        409,
      )
    }
    await this.exigirSemUso(id, 'excluir')
    await this.ctx.db().execute(sql`
      UPDATE perfis_acesso SET excluido_em = now(), atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'perfil_acesso',
      entidadeId: id,
      acao: 'excluir_perfil',
      alteracoes: { nome: perfil.nome },
    })
  }

  /** Troca o perfil de um membro (substitui a troca de papel). */
  async atribuir(membroId: string, dados: AtribuirPerfilEntrada): Promise<PerfilDoMembro> {
    await this.travar()
    if (membroId === this.ctx.membro.id) {
      throw new ErroApi(
        'alterar_a_si_mesmo',
        'Você não pode trocar o seu próprio perfil de acesso. Peça a outro administrador.',
        403,
      )
    }
    // RLS: membro de outra empresa (ou inexistente, ou excluído) é "não encontrado", igual para todos
    const [alvo] = await this.ctx.db().execute<{
      id: string
      usuario_id: string | null
      perfil_id: string | null
      perfil_nome: string | null
    }>(sql`
      SELECT m.id, m.usuario_id, p.id AS perfil_id, p.nome AS perfil_nome
      FROM membros m LEFT JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
      WHERE m.id = ${membroId} AND m.excluido_em IS NULL
      FOR UPDATE OF m`)
    if (!alvo) throw new ErroApi('membro_nao_encontrado', 'Membro não encontrado.', 404)
    const [novo] = await this.linhas(dados.perfilId)
    if (!novo) throw naoEncontrado()
    if (!novo.ativo) {
      throw new ErroApi(
        'perfil_inativo',
        'Este perfil está inativo. Ative-o antes de atribuir.',
        409,
      )
    }
    if (alvo.perfil_id === novo.id) {
      return { membroId, perfil: { id: novo.id, nome: novo.nome } }
    }
    if (alvo.usuario_id && (await this.ehDonoDaConta(alvo.usuario_id))) {
      throw new ErroApi(
        'dono_da_conta',
        'O perfil do dono da conta não pode ser trocado por outro administrador.',
        403,
      )
    }
    // O papel antigo fica como legado: o do perfil de sistema, ou `vendedor` nos da empresa
    await this.ctx.db().execute(sql`
      UPDATE membros
      SET perfil_id = ${novo.id}, papel = ${novo.chave_sistema ?? 'vendedor'}::papel_membro,
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${membroId}`)
    await this.exigirAdministrador()
    await this.auditoria.registrar({
      entidade: 'membro',
      entidadeId: membroId,
      acao: 'trocar_perfil',
      alteracoes: {
        de: alvo.perfil_id ? { id: alvo.perfil_id, nome: alvo.perfil_nome } : null,
        para: { id: novo.id, nome: novo.nome },
      },
    })
    return { membroId, perfil: { id: novo.id, nome: novo.nome } }
  }

  /**
   * A empresa nunca fica sem ao menos um membro ativo, com login, cujo perfil efetivo tenha
   * `perfis.gerir`. Roda depois da mudança, na mesma transação: se falhar, tudo é desfeito.
   */
  private async exigirAdministrador(): Promise<void> {
    const [linha] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM membros m
      JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
      JOIN perfil_permissoes pp ON pp.perfil_id = p.id AND pp.permissao = 'perfis.gerir'
      WHERE m.excluido_em IS NULL AND m.ativo AND m.usuario_id IS NOT NULL`)
    if ((linha?.n ?? 0) === 0) {
      throw new ErroApi(
        'sem_administrador',
        'A empresa precisa de ao menos uma pessoa ativa que possa gerir os perfis de acesso.',
        409,
      )
    }
  }

  /** Serializa as mudanças de perfis e de perfil dos membros da empresa (evita corrida no 409 acima). */
  private async travar(): Promise<void> {
    await this.ctx
      .db()
      .execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`perfis:${this.ctx.tenantId}`}))`)
  }

  private async exigirNomeLivre(nome: string, exceto?: string): Promise<void> {
    const repetidos = await this.ctx.db().execute(sql`
      SELECT 1 FROM perfis_acesso
      WHERE excluido_em IS NULL AND lower(nome) = lower(${nome}) ${exceto ? sql`AND id <> ${exceto}` : sql``}
      LIMIT 1`)
    if (repetidos.length > 0) {
      throw new ErroApi('nome_repetido', 'Já existe um perfil com este nome.', 409)
    }
  }

  private async exigirSemUso(id: string, acao: 'excluir' | 'inativar'): Promise<void> {
    const [uso] = await this.ctx.db().execute<{ membros: number; convites: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM membros WHERE perfil_id = ${id} AND excluido_em IS NULL) AS membros,
        (SELECT count(*)::int FROM convites
          WHERE perfil_id = ${id} AND aceito_em IS NULL AND revogado_em IS NULL AND expira_em > now()) AS convites`)
    if ((uso?.membros ?? 0) > 0 || (uso?.convites ?? 0) > 0) {
      throw new ErroApi(
        'perfil_em_uso',
        `Não é possível ${acao} um perfil com membros ou convites pendentes. Troque o perfil deles antes.`,
        409,
      )
    }
  }

  private async gravarPermissoes(id: string, permissoes: PermissoesDoPerfil): Promise<void> {
    const linhas = linhasDasPermissoes(permissoes)
    if (linhas.length === 0) return
    await this.ctx.db().execute(sql`
      INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
      SELECT ${this.ctx.tenantId}::uuid, ${id}::uuid, l.permissao, l.alcance::alcance_permissao
      FROM jsonb_to_recordset(${JSON.stringify(linhas)}::jsonb) AS l(permissao text, alcance text)`)
  }

  private async linhas(id?: string): Promise<LinhaPerfil[]> {
    return [
      ...(await this.ctx.db().execute<LinhaPerfil>(sql`
        SELECT p.id, p.nome, p.descricao, p.sistema, p.chave_sistema, p.exige_2fa, p.ativo,
          (SELECT count(*)::int FROM membros m WHERE m.excluido_em IS NULL AND ${perfilEfetivo(sql`m`, sql`p`)}) AS membros
        FROM perfis_acesso p
        WHERE p.excluido_em IS NULL ${id ? sql`AND p.id = ${id}` : sql``}
        ORDER BY p.sistema DESC, p.chave_sistema, lower(p.nome)`)),
    ]
  }

  private async permissoesDe(ids: string[]): Promise<Map<string, PermissoesDoPerfil>> {
    const saida = new Map<string, PermissoesDoPerfil>()
    if (ids.length === 0) return saida
    const linhas = await this.ctx.db().execute<{
      perfil_id: string
      permissao: string
      alcance: Alcance | null
    }>(sql`
      SELECT perfil_id, permissao, alcance::text AS alcance FROM perfil_permissoes
      WHERE perfil_id = ANY (${`{${ids.join(',')}}`}::uuid[])`)
    const porPerfil = new Map<string, { permissao: string; alcance: Alcance | null }[]>()
    for (const l of linhas) {
      const lista = porPerfil.get(l.perfil_id) ?? []
      lista.push(l)
      porPerfil.set(l.perfil_id, lista)
    }
    for (const id of ids) saida.set(id, permissoesDoCatalogo(porPerfil.get(id) ?? []))
    return saida
  }

  private paraResposta(p: LinhaPerfil, permissoes: PermissoesDoPerfil): PerfilDeAcesso {
    return {
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      sistema: p.sistema,
      chaveSistema: p.chave_sistema,
      exige2fa: p.exige_2fa,
      ativo: p.ativo,
      membros: p.membros,
      permissoes,
    }
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
}

function mesmasPermissoes(a: PermissoesDoPerfil, b: PermissoesDoPerfil): boolean {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}
