import { type SQL, sql } from '@leadtogo/db'
import {
  type AlterarContatoPublico,
  type AlterarEmpresaPublica,
  type AlterarOportunidadePublica,
  type AtividadePublica,
  type ConcluirAtividadePublica,
  type ConsultaDeAtividadesPublica,
  type ConsultaDeContatosPublica,
  type ConsultaDeEmpresasPublica,
  type ConsultaDeOportunidadesPublica,
  type ContatoPublico,
  type CriarAtividadePublica,
  type CriarContatoPublico,
  type CriarEmpresaPublica,
  type CriarOportunidadePublica,
  type EmpresaPublica,
  type EuPublico,
  normalizarCnpj,
  normalizarTelefone,
  type OportunidadePublica,
  type ResultadoDoLotePublico,
  criarEmpresaPublicaSchema,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService, type Transacao } from '../../acesso/contexto-tenant.service.js'
import { AtividadesService } from '../../carteira/atividades.service.js'
import { ContatosService } from '../../carteira/contatos.service.js'
import { EmpresasDaCarteiraService } from '../../carteira/empresas.service.js'
import { OportunidadesService } from '../../carteira/oportunidades.service.js'
import { ErroApi } from '../../http/erro-api.js'
import { LIMITE_DA_CHAVE_POR_DIA, LIMITE_DA_CHAVE_POR_MINUTO } from '../chave.guard.js'
import {
  condicaoDeTag,
  condicoesDePagina,
  lerAtividade,
  lerAtividades,
  lerContato,
  lerContatos,
  lerEmpresa,
  lerEmpresas,
  lerOportunidade,
  lerOportunidades,
  type Pagina,
  paginar,
} from './leitura.js'

const invalido = (campo: string, codigo: string, mensagem: string) =>
  new ErroApi(codigo, mensagem, 422, [{ campo, mensagem }])

const telefones = (
  lista: { numero: string; tipo?: string | undefined; principal?: boolean | undefined }[],
) =>
  lista.map((t) => ({
    numero: t.numero,
    ...(t.tipo ? { tipo: t.tipo as 'fixo' | 'celular' | 'whatsapp' | 'outro' } : {}),
    ...(t.principal !== undefined ? { principal: t.principal } : {}),
  }))

/**
 * A API pública v1 (docs/plano_api_aberta.md, seção 5). As escritas passam pelos MESMOS serviços que o app usa
 * (regras de carteira, Receita, tags, recálculo da última visita e do último contato, auditoria); aqui só se
 * traduz o contrato público (snake_case, referências por chave do sistema ou CNPJ) e se devolve o DTO público.
 */
@Injectable()
export class PublicaService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly empresas: EmpresasDaCarteiraService,
    private readonly contatos: ContatosService,
    private readonly atividades: AtividadesService,
    private readonly oportunidades: OportunidadesService,
  ) {}

  private get db(): Transacao {
    return this.ctx.db()
  }

  async eu(): Promise<EuPublico> {
    const chave = this.chave()
    const [empresa] = await this.db.execute<{ id: string; nome: string }>(sql`
      SELECT id, coalesce(nome_fantasia, razao_social) AS nome FROM tenants WHERE id = ${this.ctx.tenantId}`)
    return {
      empresa: { id: this.ctx.tenantId, nome: empresa?.nome ?? '' },
      chave: { id: chave.id, nome: chave.nome },
      permissoes: Object.keys(this.ctx.membro.permissoes).sort(),
      limites: { por_minuto: LIMITE_DA_CHAVE_POR_MINUTO, por_dia: LIMITE_DA_CHAVE_POR_DIA },
    }
  }

  // ---------------------------------------------------------------------------------------------- empresas

  async listarEmpresas(c: ConsultaDeEmpresasPublica): Promise<Pagina<EmpresaPublica>> {
    const condicoes = condicoesDePagina(sql`e`, c)
    if (c.cnpj) condicoes.push(sql`e.documento = ${normalizarCnpj(c.cnpj)}`)
    if (c.responsavel_id) condicoes.push(sql`e.vendedor_id = ${c.responsavel_id}::uuid`)
    for (const [ref, soStatus] of [
      [c.status, true],
      [c.tag, false],
    ] as const) {
      if (!ref) continue
      condicoes.push(sql`EXISTS (SELECT 1 FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
        JOIN tag_grupos g ON g.id = t.tag_grupo_id
        WHERE et.empresa_id = e.id AND ${condicaoDeTag(sql`t`, ref)}
          ${soStatus ? sql`AND g.chave_sistema = 'status'` : sql``})`)
    }
    return paginar(await lerEmpresas(this.db, condicoes, c.limite + 1), c.limite)
  }

  obterEmpresa(id: string): Promise<EmpresaPublica> {
    return lerEmpresa(this.db, id)
  }

  async obterEmpresaPorDocumento(documento: string): Promise<EmpresaPublica> {
    const id = await this.idDaEmpresaPorDocumento(documento)
    if (!id) throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    return lerEmpresa(this.db, id)
  }

  async criarEmpresa(d: CriarEmpresaPublica): Promise<EmpresaPublica> {
    const vendedorId = await this.responsavel(d.responsavel_id, d.responsavel_email, true)
    const statusTagId = d.status ? await this.tagId(d.status, 'status') : undefined
    const extras: string[] = []
    for (const t of d.tags ?? []) extras.push(await this.tagId(t, 'tags'))
    const criada = await this.empresas.criar(
      {
        tipoDocumento: d.tipo_documento,
        documento: d.documento || undefined,
        razaoSocial: d.razao_social,
        nomeFantasia: d.nome_fantasia ?? null,
        website: d.website ?? null,
        observacoes: d.observacoes ?? null,
        vendedorId,
        ...(statusTagId ? { statusTagId } : {}),
        ...(d.telefones ? { telefones: telefones(d.telefones) } : {}),
        ...(d.endereco ? { endereco: this.endereco(d.endereco) } : {}),
      },
      {
        origemCadastro: 'api',
        // A Receita fica para o worker (a resposta não espera): a empresa nasce "situação não verificada"
        ...(d.tipo_documento === 'cnpj' && d.consultar_receita
          ? { receitaIndisponivel: true }
          : { consulta: 'nenhuma' as const }),
      },
    )
    if (extras.length > 0) {
      await this.empresas.definirTags(criada.id, [...criada.tags.map((t) => t.id), ...extras])
    }
    return lerEmpresa(this.db, criada.id)
  }

  async alterarEmpresa(id: string, d: AlterarEmpresaPublica): Promise<EmpresaPublica> {
    const vendedorId =
      d.responsavel_id !== undefined || d.responsavel_email !== undefined
        ? await this.responsavel(d.responsavel_id, d.responsavel_email, false)
        : undefined
    await this.empresas.alterar(id, {
      ...(d.razao_social !== undefined ? { razaoSocial: d.razao_social } : {}),
      ...(d.nome_fantasia !== undefined ? { nomeFantasia: d.nome_fantasia } : {}),
      ...(d.website !== undefined ? { website: d.website } : {}),
      ...(d.observacoes !== undefined ? { observacoes: d.observacoes } : {}),
      ...(d.telefones ? { telefones: telefones(d.telefones) } : {}),
      ...(d.endereco ? { endereco: this.endereco(d.endereco) } : {}),
      ...(vendedorId ? { vendedorId } : {}),
    })
    return lerEmpresa(this.db, id)
  }

  /** Aplica uma tag (seleção única: substitui a do grupo). Grupo automático (Visitação) não aceita: 400. */
  async aplicarTag(empresaId: string, referencia: string): Promise<EmpresaPublica> {
    const tagId = await this.tagId(referencia, 'tag')
    const atuais = await this.tagsDaEmpresa(empresaId)
    if (!atuais.includes(tagId)) {
      // Grupo de seleção única (Status): a nova substitui a que a empresa tinha no grupo
      const doMesmoGrupo = await this.db.execute<{ id: string }>(sql`
        SELECT t.id FROM tags t JOIN tag_grupos g ON g.id = t.tag_grupo_id
        WHERE g.selecao = 'unica' AND g.id = (SELECT tag_grupo_id FROM tags WHERE id = ${tagId}::uuid)`)
      const substituidas = new Set(doMesmoGrupo.map((t) => t.id))
      await this.empresas.definirTags(empresaId, [
        ...atuais.filter((t) => !substituidas.has(t)),
        tagId,
      ])
    }
    return lerEmpresa(this.db, empresaId)
  }

  async removerTag(empresaId: string, referencia: string): Promise<EmpresaPublica> {
    const tagId = await this.tagId(referencia, 'tag')
    const atuais = await this.tagsDaEmpresa(empresaId)
    if (atuais.includes(tagId)) {
      await this.empresas.definirTags(
        empresaId,
        atuais.filter((t) => t !== tagId),
      )
    }
    return lerEmpresa(this.db, empresaId)
  }

  /**
   * Lote: cada item cria ou atualiza a empresa pelo documento, num SAVEPOINT próprio (um item ruim volta só ele).
   * Item sem documento sempre cria. O resultado diz, item a item, o que aconteceu.
   */
  async loteDeEmpresas(itens: unknown[]): Promise<ResultadoDoLotePublico> {
    const resultado: ResultadoDoLotePublico = {
      resumo: { criados: 0, atualizados: 0, ignorados: 0, erros: 0 },
      itens: [],
    }
    for (const [indice, bruto] of itens.entries()) {
      const lido = criarEmpresaPublicaSchema.safeParse(bruto)
      const documentoBruto =
        typeof bruto === 'object' && bruto !== null && 'documento' in bruto
          ? String(bruto.documento)
          : null
      if (!lido.success) {
        resultado.resumo.erros += 1
        resultado.itens.push({
          indice,
          documento: documentoBruto,
          resultado: 'erro',
          id: null,
          erro: {
            codigo: 'validacao',
            mensagem: lido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
            campos: lido.error.issues.map((i) => i.path.join('.')),
          },
        })
        continue
      }
      const d = lido.data
      await this.db.execute(sql`SAVEPOINT item_do_lote`)
      try {
        const existente = d.documento ? await this.idDaEmpresaPorDocumento(d.documento) : null
        let id: string
        let feito: 'criado' | 'atualizado'
        if (existente) {
          const {
            tipo_documento: _t,
            documento: _d,
            status: _s,
            tags: _g,
            consultar_receita: _c,
            ...campos
          } = d
          await this.alterarEmpresa(existente, campos)
          id = existente
          feito = 'atualizado'
        } else {
          id = (await this.criarEmpresa(d)).id
          feito = 'criado'
        }
        await this.db.execute(sql`RELEASE SAVEPOINT item_do_lote`)
        resultado.resumo[feito === 'criado' ? 'criados' : 'atualizados'] += 1
        resultado.itens.push({
          indice,
          documento: d.documento ?? null,
          resultado: feito,
          id,
          erro: null,
        })
      } catch (erro) {
        await this.db.execute(sql`ROLLBACK TO SAVEPOINT item_do_lote`)
        if (!(erro instanceof ErroApi)) throw erro
        resultado.resumo.erros += 1
        resultado.itens.push({
          indice,
          documento: d.documento ?? null,
          resultado: 'erro',
          id: null,
          erro: {
            codigo: erro.codigo,
            mensagem: erro.message,
            campos: (erro.detalhes ?? []).map((x) => x.campo),
          },
        })
      }
    }
    return resultado
  }

  async idDaEmpresaPorDocumento(documento: string): Promise<string | null> {
    const limpo = documento.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
    const [linha] = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM empresas WHERE documento = ${limpo} AND excluido_em IS NULL LIMIT 1`)
    return linha?.id ?? null
  }

  // ---------------------------------------------------------------------------------------------- contatos

  async listarContatos(c: ConsultaDeContatosPublica): Promise<Pagina<ContatoPublico>> {
    const condicoes = condicoesDePagina(sql`c`, c)
    if (c.email) {
      condicoes.push(sql`EXISTS (SELECT 1 FROM contato_emails ce
        WHERE ce.contato_id = c.id AND ce.email = ${c.email.toLowerCase()})`)
    }
    if (c.telefone) {
      const e164 = normalizarTelefone(c.telefone)?.e164 ?? c.telefone
      condicoes.push(sql`EXISTS (SELECT 1 FROM contato_telefones ct
        WHERE ct.contato_id = c.id AND ct.numero_e164 = ${e164})`)
    }
    if (c.empresa_id) {
      condicoes.push(sql`EXISTS (SELECT 1 FROM empresa_contatos ec
        WHERE ec.contato_id = c.id AND ec.empresa_id = ${c.empresa_id}::uuid AND ec.ativo)`)
    }
    return paginar(await lerContatos(this.db, condicoes, c.limite + 1), c.limite)
  }

  obterContato(id: string): Promise<ContatoPublico> {
    return lerContato(this.db, id)
  }

  async criarContato(d: CriarContatoPublico): Promise<ContatoPublico> {
    const empresaId = await this.empresaPorReferencia(d.empresa_id, d.empresa_cnpj)
    const criado = await this.contatos.criar({
      nome: d.nome,
      observacoes: d.observacoes ?? null,
      ...(d.emails ? { emails: d.emails.map((email, i) => ({ email, principal: i === 0 })) } : {}),
      ...(d.telefones ? { telefones: telefones(d.telefones) } : {}),
      ...(d.aceita_whatsapp !== undefined ? { aceitaWhatsapp: d.aceita_whatsapp } : {}),
      ...(d.aceita_email !== undefined ? { aceitaEmail: d.aceita_email } : {}),
      ...(d.ignorar_duplicado ? { ignorarDuplicado: true } : {}),
      vinculo: {
        empresaId,
        cargo: d.cargo ?? null,
        ...(d.principal !== undefined ? { principal: d.principal } : {}),
      },
    })
    return lerContato(this.db, criado.id)
  }

  async alterarContato(id: string, d: AlterarContatoPublico): Promise<ContatoPublico> {
    await this.contatos.alterar(id, {
      ...(d.nome !== undefined ? { nome: d.nome } : {}),
      ...(d.observacoes !== undefined ? { observacoes: d.observacoes } : {}),
      ...(d.emails ? { emails: d.emails.map((email, i) => ({ email, principal: i === 0 })) } : {}),
      ...(d.telefones ? { telefones: telefones(d.telefones) } : {}),
      ...(d.aceita_whatsapp !== undefined ? { aceitaWhatsapp: d.aceita_whatsapp } : {}),
      ...(d.aceita_email !== undefined ? { aceitaEmail: d.aceita_email } : {}),
      ignorarDuplicado: true,
    })
    return lerContato(this.db, id)
  }

  // -------------------------------------------------------------------------------------------- atividades

  async listarAtividades(c: ConsultaDeAtividadesPublica): Promise<Pagina<AtividadePublica>> {
    const condicoes = condicoesDePagina(sql`a`, c)
    if (c.empresa_id) condicoes.push(sql`a.empresa_id = ${c.empresa_id}::uuid`)
    if (c.responsavel_id) condicoes.push(sql`a.responsavel_id = ${c.responsavel_id}::uuid`)
    if (c.situacao === 'pendente') condicoes.push(sql`a.situacao IN ('pendente', 'em_execucao')`)
    else if (c.situacao) condicoes.push(sql`a.situacao = ${c.situacao}::situacao_atividade`)
    if (c.id_externo) condicoes.push(sql`a.id_externo = ${c.id_externo}`)
    return paginar(await lerAtividades(this.db, condicoes, c.limite + 1), c.limite)
  }

  obterAtividade(id: string): Promise<AtividadePublica> {
    return lerAtividade(this.db, id)
  }

  /** Com `id_externo` já usado, devolve a atividade existente (`criada: false`) sem criar outra. */
  async criarAtividade(
    d: CriarAtividadePublica,
  ): Promise<{ atividade: AtividadePublica; criada: boolean }> {
    if (d.id_externo) {
      const [existente] = await this.db.execute<{ id: string }>(sql`
        SELECT id FROM atividades
        WHERE origem = 'api' AND id_externo = ${d.id_externo} AND excluido_em IS NULL LIMIT 1`)
      if (existente) return { atividade: await lerAtividade(this.db, existente.id), criada: false }
    }
    const empresaId =
      d.empresa_id !== undefined || d.empresa_cnpj !== undefined
        ? await this.empresaPorReferencia(d.empresa_id, d.empresa_cnpj)
        : null
    const tipoAtividadeId = await this.tipoDeAtividade(d.tipo)
    const responsavelId =
      d.responsavel_id !== undefined || d.responsavel_email !== undefined
        ? await this.responsavel(d.responsavel_id, d.responsavel_email, false)
        : (this.chave().responsavelPadraoId ??
          (empresaId ? await this.vendedorDa(empresaId) : null))
    if (!responsavelId) {
      throw invalido(
        'responsavel_id',
        'responsavel_obrigatorio',
        'Informe o responsável da atividade.',
      )
    }
    const criada = await this.atividades.criar(
      {
        tipoAtividadeId,
        titulo: d.titulo,
        empresaId,
        contatoId: d.contato_id ?? null,
        oportunidadeId: d.oportunidade_id ?? null,
        responsavelId,
        dataInicio: d.inicio,
        dataFim: d.fim ?? null,
        diaInteiro: d.dia_inteiro,
        situacao: d.situacao,
        resultado: d.resultado ?? null,
        importante: false,
        urgente: false,
        observacoes: d.observacoes ?? null,
      },
      { origem: 'api', idExterno: d.id_externo ?? null },
    )
    return { atividade: await lerAtividade(this.db, criada.id), criada: true }
  }

  async concluirAtividade(id: string, d: ConcluirAtividadePublica): Promise<AtividadePublica> {
    await this.atividades.concluir(id, {
      resultado: d.resultado,
      ...(d.realizada_em ? { realizadaEm: d.realizada_em } : {}),
    })
    return lerAtividade(this.db, id)
  }

  // ----------------------------------------------------------------------------------------- oportunidades

  async listarOportunidades(
    c: ConsultaDeOportunidadesPublica,
  ): Promise<Pagina<OportunidadePublica>> {
    const condicoes = condicoesDePagina(sql`o`, c)
    if (c.empresa_id) condicoes.push(sql`o.empresa_id = ${c.empresa_id}::uuid`)
    if (c.funil_id) condicoes.push(sql`o.funil_id = ${c.funil_id}::uuid`)
    if (c.fase_id) condicoes.push(sql`o.fase_id = ${c.fase_id}::uuid`)
    if (c.status) condicoes.push(sql`o.status::text = ${c.status}`)
    if (c.responsavel_id) condicoes.push(sql`o.responsavel_id = ${c.responsavel_id}::uuid`)
    return paginar(await lerOportunidades(this.db, condicoes, c.limite + 1), c.limite)
  }

  obterOportunidade(id: string): Promise<OportunidadePublica> {
    return lerOportunidade(this.db, id)
  }

  async criarOportunidade(d: CriarOportunidadePublica): Promise<OportunidadePublica> {
    const empresaId = await this.empresaPorReferencia(d.empresa_id, d.empresa_cnpj)
    const responsavelId =
      d.responsavel_id !== undefined || d.responsavel_email !== undefined
        ? await this.responsavel(d.responsavel_id, d.responsavel_email, false)
        : undefined
    const criada = await this.oportunidades.criar({
      titulo: d.titulo,
      empresaId,
      contatoId: d.contato_id ?? null,
      origemId: d.origem_id ?? null,
      ...(d.funil_id ? { funilId: d.funil_id } : {}),
      ...(d.fase_id ? { faseId: d.fase_id } : {}),
      ...(responsavelId ? { responsavelId } : {}),
      valorUnico: d.valor_unico ?? 0,
      valorMensal: d.valor_mensal ?? 0,
      ...(d.meses !== undefined ? { meses: d.meses } : {}),
      dataPrevistaFechamento: d.previsao_fechamento ?? null,
      observacoes: d.observacoes ?? null,
    })
    return lerOportunidade(this.db, criada.id)
  }

  async alterarOportunidade(
    id: string,
    d: AlterarOportunidadePublica,
  ): Promise<OportunidadePublica> {
    const { fase_id: faseId, ...resto } = d
    if (Object.keys(resto).length > 0) {
      await this.oportunidades.alterar(id, {
        ...(resto.titulo !== undefined ? { titulo: resto.titulo } : {}),
        ...(resto.responsavel_id !== undefined ? { responsavelId: resto.responsavel_id } : {}),
        ...(resto.valor_unico !== undefined ? { valorUnico: resto.valor_unico } : {}),
        ...(resto.valor_mensal !== undefined ? { valorMensal: resto.valor_mensal } : {}),
        ...(resto.meses !== undefined ? { meses: resto.meses } : {}),
        ...(resto.previsao_fechamento !== undefined
          ? { dataPrevistaFechamento: resto.previsao_fechamento }
          : {}),
        ...(resto.observacoes !== undefined ? { observacoes: resto.observacoes } : {}),
      })
    }
    if (faseId) await this.oportunidades.mover(id, faseId)
    return lerOportunidade(this.db, id)
  }

  // --------------------------------------------------------------------------------------------- cadastros

  async tags() {
    const linhas = await this.db.execute<Record<string, unknown>>(sql`
      SELECT t.id, t.nome, t.chave_sistema, t.ativo, g.automatico AS automatica,
        json_build_object('id', g.id, 'nome', g.nome, 'chave_sistema', g.chave_sistema) AS grupo
      FROM tags t JOIN tag_grupos g ON g.id = t.tag_grupo_id
      WHERE t.excluido_em IS NULL AND g.excluido_em IS NULL AND g.aplica_a = 'empresa'
      ORDER BY g.ordem, g.nome, t.ordem, t.nome`)
    return { dados: [...linhas] }
  }

  async cadastro(tabela: 'tipos_atividade' | 'origens') {
    const linhas = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, nome, chave_sistema, ativo FROM ${sql.raw(tabela)}
      WHERE excluido_em IS NULL ORDER BY ordem, nome`)
    return { dados: [...linhas] }
  }

  async funis() {
    const linhas = await this.db.execute<Record<string, unknown>>(sql`
      SELECT f.id, f.nome, f.padrao, f.ativo,
        coalesce((SELECT json_agg(json_build_object('id', fa.id, 'nome', fa.nome, 'ordem', fa.ordem,
          'ativa', fa.ativo) ORDER BY fa.ordem) FROM funil_fases fa
          WHERE fa.funil_id = f.id AND fa.excluido_em IS NULL), '[]'::json) AS fases
      FROM funis f WHERE f.excluido_em IS NULL ORDER BY f.ordem, f.nome`)
    return { dados: [...linhas] }
  }

  /** A equipe (só pessoas: o membro de integração não aparece), para achar o responsável. */
  async membros() {
    const linhas = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, nome, email::text AS email, ativo FROM membros
      WHERE tipo = 'pessoa' AND excluido_em IS NULL ORDER BY lower(nome)`)
    return { dados: [...linhas] }
  }

  // ------------------------------------------------------------------------------------------------- apoio

  private chave() {
    const chave = this.ctx.chaveApi
    if (!chave) throw new Error('rota da API pública sem chave no contexto')
    return chave
  }

  /**
   * O responsável pelo id ou pelo e-mail (membro ativo da equipe). Sem nenhum dos dois e `usarPadrao`, o
   * responsável padrão da chave; sem ele também, 422 `responsavel_obrigatorio`.
   */
  private async responsavel(
    id: string | undefined,
    email: string | undefined,
    usarPadrao: boolean,
  ): Promise<string> {
    if (id === undefined && email === undefined) {
      const padrao = usarPadrao ? this.chave().responsavelPadraoId : null
      if (padrao) return padrao
      throw invalido(
        'responsavel_id',
        'responsavel_obrigatorio',
        'Informe responsavel_id ou responsavel_email (ou defina o responsável padrão da chave).',
      )
    }
    const condicao: SQL = id !== undefined ? sql`id = ${id}::uuid` : sql`email = ${email ?? ''}`
    const [membro] = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM membros WHERE ${condicao} AND tipo = 'pessoa' AND ativo AND excluido_em IS NULL LIMIT 1`)
    if (!membro) {
      throw invalido(
        id !== undefined ? 'responsavel_id' : 'responsavel_email',
        'responsavel_invalido',
        'O responsável precisa ser um membro ativo da equipe.',
      )
    }
    return membro.id
  }

  /** A tag (ativa) pela chave do sistema ou pelo id; `campo = 'status'` exige que seja do grupo Status. */
  private async tagId(referencia: string, campo: string): Promise<string> {
    const [tag] = await this.db.execute<{ id: string; grupo: string | null }>(sql`
      SELECT t.id, g.chave_sistema AS grupo FROM tags t JOIN tag_grupos g ON g.id = t.tag_grupo_id
      WHERE ${condicaoDeTag(sql`t`, referencia)} AND t.excluido_em IS NULL AND t.ativo
        AND g.aplica_a = 'empresa' LIMIT 1`)
    if (!tag) throw invalido(campo, 'tag_invalida', `Tag não encontrada ou inativa: ${referencia}`)
    if (campo === 'status' && tag.grupo !== 'status') {
      throw invalido(campo, 'tag_invalida', `A tag ${referencia} não é do grupo Status.`)
    }
    return tag.id
  }

  private async tagsDaEmpresa(empresaId: string): Promise<string[]> {
    await lerEmpresa(this.db, empresaId) // 404 antes de qualquer coisa
    const linhas = await this.db.execute<{ tag_id: string }>(sql`
      SELECT tag_id FROM empresa_tags WHERE empresa_id = ${empresaId}::uuid`)
    return linhas.map((l) => l.tag_id)
  }

  private async tipoDeAtividade(referencia: string): Promise<string> {
    const [tipo] = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM tipos_atividade
      WHERE ${/^[0-9a-f-]{36}$/i.test(referencia) ? sql`id = ${referencia}::uuid` : sql`chave_sistema = ${referencia}`}
        AND excluido_em IS NULL AND ativo LIMIT 1`)
    if (!tipo)
      throw invalido('tipo', 'tipo_invalido', `Tipo de atividade não encontrado: ${referencia}`)
    return tipo.id
  }

  private async empresaPorReferencia(
    id: string | undefined,
    cnpj: string | undefined,
  ): Promise<string> {
    if (id) {
      await lerEmpresa(this.db, id)
      return id
    }
    const achada = cnpj ? await this.idDaEmpresaPorDocumento(cnpj) : null
    if (!achada)
      throw invalido('empresa_cnpj', 'empresa_nao_encontrada', 'Empresa não encontrada pelo CNPJ.')
    return achada
  }

  private async vendedorDa(empresaId: string): Promise<string | null> {
    const [e] = await this.db.execute<{ vendedor_id: string }>(sql`
      SELECT vendedor_id FROM empresas WHERE id = ${empresaId}::uuid`)
    return e?.vendedor_id ?? null
  }

  private endereco(e: NonNullable<CriarEmpresaPublica['endereco']>) {
    return {
      cep: e.cep ?? null,
      logradouro: e.logradouro ?? null,
      numero: e.numero ?? null,
      complemento: e.complemento ?? null,
      bairro: e.bairro ?? null,
      municipioCodigo: e.municipio_ibge ?? null,
    }
  }
}
