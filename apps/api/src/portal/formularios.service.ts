import { randomBytes } from 'node:crypto'

import { novoId, sql } from '@leadtogo/db'
import {
  type ConsultaDeFormularios,
  type ConsultaDeRespostas,
  type DefinicaoDeFormulario,
  definicaoDeFormularioSchema,
  type Formulario,
  type ItemDeFormulario,
  type ListaDeFormularios,
  type RespostaDeFormulario,
  type Respostas,
  type SalvarFormularioEntrada,
  TIPOS_DE_APRESENTACAO,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { gerarSegredo } from '../integracoes/webhooks/entrega.js'
import { chavesDe, cifrar } from '../seguranca/cifra.js'

type LinhaDoFormulario = {
  id: string
  nome: string
  finalidade: ItemDeFormulario['finalidade']
  acesso: ItemDeFormulario['acesso']
  situacao: ItemDeFormulario['situacao']
  slug: string
  captcha: boolean
  definicao: DefinicaoDeFormulario
  versao_publicada: number | null
  tem_mudancas: boolean
  respostas: number
  ultima_resposta_em: string | Date | null
  atualizado_em: string | Date
}

const COLUNAS = sql`
  f.id, f.nome, f.finalidade::text AS finalidade, f.acesso::text AS acesso, f.situacao::text AS situacao, f.slug,
  f.captcha, f.definicao, f.versao_publicada, f.tem_mudancas, f.atualizado_em,
  (SELECT count(*)::int FROM formulario_respostas r WHERE r.formulario_id = f.id AND r.excluido_em IS NULL) AS respostas,
  (SELECT max(r.criado_em) FROM formulario_respostas r WHERE r.formulario_id = f.id AND r.excluido_em IS NULL) AS ultima_resposta_em`

const iso = (v: string | Date | null): string | null =>
  v === null ? null : new Date(v).toISOString()
const naoEncontrado = () => new ErroApi('nao_encontrado', 'Formulário não encontrado.', 404)

/** Slug do endereço público: o nome simplificado + 6 caracteres aleatórios (único no sistema). */
export function novoSlug(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  const sufixo = randomBytes(6)
    .toString('base64url')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, 'x')
    .slice(0, 6)
  return `${base || 'formulario'}-${sufixo}`
}

/** Uma linha do CSV, com aspas quando precisa (e neutralizando fórmula de planilha). */
function linhaCsv(valores: string[]): string {
  return valores
    .map((v) => {
      const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
      return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
    })
    .join(';')
}

const textoDoValor = (v: unknown): string =>
  v === null || v === undefined
    ? ''
    : Array.isArray(v)
      ? v.join(', ')
      : typeof v === 'boolean'
        ? v
          ? 'Sim'
          : 'Não'
        : typeof v === 'number' || typeof v === 'string'
          ? String(v)
          : ''

/**
 * Formulários do portal pela EQUIPE (`portal.formularios`, Fase 4E): o rascunho é editado à vontade; publicar
 * congela uma versão nova (as respostas guardam a versão). Respostas listadas e exportadas em CSV.
 */
@Injectable()
export class FormulariosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  private paraItem(l: LinhaDoFormulario): ItemDeFormulario {
    return {
      id: l.id,
      nome: l.nome,
      finalidade: l.finalidade,
      acesso: l.acesso,
      situacao: l.situacao,
      slug: l.slug,
      versaoPublicada: l.versao_publicada,
      temMudancas: l.tem_mudancas,
      respostas: Number(l.respostas),
      ultimaRespostaEm: iso(l.ultima_resposta_em),
      atualizadoEm: new Date(l.atualizado_em).toISOString(),
    }
  }

  private async linha(id: string): Promise<LinhaDoFormulario> {
    const [l] = await this.ctx
      .db()
      .execute<LinhaDoFormulario>(
        sql`SELECT ${COLUNAS} FROM formularios f WHERE f.id = ${id} AND f.excluido_em IS NULL`,
      )
    if (!l) throw naoEncontrado()
    return l
  }

  async listar(c: ConsultaDeFormularios): Promise<ListaDeFormularios> {
    const db = this.ctx.db()
    const onde = sql`f.excluido_em IS NULL
      ${c.situacao ? sql`AND f.situacao = ${c.situacao}::situacao_formulario` : sql``}
      ${c.finalidade ? sql`AND f.finalidade = ${c.finalidade}::finalidade_formulario` : sql``}`
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM formularios f WHERE ${onde}`,
    )
    const linhas = await db.execute<LinhaDoFormulario>(sql`
      SELECT ${COLUNAS} FROM formularios f WHERE ${onde}
      ORDER BY f.atualizado_em DESC, f.id DESC
      LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return { itens: linhas.map((l) => this.paraItem(l)), total: total?.n ?? 0 }
  }

  async obter(id: string): Promise<Formulario> {
    const l = await this.linha(id)
    return { ...this.paraItem(l), captcha: l.captcha, definicao: l.definicao }
  }

  async criar(d: SalvarFormularioEntrada): Promise<Formulario> {
    const id = novoId()
    const eu = this.ctx.membro.id
    await this.ctx.db().execute(sql`
      INSERT INTO formularios (id, tenant_id, nome, finalidade, acesso, captcha, slug, definicao, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${d.nome}, ${d.finalidade}::finalidade_formulario,
              ${d.acesso}::acesso_formulario, ${d.captcha}, ${novoSlug(d.nome)}, ${JSON.stringify(d.definicao)}::jsonb,
              ${eu}, ${eu})`)
    await this.auditoria.registrar({
      entidade: 'formulario',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { nome: d.nome, finalidade: d.finalidade, acesso: d.acesso },
    })
    return this.obter(id)
  }

  /** Salva o rascunho (o que está publicado só muda ao publicar de novo). */
  async atualizar(id: string, d: SalvarFormularioEntrada): Promise<Formulario> {
    const antes = await this.linha(id)
    if (antes.situacao === 'arquivado') {
      throw new ErroApi('formulario_arquivado', 'Reative o formulário para editar.', 409)
    }
    await this.ctx.db().execute(sql`
      UPDATE formularios SET nome = ${d.nome}, finalidade = ${d.finalidade}::finalidade_formulario,
        acesso = ${d.acesso}::acesso_formulario, captcha = ${d.captcha},
        definicao = ${JSON.stringify(d.definicao)}::jsonb, tem_mudancas = true,
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'formulario',
      entidadeId: id,
      acao: 'editar',
      alteracoes: { nome: d.nome, acesso: d.acesso, campos: d.definicao.campos.length },
    })
    return this.obter(id)
  }

  /** Congela o rascunho numa versão nova e passa a aceitar respostas. */
  async publicar(id: string): Promise<Formulario> {
    const db = this.ctx.db()
    const [l] = await db.execute<{ definicao: unknown; situacao: string }>(sql`
      SELECT definicao, situacao::text AS situacao FROM formularios
      WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`)
    if (!l) throw naoEncontrado()
    const valida = definicaoDeFormularioSchema.safeParse(l.definicao)
    if (!valida.success) {
      throw new ErroApi(
        'definicao_invalida',
        `O formulário tem problemas: ${valida.error.issues[0]?.message ?? 'confira os campos'}.`,
        422,
      )
    }
    const [v] = await db.execute<{ proxima: number }>(sql`
      SELECT coalesce(max(versao), 0) + 1 AS proxima FROM formulario_versoes WHERE formulario_id = ${id}`)
    const versao = Number(v?.proxima ?? 1)
    await db.execute(sql`
      INSERT INTO formulario_versoes (id, tenant_id, formulario_id, versao, definicao, publicada_por)
      VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${versao}, ${JSON.stringify(valida.data)}::jsonb,
              ${this.ctx.membro.id})`)
    await db.execute(sql`
      UPDATE formularios SET situacao = 'publicado', versao_publicada = ${versao}, tem_mudancas = false,
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'formulario',
      entidadeId: id,
      acao: 'publicar',
      alteracoes: { versao },
    })
    return this.obter(id)
  }

  /** Arquivado não aceita respostas (as que existem ficam); reativar volta a publicado. */
  async arquivar(id: string, arquivado: boolean): Promise<Formulario> {
    const l = await this.linha(id)
    const nova = arquivado ? 'arquivado' : l.versao_publicada ? 'publicado' : 'rascunho'
    await this.ctx.db().execute(sql`
      UPDATE formularios SET situacao = ${nova}::situacao_formulario, atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'formulario',
      entidadeId: id,
      acao: arquivado ? 'arquivar' : 'reativar',
    })
    return this.obter(id)
  }

  /** Cópia em rascunho, com a mesma definição (sem respostas nem versões). */
  async duplicar(id: string): Promise<Formulario> {
    const l = await this.linha(id)
    const nome = `Cópia de ${l.nome}`.slice(0, 120)
    return this.criar({
      nome,
      finalidade: l.finalidade,
      acesso: l.acesso,
      captcha: l.captcha,
      definicao: l.definicao,
    })
  }

  async excluir(id: string): Promise<void> {
    await this.linha(id)
    await this.ctx.db().execute(sql`
      UPDATE formularios SET excluido_em = now(), situacao = 'arquivado', atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({ entidade: 'formulario', entidadeId: id, acao: 'excluir' })
  }

  /**
   * Gera (ou troca) o segredo que assina as ações de webhook do formulário. Aparece só nesta resposta; no banco
   * fica cifrado.
   */
  async regerarSegredo(id: string): Promise<{ segredo: string }> {
    await this.linha(id)
    const segredo = gerarSegredo()
    await this.ctx.db().execute(sql`
      UPDATE formularios SET segredo_webhook = ${cifrar(segredo, chavesDe(this.config))}, atualizado_em = now()
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'formulario',
      entidadeId: id,
      acao: 'segredo_regerado',
    })
    return { segredo }
  }

  // ------------------------------------------------------------------------------------- respostas

  private async camposPublicados(id: string) {
    const l = await this.linha(id)
    if (!l.versao_publicada) return []
    const [v] = await this.ctx.db().execute<{ definicao: DefinicaoDeFormulario }>(sql`
      SELECT definicao FROM formulario_versoes WHERE formulario_id = ${id} AND versao = ${l.versao_publicada}`)
    return (v?.definicao.campos ?? [])
      .filter((c) => !TIPOS_DE_APRESENTACAO.includes(c.tipo))
      .map((c) => ({ id: c.id, rotulo: c.rotulo, tipo: c.tipo }))
  }

  private async linhasDeRespostas(id: string, limite: number | null, deslocamento: number) {
    return this.ctx.db().execute<{
      id: string
      versao: number
      origem: RespostaDeFormulario['origem']
      botao: string
      respostas: Respostas
      pessoa: string | null
      empresa: string | null
      contexto_tipo: string | null
      contexto_id: string | null
      criado_em: string | Date
    }>(sql`
      SELECT r.id, r.versao, r.origem::text AS origem, r.botao, r.respostas, c.nome AS pessoa,
             coalesce(e.nome_fantasia, e.razao_social) AS empresa, r.contexto_tipo, r.contexto_id, r.criado_em
      FROM formulario_respostas r
      LEFT JOIN contatos c ON c.id = r.contato_id
      LEFT JOIN empresas e ON e.id = r.empresa_id
      WHERE r.formulario_id = ${id} AND r.excluido_em IS NULL
      ORDER BY r.criado_em DESC, r.id DESC
      ${limite === null ? sql`` : sql`LIMIT ${limite} OFFSET ${deslocamento}`}`)
  }

  async respostas(id: string, c: ConsultaDeRespostas) {
    const campos = await this.camposPublicados(id)
    const [total] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM formulario_respostas WHERE formulario_id = ${id} AND excluido_em IS NULL`)
    const linhas = await this.linhasDeRespostas(id, c.porPagina, (c.pagina - 1) * c.porPagina)
    return {
      itens: linhas.map((r): RespostaDeFormulario => ({
        id: r.id,
        versao: r.versao,
        origem: r.origem,
        botao: r.botao,
        valores: r.respostas,
        pessoa: r.pessoa,
        empresa: r.empresa,
        contexto:
          r.contexto_tipo && r.contexto_id ? { tipo: r.contexto_tipo, id: r.contexto_id } : null,
        criadoEm: new Date(r.criado_em).toISOString(),
      })),
      total: total?.n ?? 0,
      campos,
    }
  }

  /** CSV (UTF-8 com BOM, separado por ";", para o Excel em português) com todas as respostas. */
  async exportarCsv(id: string): Promise<{ nome: string; conteudo: string }> {
    const l = await this.linha(id)
    const campos = await this.camposPublicados(id)
    const linhas = await this.linhasDeRespostas(id, null, 0)
    const cabecalho = ['Data', 'Origem', 'Pessoa', 'Empresa', ...campos.map((c) => c.rotulo)]
    const corpo = linhas.map((r) =>
      linhaCsv([
        new Date(r.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        r.origem,
        r.pessoa ?? '',
        r.empresa ?? '',
        ...campos.map((c) => textoDoValor(r.respostas[c.id])),
      ]),
    )
    await this.auditoria.registrar({
      entidade: 'formulario',
      entidadeId: id,
      acao: 'exportar_respostas',
      alteracoes: { linhas: linhas.length },
    })
    return {
      nome: `${l.slug}-respostas.csv`,
      conteudo: `\uFEFF${[linhaCsv(cabecalho), ...corpo].join('\r\n')}\r\n`,
    }
  }
}
