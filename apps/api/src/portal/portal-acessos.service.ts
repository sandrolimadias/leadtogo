import { novoId, sql } from '@leadtogo/db'
import {
  type AcessoDoPortal,
  type AlterarAcessoDoPortalEntrada,
  type AtualizarConfiguracaoDoPortalEntrada,
  type ConfiguracaoDoPortal,
  type ConsultaDeAcessosDoPortal,
  type DarAcessoAoPortalEntrada,
  LIMITE_SEMANAL_PADRAO_DE_AVISOS,
  type ListaDeAcessosDoPortal,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { EmailService } from '../email/email.service.js'
import { emailPortalConvite } from '../email/modelos.js'
import { ErroApi } from '../http/erro-api.js'
import { PortalLinksService } from './portal-links.service.js'

type LinhaDoAcesso = {
  id: string
  contato_id: string
  contato_nome: string
  empresa_id: string
  empresa_nome: string
  email: string
  papel: AcessoDoPortal['papel']
  situacao: AcessoDoPortal['situacao']
  criado_em: string | Date
  aceito_em: string | Date | null
  ultimo_acesso_em: string | Date | null
  convite_valido: boolean
}

const iso = (v: string | Date | null): string | null =>
  v === null ? null : new Date(v).toISOString()

const acessoDe = (l: LinhaDoAcesso): AcessoDoPortal => ({
  id: l.id,
  contato: { id: l.contato_id, nome: l.contato_nome },
  empresaCliente: { id: l.empresa_id, nome: l.empresa_nome },
  email: l.email,
  papel: l.papel,
  situacao: l.situacao,
  convidadoEm: new Date(l.criado_em).toISOString(),
  aceitoEm: iso(l.aceito_em),
  ultimoAcessoEm: iso(l.ultimo_acesso_em),
  conviteVencido: l.situacao === 'convidado' && !l.convite_valido,
})

const naoEncontrado = () => new ErroApi('acesso_nao_encontrado', 'Acesso não encontrado.', 404)

/** Gestão, pela equipe, do acesso dos contatos ao portal (permissão `portal.acessos`). */
const slugEmUso = () =>
  new ErroApi('slug_em_uso', 'Este endereço já é usado por outro portal. Escolha outro.', 409)

@Injectable()
export class PortalAcessosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly links: PortalLinksService,
    private readonly email: EmailService,
  ) {}

  private selecionar(onde: ReturnType<typeof sql>) {
    return this.ctx.db().execute<LinhaDoAcesso>(sql`
      SELECT a.id, a.contato_id, c.nome AS contato_nome, a.empresa_id,
             coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome, a.email::text AS email,
             a.papel::text AS papel, a.situacao::text AS situacao, a.criado_em, a.aceito_em, a.ultimo_acesso_em,
             EXISTS (SELECT 1 FROM portal_links l WHERE l.acesso_id = a.id AND l.finalidade = 'convite'
                     AND l.usado_em IS NULL AND l.expira_em > now()) AS convite_valido
      FROM portal_acessos a
      JOIN contatos c ON c.id = a.contato_id
      JOIN empresas e ON e.id = a.empresa_id
      WHERE a.excluido_em IS NULL AND ${onde}
      ORDER BY lower(c.nome), a.criado_em`)
  }

  async listar(consulta: ConsultaDeAcessosDoPortal): Promise<ListaDeAcessosDoPortal> {
    const filtros = [sql`true`]
    if (consulta.empresaClienteId) filtros.push(sql`a.empresa_id = ${consulta.empresaClienteId}`)
    if (consulta.contatoId) filtros.push(sql`a.contato_id = ${consulta.contatoId}`)
    if (consulta.situacao)
      filtros.push(sql`a.situacao = ${consulta.situacao}::situacao_acesso_portal`)
    else filtros.push(sql`a.situacao <> 'revogado'`)
    if (consulta.busca) {
      const termo = `%${consulta.busca.replace(/[\\%_]/g, '\\$&')}%`
      filtros.push(sql`(c.nome ILIKE ${termo} OR a.email::text ILIKE ${termo})`)
    }
    const linhas = [...(await this.selecionar(sql.join(filtros, sql` AND `)))]
    const inicio = (consulta.pagina - 1) * consulta.porPagina
    return {
      itens: linhas.slice(inicio, inicio + consulta.porPagina).map(acessoDe),
      total: linhas.length,
    }
  }

  private async obter(id: string): Promise<LinhaDoAcesso> {
    const [l] = await this.selecionar(sql`a.id = ${id}`)
    if (!l) throw naoEncontrado()
    return l
  }

  /** Cria o link de convite e enfileira o e-mail. Roda na transação da requisição. */
  private async enviarConvite(p: {
    acessoId: string
    nome: string
    email: string
    empresaNome: string
  }): Promise<void> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const token = await this.links.criar(db, {
      tenantId,
      acessoId: p.acessoId,
      finalidade: 'convite',
      ip: this.ctx.ip,
    })
    const [d] = await db.execute<{ portal_nome: string | null; convidado_por: string }>(sql`
      SELECT (SELECT portal_nome FROM tenant_configuracoes) AS portal_nome,
             (SELECT nome FROM membros WHERE id = ${this.ctx.membro.id}) AS convidado_por`)
    await this.email.enfileirar(
      p.email,
      emailPortalConvite({
        nome: p.nome,
        portal: d?.portal_nome ?? p.empresaNome,
        empresa: p.empresaNome,
        convidadoPor: d?.convidado_por ?? 'A equipe',
        link: this.links.enderecoDoLink(token),
      }),
    )
  }

  async darAcesso(dados: DarAcessoAoPortalEntrada): Promise<AcessoDoPortal> {
    this.links.origemDoPortal() // sem PORTAL_URL o convite não teria para onde apontar
    const db = this.ctx.db()
    const [cfg] = await db.execute<{ portal_ativo: boolean }>(
      sql`SELECT portal_ativo FROM tenant_configuracoes`,
    )
    if (cfg?.portal_ativo !== true) {
      throw new ErroApi('portal_desligado', 'Ligue o portal do cliente antes de convidar.', 409)
    }
    const [vinculo] = await db.execute<{ contato_nome: string; empresa_nome: string }>(sql`
      SELECT c.nome AS contato_nome, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome
      FROM empresa_contatos ec
      JOIN contatos c ON c.id = ec.contato_id AND c.excluido_em IS NULL
      JOIN empresas e ON e.id = ec.empresa_id AND e.excluido_em IS NULL
      WHERE ec.contato_id = ${dados.contatoId} AND ec.empresa_id = ${dados.empresaClienteId}
        AND ec.ativo`)
    if (!vinculo) {
      throw new ErroApi(
        'contato_fora_da_empresa',
        'O contato precisa estar ativo na empresa-cliente para receber acesso.',
        422,
      )
    }
    let email = dados.email
    if (!email) {
      const [principal] = await db.execute<{ email: string }>(sql`
        SELECT email::text AS email FROM contato_emails
        WHERE contato_id = ${dados.contatoId} ORDER BY principal DESC, criado_em LIMIT 1`)
      if (!principal) {
        throw new ErroApi(
          'email_obrigatorio',
          'O contato não tem e-mail: informe o e-mail de acesso.',
          422,
        )
      }
      email = principal.email.toLowerCase()
    }
    // Conferências antes de gravar (uma violação de unicidade abortaria a transação da requisição)
    const [mesmoContato] = await db.execute(sql`
      SELECT 1 FROM portal_acessos WHERE contato_id = ${dados.contatoId} AND empresa_id = ${dados.empresaClienteId}
        AND situacao <> 'revogado' AND excluido_em IS NULL`)
    if (mesmoContato) {
      throw new ErroApi(
        'acesso_ja_existe',
        'Este contato já tem acesso ao portal desta empresa.',
        409,
      )
    }
    const [mesmoEmail] = await db.execute(sql`
      SELECT 1 FROM portal_acessos WHERE empresa_id = ${dados.empresaClienteId} AND email = ${email}
        AND situacao <> 'revogado' AND excluido_em IS NULL`)
    if (mesmoEmail) {
      throw new ErroApi(
        'email_em_uso',
        'Este e-mail já é usado por outro acesso desta empresa.',
        409,
      )
    }
    const id = novoId()
    await db.execute(sql`
      INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email, papel, situacao, convidado_por, criado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${dados.contatoId}, ${dados.empresaClienteId}, ${email},
              ${dados.papel}::papel_portal, 'convidado', ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    await this.enviarConvite({
      acessoId: id,
      nome: vinculo.contato_nome,
      email,
      empresaNome: vinculo.empresa_nome,
    })
    await this.auditoria.registrar({
      entidade: 'portal_acesso',
      entidadeId: id,
      acao: 'dar_acesso',
      alteracoes: {
        contatoId: dados.contatoId,
        empresaId: dados.empresaClienteId,
        papel: dados.papel,
      },
    })
    return acessoDe(await this.obter(id))
  }

  /** Reenvia o convite (o anterior deixa de valer). Só para quem ainda não aceitou. */
  async reenviarConvite(id: string): Promise<AcessoDoPortal> {
    this.links.origemDoPortal()
    const a = await this.obter(id)
    if (a.situacao !== 'convidado') {
      throw new ErroApi(
        'acesso_ja_ativo',
        'Só se reenvia o convite de quem ainda não aceitou.',
        409,
      )
    }
    await this.enviarConvite({
      acessoId: id,
      nome: a.contato_nome,
      email: a.email,
      empresaNome: a.empresa_nome,
    })
    await this.auditoria.registrar({
      entidade: 'portal_acesso',
      entidadeId: id,
      acao: 'reenviar_convite',
    })
    return acessoDe(await this.obter(id))
  }

  async alterar(id: string, dados: AlterarAcessoDoPortalEntrada): Promise<AcessoDoPortal> {
    const a = await this.obter(id)
    const db = this.ctx.db()
    if (dados.situacao) {
      const permitido =
        (dados.situacao === 'suspenso' && a.situacao === 'ativo') ||
        (dados.situacao === 'ativo' && a.situacao === 'suspenso')
      if (!permitido) {
        throw new ErroApi(
          'transicao_invalida',
          'Só se suspende um acesso ativo e só se reativa um acesso suspenso.',
          409,
        )
      }
    }
    if (dados.papel && a.situacao === 'revogado') throw naoEncontrado()
    await db.execute(sql`
      UPDATE portal_acessos
      SET papel = ${dados.papel ?? a.papel}::papel_portal,
          situacao = ${dados.situacao ?? a.situacao}::situacao_acesso_portal,
          atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    // Suspender derruba as sessões abertas na hora
    if (dados.situacao === 'suspenso') await this.derrubarSessoes(id)
    await this.auditoria.registrar({
      entidade: 'portal_acesso',
      entidadeId: id,
      acao:
        dados.situacao === 'suspenso'
          ? 'suspender'
          : dados.situacao === 'ativo'
            ? 'reativar'
            : 'alterar',
      alteracoes: { antes: { papel: a.papel, situacao: a.situacao }, depois: dados },
    })
    return acessoDe(await this.obter(id))
  }

  /** Revoga o acesso para sempre (um novo convite cria outro acesso): derruba as sessões e invalida os links. */
  async revogar(id: string): Promise<void> {
    const a = await this.obter(id)
    const db = this.ctx.db()
    await db.execute(sql`
      UPDATE portal_acessos SET situacao = 'revogado', atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await db.execute(sql`
      UPDATE portal_links SET usado_em = now(), atualizado_em = now() WHERE acesso_id = ${id} AND usado_em IS NULL`)
    await this.derrubarSessoes(id)
    await this.auditoria.registrar({
      entidade: 'portal_acesso',
      entidadeId: id,
      acao: 'revogar',
      alteracoes: { situacaoAnterior: a.situacao },
    })
  }

  private async derrubarSessoes(acessoId: string): Promise<void> {
    await this.ctx.db().execute(sql`
      UPDATE portal_sessoes SET revogada_em = now(), atualizado_em = now()
      WHERE acesso_id = ${acessoId} AND revogada_em IS NULL`)
  }

  // ------------------------------------------------------------------------------- configuração

  async configuracao(): Promise<ConfiguracaoDoPortal> {
    const [c] = await this.ctx.db().execute<{
      ativo: boolean
      nome: string | null
      exige: boolean
      comentarios: boolean
      limite: number
      satisfacao: string | null
      crm_ativo: boolean
      crm_responsavel: string | null
      avaliacao_email: boolean
      slug: string | null
      pagina: boolean
      associacao: string | null
    }>(sql`
      SELECT portal_ativo AS ativo, portal_nome AS nome, portal_exige_dois_fatores_responsavel AS exige,
             portal_comentarios_ativos AS comentarios, portal_avisos_limite_semanal AS limite,
             portal_formulario_satisfacao_id AS satisfacao, portal_eventos_crm_ativo AS crm_ativo,
             portal_eventos_crm_responsavel_id AS crm_responsavel, portal_avaliacao_por_email AS avaliacao_email,
             portal_slug AS slug, portal_pagina_eventos_ativa AS pagina,
             portal_formulario_associacao_id AS associacao
      FROM tenant_configuracoes`)
    return {
      ativo: c?.ativo ?? false,
      nome: c?.nome ?? null,
      logoUrl: null,
      exigeDoisFatoresDoResponsavel: c?.exige ?? false,
      comentariosAtivos: c?.comentarios ?? true,
      avisosLimiteSemanal: c?.limite ?? LIMITE_SEMANAL_PADRAO_DE_AVISOS,
      formularioSatisfacaoId: c?.satisfacao ?? null,
      eventosCrmAtivo: c?.crm_ativo ?? false,
      eventosCrmResponsavelId: c?.crm_responsavel ?? null,
      avaliacaoPorEmail: c?.avaliacao_email ?? false,
      slug: c?.slug ?? null,
      paginaEventosAtiva: c?.pagina ?? false,
      formularioAssociacaoId: c?.associacao ?? null,
    }
  }

  async atualizarConfiguracao(
    d: AtualizarConfiguracaoDoPortalEntrada,
  ): Promise<ConfiguracaoDoPortal> {
    const antes = await this.configuracao()
    if (d.formularioSatisfacaoId) {
      const [f] = await this.ctx.db().execute(sql`
        SELECT 1 FROM formularios WHERE id = ${d.formularioSatisfacaoId} AND excluido_em IS NULL
          AND finalidade = 'satisfacao_chamado' AND situacao = 'publicado'`)
      if (!f) {
        throw new ErroApi(
          'formulario_invalido',
          'Escolha um formulário publicado com a finalidade "Satisfação do chamado".',
          422,
        )
      }
    }
    if (d.formularioAssociacaoId) {
      const [f] = await this.ctx.db().execute(sql`
        SELECT 1 FROM formularios WHERE id = ${d.formularioAssociacaoId} AND excluido_em IS NULL
          AND finalidade = 'associacao' AND situacao = 'publicado'`)
      if (!f) {
        throw new ErroApi(
          'formulario_invalido',
          'Escolha um formulário publicado com a finalidade "Associação".',
          422,
        )
      }
    }
    const slug = d.slug === undefined ? antes.slug : d.slug
    if ((d.paginaEventosAtiva ?? antes.paginaEventosAtiva) && !slug) {
      throw new ErroApi(
        'slug_obrigatorio',
        'Para ligar a página pública, escolha o endereço do portal.',
        422,
      )
    }
    const responsavel =
      d.eventosCrmResponsavelId === undefined
        ? antes.eventosCrmResponsavelId
        : d.eventosCrmResponsavelId
    if (d.eventosCrmResponsavelId) {
      // Só um administrador ou gestor ativo (Q-3): ele redistribui para o vendedor
      const [m] = await this.ctx.db().execute(sql`
        SELECT 1 FROM membros m JOIN perfis_acesso p ON p.id = m.perfil_id
        WHERE m.id = ${d.eventosCrmResponsavelId} AND m.ativo AND p.chave_sistema IN ('admin', 'gestor')`)
      if (!m) {
        throw new ErroApi(
          'responsavel_invalido',
          'Escolha um administrador ou gestor ativo para receber as tarefas dos eventos.',
          422,
        )
      }
    }
    if ((d.eventosCrmAtivo ?? antes.eventosCrmAtivo) && !responsavel) {
      throw new ErroApi(
        'responsavel_obrigatorio',
        'Para cadastrar no CRM pelo CNPJ, escolha quem recebe a tarefa.',
        422,
      )
    }
    // O endereço é único no sistema: o índice parcial decide (o RLS esconde o dos outros portais)
    try {
      await this.gravarConfiguracao(d, antes, responsavel, slug)
    } catch (e) {
      if (
        (e as { cause?: { code?: string } }).cause?.code === '23505' ||
        (e as { code?: string }).code === '23505'
      ) {
        throw slugEmUso()
      }
      throw e
    }
    const depois = await this.configuracao()
    await this.auditoria.registrar({
      entidade: 'portal_configuracao',
      acao: 'configurar',
      alteracoes: { antes, depois },
    })
    return depois
  }

  private async gravarConfiguracao(
    d: AtualizarConfiguracaoDoPortalEntrada,
    antes: ConfiguracaoDoPortal,
    responsavel: string | null,
    slug: string | null,
  ): Promise<void> {
    await this.ctx.db().execute(sql`
      UPDATE tenant_configuracoes
      SET portal_ativo = ${d.ativo ?? antes.ativo},
          portal_nome = ${d.nome === undefined ? antes.nome : d.nome},
          portal_exige_dois_fatores_responsavel = ${d.exigeDoisFatoresDoResponsavel ?? antes.exigeDoisFatoresDoResponsavel},
          portal_comentarios_ativos = ${d.comentariosAtivos ?? antes.comentariosAtivos},
          portal_avisos_limite_semanal = ${d.avisosLimiteSemanal ?? antes.avisosLimiteSemanal},
          portal_eventos_crm_ativo = ${d.eventosCrmAtivo ?? antes.eventosCrmAtivo},
          portal_eventos_crm_responsavel_id = ${responsavel},
          portal_avaliacao_por_email = ${d.avaliacaoPorEmail ?? antes.avaliacaoPorEmail},
          portal_formulario_satisfacao_id = ${d.formularioSatisfacaoId === undefined ? antes.formularioSatisfacaoId : d.formularioSatisfacaoId},
          portal_slug = ${slug},
          portal_pagina_eventos_ativa = ${d.paginaEventosAtiva ?? antes.paginaEventosAtiva},
          portal_formulario_associacao_id = ${d.formularioAssociacaoId === undefined ? antes.formularioAssociacaoId : d.formularioAssociacaoId},
          atualizado_em = now()`)
  }
}
