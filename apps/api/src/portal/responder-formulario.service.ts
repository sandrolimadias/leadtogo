import { type Conexao, novoId, sql } from '@leadtogo/db'
import {
  type DefinicaoDeFormulario,
  type EnviarRespostaEntrada,
  type FonteDePreenchimento,
  type FormularioParaResponder,
  type Respostas,
  TAMANHO_MAXIMO_DAS_RESPOSTAS,
  validarRespostasDoFormulario,
} from '@leadtogo/shared'
import { Inject, Injectable, Logger } from '@nestjs/common'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'
import { agendarAcoesDoFormulario } from './acoes-formulario.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'

const naoEncontrado = () => new ErroApi('nao_encontrado', 'Formulário não encontrado.', 404)

type FormularioPublicado = {
  id: string
  nome: string
  acesso: 'publico' | 'logado'
  captcha: boolean
  versao: number
  definicao: DefinicaoDeFormulario
  mensagem: string
}

/** Contexto opcional da resposta (a inscrição de um evento, a pesquisa de um chamado...). */
export interface ContextoDaResposta {
  tipo: string
  id: string
}

/**
 * Responder um formulário publicado (Fase 4E): pelo cliente logado no portal (com o preenchimento automático,
 * montado aqui pelo servidor) ou por qualquer pessoa no endereço público. A validação é a mesma do navegador e é
 * sempre refeita aqui; as ações do botão rodam no worker (outbox), depois do commit.
 */
@Injectable()
export class ResponderFormularioService {
  private readonly log = new Logger(ResponderFormularioService.name)

  constructor(
    private readonly ctx: ContextoTenantService,
    @Inject(BANCO) private readonly banco: Conexao,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  private async publicado(db: Transacao, id: string): Promise<FormularioPublicado> {
    const [f] = await db.execute<{
      id: string
      nome: string
      acesso: 'publico' | 'logado'
      captcha: boolean
      versao: number
      definicao: DefinicaoDeFormulario
    }>(sql`
      SELECT f.id, f.nome, f.acesso::text AS acesso, f.captcha, v.versao, v.definicao
      FROM formularios f JOIN formulario_versoes v ON v.formulario_id = f.id AND v.versao = f.versao_publicada
      WHERE f.id = ${id} AND f.situacao = 'publicado' AND f.excluido_em IS NULL`)
    if (!f) throw naoEncontrado()
    return { ...f, mensagem: f.definicao.mensagemDeSucesso }
  }

  private captchaLigado(f: FormularioPublicado): boolean {
    return f.captcha && Boolean(this.config.TURNSTILE_SECRET && this.config.TURNSTILE_SITE_KEY)
  }

  // ------------------------------------------------------------------------------- cliente logado

  /** Os valores que o servidor preenche para quem está logado (nunca vêm do navegador). */
  private async valoresDaSessao(
    db: Transacao,
  ): Promise<Record<FonteDePreenchimento, string | null>> {
    const p = this.ctx.portal
    const [d] = await db.execute<{
      nome: string | null
      cargo: string | null
      telefone: string | null
      documento: string | null
      tipo_documento: string | null
      razao_social: string | null
      nome_fantasia: string | null
      cidade: string | null
      uf: string | null
    }>(sql`
      SELECT c.nome, ec.cargo,
        (SELECT t.numero FROM contato_telefones t WHERE t.contato_id = c.id ORDER BY t.principal DESC, t.criado_em LIMIT 1) AS telefone,
        e.documento, e.tipo_documento::text AS tipo_documento, e.razao_social, e.nome_fantasia,
        m.nome AS cidade, m.uf::text AS uf
      FROM contatos c
      LEFT JOIN empresa_contatos ec ON ec.contato_id = c.id AND ec.empresa_id = ${p.empresaId}
      LEFT JOIN empresas e ON e.id = ${p.empresaId}
      LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
      WHERE c.id = ${p.contatoId}`)
    return {
      'contato.nome': d?.nome ?? p.nome,
      'contato.email': p.email,
      'contato.telefone': d?.telefone ?? null,
      'contato.cargo': d?.cargo ?? null,
      'empresa.cnpj': d?.tipo_documento === 'cnpj' ? (d.documento ?? null) : null,
      'empresa.razao_social': d?.razao_social ?? null,
      'empresa.nome_fantasia': d?.nome_fantasia ?? null,
      'empresa.cidade': d?.cidade ?? null,
      'empresa.uf': d?.uf ?? null,
    }
  }

  private async preenchimento(
    db: Transacao,
    definicao: DefinicaoDeFormulario,
  ): Promise<{ preenchidos: Respostas; travados: Respostas }> {
    const sessao = await this.valoresDaSessao(db)
    const preenchidos: Respostas = {}
    const travados: Respostas = {}
    for (const c of definicao.campos) {
      if (!c.preenchimento) continue
      const v = sessao[c.preenchimento.fonte]
      if (v === null || v === '') continue
      preenchidos[c.id] = v
      if (c.preenchimento.travado) travados[c.id] = v
    }
    return { preenchidos, travados }
  }

  async paraOCliente(id: string): Promise<FormularioParaResponder> {
    const db = this.ctx.db()
    const f = await this.publicado(db, id)
    const { preenchidos, travados } = await this.preenchimento(db, f.definicao)
    return {
      id: f.id,
      nome: f.nome,
      versao: f.versao,
      definicao: f.definicao,
      preenchidos,
      travados: Object.keys(travados),
      captchaChave: null,
    }
  }

  /** Grava a resposta do cliente logado (as ações do botão vão para o outbox na mesma transação). */
  async responderComoCliente(
    id: string,
    d: EnviarRespostaEntrada,
    contexto: ContextoDaResposta | null = null,
  ): Promise<{ id: string; mensagem: string; valores: Respostas }> {
    const db = this.ctx.db()
    const f = await this.publicado(db, id)
    const { travados } = await this.preenchimento(db, f.definicao)
    const valores = this.conferir(f, d, travados)
    const p = this.ctx.portal
    const respostaId = novoId()
    await db.execute(sql`
      INSERT INTO formulario_respostas (id, tenant_id, formulario_id, versao, origem, botao, respostas, acesso_id,
        contato_id, empresa_id, contexto_tipo, contexto_id, ip)
      VALUES (${respostaId}, ${p.tenantId}, ${f.id}, ${f.versao}, 'portal', ${d.botao}, ${JSON.stringify(valores)}::jsonb,
        ${p.acessoId}, ${p.contatoId}, ${p.empresaId}, ${contexto?.tipo ?? null}, ${contexto?.id ?? null}, ${this.ctx.ip ?? null})`)
    await agendarAcoesDoFormulario(db, p.tenantId, respostaId)
    await auditarAtoDoPortal(db, {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'formulario',
      entidadeId: f.id,
      acao: 'responder',
      alteracoes: { respostaId, versao: f.versao },
      ip: this.ctx.ip,
    })
    return { id: respostaId, mensagem: f.mensagem, valores }
  }

  private conferir(
    f: FormularioPublicado,
    d: EnviarRespostaEntrada,
    travados: Respostas,
  ): Respostas {
    if (d.versao !== f.versao) {
      throw new ErroApi(
        'versao_desatualizada',
        'O formulário mudou enquanto você respondia. Recarregue a página e confira.',
        409,
      )
    }
    if (!f.definicao.botoes.some((b) => b.id === d.botao)) {
      throw new ErroApi('botao_invalido', 'Botão inválido.', 400)
    }
    if (JSON.stringify(d.respostas).length > TAMANHO_MAXIMO_DAS_RESPOSTAS) {
      throw new ErroApi('resposta_grande_demais', 'A resposta passou do tamanho permitido.', 413)
    }
    const r = validarRespostasDoFormulario(f.definicao, d.respostas, travados)
    if (!r.ok) {
      throw new ErroApi(
        'respostas_invalidas',
        'Confira os campos destacados.',
        422,
        Object.entries(r.erros).map(([campo, mensagem]) => ({ campo, mensagem })),
      )
    }
    return r.valores
  }

  // ------------------------------------------------------------------------------------ público

  /** O formulário publicado para quem responde por um link pessoal (sem login), dentro da transação do tenant. */
  async paraConvite(tx: Transacao, formularioId: string): Promise<FormularioParaResponder> {
    const f = await this.publicado(tx, formularioId)
    return {
      id: f.id,
      nome: f.nome,
      versao: f.versao,
      definicao: f.definicao,
      preenchidos: {},
      travados: [],
      captchaChave: null,
    }
  }

  /**
   * Resposta por um link pessoal (avaliação do evento por e-mail): quem tem o link já foi identificado, então não
   * pede captcha nem exige formulário público. Roda na transação do tenant que o chamador abriu.
   */
  async responderPorConvite(
    tx: Transacao,
    tenantId: string,
    formularioId: string,
    d: EnviarRespostaEntrada,
    contexto: ContextoDaResposta,
    ip: string | undefined,
  ): Promise<{ id: string; mensagem: string; valores: Respostas }> {
    const f = await this.publicado(tx, formularioId)
    const valores = this.conferir(f, d, {})
    const respostaId = novoId()
    await tx.execute(sql`
      INSERT INTO formulario_respostas (id, tenant_id, formulario_id, versao, origem, botao, respostas, contexto_tipo,
        contexto_id, ip, consentimento_em)
      VALUES (${respostaId}, ${tenantId}, ${f.id}, ${f.versao}, 'publico', ${d.botao}, ${JSON.stringify(valores)}::jsonb,
        ${contexto.tipo}, ${contexto.id}, ${ip ?? null}, now())`)
    await agendarAcoesDoFormulario(tx, tenantId, respostaId)
    return { id: respostaId, mensagem: f.mensagem, valores }
  }

  // ------------------------------------------------------------- página pública (Fase 4H)

  /** Captcha configurado no ambiente (as duas chaves do Turnstile). */
  captchaDisponivel(): boolean {
    return Boolean(this.config.TURNSTILE_SECRET && this.config.TURNSTILE_SITE_KEY)
  }

  /** A chave do captcha para o navegador, ou nula (sem captcha). */
  chaveDoCaptcha(ligado: boolean): string | null {
    return ligado && this.captchaDisponivel() ? (this.config.TURNSTILE_SITE_KEY ?? null) : null
  }

  /** O formulário publicado para a página pública, na transação do tenant (captcha conforme o formulário). */
  async paraPagina(tx: Transacao, formularioId: string): Promise<FormularioParaResponder> {
    const f = await this.publicado(tx, formularioId)
    return {
      id: f.id,
      nome: f.nome,
      versao: f.versao,
      definicao: f.definicao,
      preenchidos: {},
      travados: [],
      captchaChave: this.chaveDoCaptcha(f.captcha),
    }
  }

  /** Captcha do formulário (ligado nele) na página pública. */
  async captchaDoFormulario(tx: Transacao, formularioId: string): Promise<boolean> {
    return (await this.publicado(tx, formularioId)).captcha
  }

  /** Envio sem login: aceite de privacidade obrigatório e captcha quando ligado (422). */
  async exigirEnvioPublico(
    d: EnviarRespostaEntrada,
    captcha: boolean,
    ip: string | undefined,
  ): Promise<void> {
    if (d.aceitaPrivacidade !== true) {
      throw new ErroApi(
        'privacidade_obrigatoria',
        'Para enviar, aceite o aviso de privacidade.',
        422,
      )
    }
    if (captcha && this.captchaDisponivel() && !(await this.captchaValido(d.captcha, ip))) {
      throw new ErroApi('captcha_invalido', 'Confirme que você não é um robô e envie de novo.', 422)
    }
  }

  /** Confere as respostas contra uma definição sem formulário guardado (a inscrição padrão, versão 1). */
  conferirDefinicao(definicao: DefinicaoDeFormulario, d: EnviarRespostaEntrada): Respostas {
    return this.conferir(
      {
        id: '',
        nome: '',
        acesso: 'publico',
        captcha: true,
        versao: 1,
        definicao,
        mensagem: '',
      },
      d,
      {},
    )
  }

  /** Grava a resposta pública de um formulário guardado, na transação do tenant, e agenda as ações dos botões. */
  async gravarRespostaPublica(
    tx: Transacao,
    tenantId: string,
    formularioId: string,
    d: EnviarRespostaEntrada,
    contexto: ContextoDaResposta | null,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<{
    id: string
    mensagem: string
    valores: Respostas
    definicao: DefinicaoDeFormulario
  }> {
    const f = await this.publicado(tx, formularioId)
    const valores = this.conferir(f, d, {})
    const respostaId = novoId()
    await tx.execute(sql`
      INSERT INTO formulario_respostas (id, tenant_id, formulario_id, versao, origem, botao, respostas, contexto_tipo,
        contexto_id, ip, agente, consentimento_em)
      VALUES (${respostaId}, ${tenantId}, ${f.id}, ${f.versao}, 'publico', ${d.botao}, ${JSON.stringify(valores)}::jsonb,
        ${contexto?.tipo ?? null}, ${contexto?.id ?? null}, ${ip ?? null}, ${agente?.slice(0, 300) ?? null}, now())`)
    await agendarAcoesDoFormulario(tx, tenantId, respostaId)
    return { id: respostaId, mensagem: f.mensagem, valores, definicao: f.definicao }
  }

  private async noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  private async tenantDoSlug(slug: string): Promise<{ tenantId: string; formularioId: string }> {
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) throw naoEncontrado()
    const [r] = await this.banco.db.execute<{ tenant_id: string; formulario_id: string }>(
      sql`SELECT tenant_id, formulario_id FROM app_formulario_publico(${slug})`,
    )
    if (!r) throw naoEncontrado()
    return { tenantId: r.tenant_id, formularioId: r.formulario_id }
  }

  async publico(slug: string): Promise<FormularioParaResponder> {
    const { tenantId, formularioId } = await this.tenantDoSlug(slug)
    const f = await this.noTenant(tenantId, (tx) => this.publicado(tx, formularioId))
    return {
      id: f.id,
      nome: f.nome,
      versao: f.versao,
      definicao: f.definicao,
      preenchidos: {},
      travados: [],
      captchaChave: this.captchaLigado(f) ? (this.config.TURNSTILE_SITE_KEY ?? null) : null,
    }
  }

  private async captchaValido(token: string | undefined, ip: string | undefined): Promise<boolean> {
    if (!token) return false
    try {
      const corpo = new URLSearchParams({
        secret: this.config.TURNSTILE_SECRET ?? '',
        response: token,
      })
      if (ip) corpo.set('remoteip', ip)
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: corpo,
        signal: AbortSignal.timeout(8000),
      })
      const json = (await r.json()) as { success?: boolean }
      return json.success === true
    } catch (erro) {
      this.log.warn(`captcha indisponível: ${erro instanceof Error ? erro.message : String(erro)}`)
      return false
    }
  }

  /**
   * Resposta do endereço público: aceite de privacidade obrigatório, captcha quando ligado, campo isca. Quem
   * preenche a isca recebe a mesma resposta de sucesso, mas nada é gravado.
   */
  async responderPublico(
    slug: string,
    d: EnviarRespostaEntrada,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<{ id: string | null; mensagem: string }> {
    const { tenantId, formularioId } = await this.tenantDoSlug(slug)
    const f = await this.noTenant(tenantId, (tx) => this.publicado(tx, formularioId))
    if (d.site) return { id: null, mensagem: f.mensagem }
    if (d.aceitaPrivacidade !== true) {
      throw new ErroApi(
        'privacidade_obrigatoria',
        'Para enviar, aceite o aviso de privacidade.',
        422,
      )
    }
    if (this.captchaLigado(f) && !(await this.captchaValido(d.captcha, ip))) {
      throw new ErroApi('captcha_invalido', 'Confirme que você não é um robô e envie de novo.', 422)
    }
    const valores = this.conferir(f, d, {})
    const respostaId = novoId()
    await this.noTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO formulario_respostas (id, tenant_id, formulario_id, versao, origem, botao, respostas, ip, agente,
          consentimento_em)
        VALUES (${respostaId}, ${tenantId}, ${f.id}, ${f.versao}, 'publico', ${d.botao}, ${JSON.stringify(valores)}::jsonb,
          ${ip ?? null}, ${agente?.slice(0, 300) ?? null}, now())`)
      await agendarAcoesDoFormulario(tx, tenantId, respostaId)
    })
    return { id: respostaId, mensagem: f.mensagem }
  }
}
