import { and, eq, inArray, isNull, ne, schema, sql } from '@leadtogo/db'
import {
  type AlterarEmpresaCarteira,
  type CnaesEntrada,
  type CriarEmpresaCarteira,
  type DadosDaReceita,
  type EmpresaCarteira,
  matrizOuFilialDoCnpj,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { diferencas } from '../cadastros/cadastros.base.js'
import { ErroApi } from '../http/erro-api.js'
import { sqlstateDe } from '../http/sqlstate.js'
import { type ConsultaDeCnpj, ReceitaService } from '../receita/receita.service.js'
import {
  catalogoDeTags,
  conferirTagsDaEmpresa,
  gravarDiferencaDeTags,
  tagsAtuaisDaEmpresa,
} from './empresa-tags.js'
import { lerEmpresa } from './empresa-leitura.js'
import {
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
  podeExcluir,
  podeTransferir,
  podeVer,
} from './regras-de-carteira.js'
import { agendarVerificacaoDaSituacao } from './situacao-evento.js'
import { normalizarTelefonesDaEmpresa, type TelefoneParaGravar } from './telefones.js'

const {
  empresas,
  empresaTelefones,
  empresaCnaes,
  empresaSocios,
  membros,
  verticais,
  municipios,
  paises,
  portes,
  cnaes,
  qualificacoesSocio,
  tags,
} = schema

type Transacao = ReturnType<ContextoTenantService['db']>

const naoEncontrada = () => new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
const negado = (mensagem: string) => new ErroApi('acesso_negado', mensagem, 403)
const invalido = (campo: string, codigo: string, mensagem: string) =>
  new ErroApi(codigo, mensagem, 400, [{ campo, mensagem }])

interface CnaeParaGravar {
  codigo: number
  principal: boolean
}

/** Campos do endereço, na coluna e no formato que o banco usa. */
const ENDERECO_NULO = {
  cep: null,
  tipoLogradouro: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  municipioCodigo: null,
  paisCodigo: null,
} as const

/** Empresas da carteira (cliente, prospect, lead): cadastro, ficha, edição e exclusão. */
@Injectable()
export class EmpresasDaCarteiraService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly receita: ReceitaService,
  ) {}

  async detalhar(id: string): Promise<EmpresaCarteira> {
    const escopo = await escopoDaCarteira(this.ctx)
    const empresa = await lerEmpresa(this.ctx.db(), escopo, id)
    if (!empresa) throw naoEncontrada()
    return empresa
  }

  async criar(dados: CriarEmpresaCarteira): Promise<EmpresaCarteira> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const vendedorId = dados.vendedorId ?? escopo.membroId
    if (vendedorId !== escopo.membroId && !podeTransferir(escopo)) {
      throw negado('Vendedor só cadastra empresas na própria carteira.')
    }
    await this.exigirVendedorAtivo(db, vendedorId)
    if (dados.verticalId) await this.exigirVertical(db, dados.verticalId)
    await this.conferirCodigos(db, dados)
    const status = await this.resolverStatus(db, dados.statusTagId)
    const telefones = normalizarTelefonesDaEmpresa(dados.telefones ?? [])
    const documento = dados.documento ?? null
    if (documento) await this.exigirDocumentoNovo(db, escopo, documento)

    // CNPJ: a situação na Receita decide se o cadastro vale (bloqueio) e se fica com o selo
    let consulta: ConsultaDeCnpj | null = null
    let naoVerificada = false
    if (dados.tipoDocumento === 'cnpj' && documento) {
      try {
        consulta = await this.receita.consultar(documento)
      } catch (erro) {
        if (erro instanceof ErroApi && erro.codigo === 'receita_indisponivel') naoVerificada = true
        else throw erro
      }
      if (consulta) {
        const { situacao } = consulta.dados
        if (!situacao.ativa && escopo.bloquearNaoAtiva) {
          const motivo = situacao.motivo ? ` (${situacao.motivo})` : ''
          throw new ErroApi(
            'empresa_nao_ativa',
            `A empresa está ${situacao.descricao}${motivo} na Receita e não pode ser cadastrada.`,
            409,
            undefined,
            { situacao: situacao.descricao, motivo: situacao.motivo },
          )
        }
        // Cache vencido (as duas fontes fora do ar): a situação pode ter mudado
        if (consulta.expirada) naoVerificada = true
      }
    }

    const cnaesParaGravar = dados.cnaes
      ? await this.resolverCnaes(db, dados.cnaes, consulta?.dados ?? null)
      : []
    const endereco = { ...ENDERECO_NULO, ...(dados.endereco ?? {}) }
    const matrizFilial =
      dados.tipoDocumento === 'cnpj' && documento ? matrizOuFilialDoCnpj(documento) : null

    let id: string
    try {
      const [criada] = await db
        .insert(empresas)
        .values({
          tenantId,
          tipoDocumento: dados.tipoDocumento,
          documento,
          matrizFilial,
          razaoSocial: dados.razaoSocial,
          nomeFantasia: dados.nomeFantasia ?? null,
          mei: dados.mei ?? false,
          dataInicioAtividades: dados.dataInicioAtividades ?? null,
          porteCodigo: dados.porteCodigo ?? null,
          regimeTributario: dados.regimeTributario ?? 'nao_informado',
          vendedorId,
          verticalId: dados.verticalId ?? null,
          website: dados.website ?? null,
          observacoes: dados.observacoes ?? null,
          ...endereco,
          origemCadastro: consulta ? 'receita' : 'manual',
          receitaAtualizadoEm: consulta && !consulta.expirada ? consulta.consultadoEm : null,
          situacaoNaoVerificada: naoVerificada,
          criadoPor: escopo.membroId,
          atualizadoPor: escopo.membroId,
        })
        .returning({ id: empresas.id })
      if (!criada) throw new Error('INSERT de empresa sem retorno')
      id = criada.id
    } catch (erro) {
      // Duas pessoas cadastrando o mesmo documento juntas: a segunda perde na unicidade
      if (sqlstateDe(erro) === '23505' && documento) {
        await this.exigirDocumentoNovo(db, escopo, documento)
      }
      throw erro
    }

    await this.gravarTelefones(db, tenantId, id, telefones)
    await this.gravarCnaes(db, tenantId, id, cnaesParaGravar)
    if (consulta) await this.gravarSocios(db, tenantId, id, consulta.dados)
    await gravarDiferencaDeTags(db, tenantId, id, new Set(), new Set([status]), escopo.membroId)
    if (matrizFilial && documento) await this.ligarMatrizEFiliais(db, id, matrizFilial, documento)
    if (naoVerificada) {
      // Receita fora do ar: o worker reconsulta de hora em hora (até 24 vezes) e avisa o vendedor
      await agendarVerificacaoDaSituacao(db, tenantId, id, 1, 0)
    }

    await this.auditoria.registrar({
      entidade: 'empresa',
      entidadeId: id,
      acao: 'criar',
      alteracoes: {
        nome: dados.nomeFantasia ?? dados.razaoSocial,
        tipoDocumento: dados.tipoDocumento,
        documento,
        vendedorId,
        origemCadastro: consulta ? 'receita' : 'manual',
        situacaoNaoVerificada: naoVerificada,
      },
    })
    return this.detalhar(id)
  }

  async alterar(id: string, dados: AlterarEmpresaCarteira): Promise<EmpresaCarteira> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregar(db, escopo, id)
    if (!podeEditar(escopo, atual.vendedorId)) {
      throw negado('Você só edita empresas da sua carteira.')
    }
    if (dados.vendedorId !== undefined && dados.vendedorId !== atual.vendedorId) {
      if (!podeTransferir(escopo)) throw negado('Só gestor e administrador passam a carteira.')
      await this.exigirVendedorAtivo(db, dados.vendedorId)
    }
    if (dados.verticalId) await this.exigirVertical(db, dados.verticalId)
    await this.conferirCodigos(db, dados)

    // O que muda na linha da empresa (endereço, se vier, substitui o todo)
    const { endereco, telefones: telefonesNovos, cnaes: cnaesNovos, ...escalares } = dados
    const novo: Record<string, unknown> = {
      ...escalares,
      ...(endereco ? { ...ENDERECO_NULO, ...endereco } : {}),
    }
    const mudancas = diferencas(atual, novo)

    const telefones = telefonesNovos ? normalizarTelefonesDaEmpresa(telefonesNovos) : null
    const telefonesAtuais = await db
      .select()
      .from(empresaTelefones)
      .where(eq(empresaTelefones.empresaId, id))
    const antesDosTelefones = telefonesAtuais.map(assinaturaDoTelefone).sort()
    const depoisDosTelefones = telefones?.map(assinaturaDoTelefone).sort()
    const mudouTelefones =
      depoisDosTelefones !== undefined &&
      JSON.stringify(antesDosTelefones) !== JSON.stringify(depoisDosTelefones)

    const cnaesParaGravar = cnaesNovos ? await this.resolverCnaes(db, cnaesNovos, null) : null
    const cnaesAtuais = await db
      .select({ codigo: empresaCnaes.cnaeCodigo, principal: empresaCnaes.principal })
      .from(empresaCnaes)
      .where(eq(empresaCnaes.empresaId, id))
    const assinaturaCnaes = (l: CnaeParaGravar[]) =>
      JSON.stringify(l.map((c) => `${c.codigo}${c.principal ? '*' : ''}`).sort())
    const mudouCnaes =
      cnaesParaGravar !== null && assinaturaCnaes(cnaesAtuais) !== assinaturaCnaes(cnaesParaGravar)

    if (Object.keys(mudancas).length === 0 && !mudouTelefones && !mudouCnaes) {
      return this.detalhar(id)
    }

    await db
      .update(empresas)
      .set({
        ...(dados.razaoSocial !== undefined && { razaoSocial: dados.razaoSocial }),
        ...(dados.nomeFantasia !== undefined && { nomeFantasia: dados.nomeFantasia }),
        ...(dados.mei !== undefined && { mei: dados.mei }),
        ...(dados.dataInicioAtividades !== undefined && {
          dataInicioAtividades: dados.dataInicioAtividades,
        }),
        ...(dados.porteCodigo !== undefined && { porteCodigo: dados.porteCodigo }),
        ...(dados.regimeTributario !== undefined && { regimeTributario: dados.regimeTributario }),
        ...(dados.vendedorId !== undefined && { vendedorId: dados.vendedorId }),
        ...(dados.verticalId !== undefined && { verticalId: dados.verticalId }),
        ...(dados.website !== undefined && { website: dados.website }),
        ...(dados.observacoes !== undefined && { observacoes: dados.observacoes }),
        ...(endereco && { ...ENDERECO_NULO, ...endereco }),
        atualizadoPor: escopo.membroId,
      })
      .where(eq(empresas.id, id))
    if (mudouTelefones && telefones) await this.gravarTelefones(db, tenantId, id, telefones)
    if (mudouCnaes && cnaesParaGravar) await this.gravarCnaes(db, tenantId, id, cnaesParaGravar)

    const alteracoes: Record<string, unknown> = { ...mudancas }
    if (mudouTelefones) {
      alteracoes['telefones'] = {
        de: telefonesAtuais.map((t) => t.numeroE164),
        para: telefones?.map((t) => t.numeroE164),
      }
    }
    if (mudouCnaes) {
      alteracoes['cnaes'] = {
        de: cnaesAtuais.map((c) => c.codigo),
        para: cnaesParaGravar?.map((c) => c.codigo),
      }
    }
    await this.auditoria.registrar({
      entidade: 'empresa',
      entidadeId: id,
      acao: 'alterar',
      alteracoes,
    })
    return this.detalhar(id)
  }

  /**
   * Define as tags da empresa nos grupos manuais (Status, Interesse...). Respeita seleção única e
   * grupo obrigatório; as tags automáticas (Visitação) não mudam. Cada tag que entra ou sai vai para o
   * histórico de tags (conversão Lead → Cliente) e para a auditoria.
   */
  async definirTags(id: string, tagIds: string[]): Promise<EmpresaCarteira> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregar(db, escopo, id)
    if (!podeEditar(escopo, atual.vendedorId)) {
      throw negado('Você só edita empresas da sua carteira.')
    }
    const catalogo = await catalogoDeTags(db)
    const atuais = await tagsAtuaisDaEmpresa(db, id)
    const finais = conferirTagsDaEmpresa(catalogo, atuais, tagIds)
    const { adicionadas, removidas } = await gravarDiferencaDeTags(
      db,
      this.ctx.tenantId,
      id,
      atuais,
      finais,
      escopo.membroId,
    )
    if (adicionadas.length > 0 || removidas.length > 0) {
      const nomes = (ids: string[]) => ids.map((t) => catalogo.get(t)?.nome ?? t)
      await this.auditoria.registrar({
        entidade: 'empresa',
        entidadeId: id,
        acao: 'alterar_tags',
        alteracoes: { adicionadas: nomes(adicionadas), removidas: nomes(removidas) },
      })
    }
    return this.detalhar(id)
  }

  /** Exclusão lógica (sem lixeira no MVP). Só admin e gestor. */
  async excluir(id: string): Promise<void> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregar(db, escopo, id)
    if (!podeExcluir(escopo)) throw negado('Só gestor e administrador excluem empresas.')
    await db
      .update(empresas)
      .set({ excluidoEm: new Date(), atualizadoPor: escopo.membroId })
      .where(eq(empresas.id, id))
    // As filiais deixam de apontar para uma matriz que saiu da carteira
    if (atual.matrizFilial === 'matriz') {
      await db.update(empresas).set({ matrizId: null }).where(eq(empresas.matrizId, id))
    }
    await this.auditoria.registrar({
      entidade: 'empresa',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: atual.nomeFantasia ?? atual.razaoSocial, documento: atual.documento },
    })
  }

  // ---- apoio ----

  /** A empresa que o usuário vê, ou 404 (não revela as que ele não vê). */
  private async carregar(db: Transacao, escopo: EscopoDaCarteira, id: string) {
    const [linha] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.id, id), isNull(empresas.excluidoEm)))
    if (!linha || !podeVer(escopo, linha.vendedorId)) throw naoEncontrada()
    return linha
  }

  private async exigirVendedorAtivo(db: Transacao, vendedorId: string): Promise<void> {
    const [m] = await db
      .select({ id: membros.id })
      .from(membros)
      .where(and(eq(membros.id, vendedorId), eq(membros.ativo, true), isNull(membros.excluidoEm)))
    if (!m) throw invalido('vendedorId', 'vendedor_invalido', 'Escolha um membro ativo da equipe.')
  }

  private async exigirVertical(db: Transacao, verticalId: string): Promise<void> {
    const [v] = await db
      .select({ id: verticais.id })
      .from(verticais)
      .where(
        and(eq(verticais.id, verticalId), eq(verticais.ativo, true), isNull(verticais.excluidoEm)),
      )
    if (!v) throw invalido('verticalId', 'vertical_invalida', 'Vertical inexistente ou inativa.')
  }

  /** Município, país e porte têm de existir nas tabelas de referência (senão o banco recusaria com 500). */
  private async conferirCodigos(
    db: Transacao,
    dados: Pick<AlterarEmpresaCarteira, 'endereco' | 'porteCodigo'>,
  ): Promise<void> {
    const municipio = dados.endereco?.municipioCodigo
    if (municipio) {
      const [m] = await db
        .select({ c: municipios.codigoIbge })
        .from(municipios)
        .where(eq(municipios.codigoIbge, municipio))
      if (!m)
        throw invalido('endereco.municipioCodigo', 'municipio_invalido', 'Município desconhecido.')
    }
    const pais = dados.endereco?.paisCodigo
    if (pais) {
      const [p] = await db.select({ c: paises.codigo }).from(paises).where(eq(paises.codigo, pais))
      if (!p) throw invalido('endereco.paisCodigo', 'pais_invalido', 'País desconhecido.')
    }
    if (dados.porteCodigo !== undefined && dados.porteCodigo !== null) {
      const [p] = await db
        .select({ c: portes.codigo })
        .from(portes)
        .where(eq(portes.codigo, dados.porteCodigo))
      if (!p) throw invalido('porteCodigo', 'porte_invalido', 'Porte desconhecido.')
    }
  }

  /**
   * O documento já está na carteira? 409 com a empresa existente ("Abrir ficha"); o nome só vai
   * junto se o usuário pode ver aquela empresa (o vendedor não descobre a carteira dos outros).
   */
  private async exigirDocumentoNovo(
    db: Transacao,
    escopo: EscopoDaCarteira,
    documento: string,
  ): Promise<void> {
    const [existente] = await db
      .select({
        id: empresas.id,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        vendedorId: empresas.vendedorId,
      })
      .from(empresas)
      .where(and(eq(empresas.documento, documento), isNull(empresas.excluidoEm)))
    if (!existente) return
    const visivel = podeVer(escopo, existente.vendedorId)
    throw new ErroApi(
      'empresa_ja_cadastrada',
      visivel
        ? 'Este documento já está cadastrado na carteira.'
        : 'Este documento já está cadastrado na carteira de outro vendedor.',
      409,
      undefined,
      {
        existente: visivel
          ? { visivel, id: existente.id, nome: existente.nomeFantasia ?? existente.razaoSocial }
          : { visivel },
      },
    )
  }

  /** A tag do grupo Status (a escolhida ou Lead). O grupo Status é o da tag de sistema `lead`. */
  private async resolverStatus(db: Transacao, escolhida?: string): Promise<string> {
    const [lead] = await db
      .select({ id: tags.id, grupoId: tags.tagGrupoId })
      .from(tags)
      .where(and(eq(tags.chaveSistema, 'lead'), isNull(tags.excluidoEm)))
    if (!lead) {
      throw new ErroApi('status_indisponivel', 'O grupo Status não tem a tag Lead.', 409)
    }
    if (!escolhida || escolhida === lead.id) return lead.id
    const [t] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.id, escolhida),
          eq(tags.tagGrupoId, lead.grupoId),
          eq(tags.ativo, true),
          isNull(tags.excluidoEm),
        ),
      )
    if (!t) throw invalido('statusTagId', 'status_invalido', 'Escolha um Status ativo.')
    return t.id
  }

  /**
   * CNAEs que o usuário informou. Os que não estão na tabela de referência entram só se a Receita os
   * trouxe nesta consulta (a descrição vem dela, nunca do cliente), pela função `app_registrar_cnae`.
   */
  private async resolverCnaes(
    db: Transacao,
    entrada: CnaesEntrada,
    daReceita: DadosDaReceita | null,
  ): Promise<CnaeParaGravar[]> {
    const codigos = [
      ...new Set([entrada.principal, ...entrada.secundarios].filter((c) => c !== null)),
    ]
    if (codigos.length === 0) return []
    const conhecidos = new Set(
      (
        await db.select({ codigo: cnaes.codigo }).from(cnaes).where(inArray(cnaes.codigo, codigos))
      ).map((c) => c.codigo),
    )
    for (const codigo of codigos.filter((c) => !conhecidos.has(c))) {
      const encontrado = [daReceita?.cnaes.principal, ...(daReceita?.cnaes.secundarios ?? [])].find(
        (c) => c?.codigo === codigo,
      )
      if (!encontrado) {
        throw invalido('cnaes', 'cnae_desconhecido', `CNAE ${codigo} desconhecido.`)
      }
      try {
        await db.execute(sql`SELECT app_registrar_cnae(${codigo}, ${encontrado.descricao})`)
      } catch (erro) {
        if (sqlstateDe(erro) === '22023') {
          throw invalido('cnaes', 'cnae_desconhecido', `CNAE ${codigo} desconhecido.`)
        }
        throw erro
      }
    }
    return codigos.map((codigo) => ({ codigo, principal: codigo === entrada.principal }))
  }

  private async gravarTelefones(
    db: Transacao,
    tenantId: string,
    empresaId: string,
    telefones: TelefoneParaGravar[],
  ): Promise<void> {
    await db.delete(empresaTelefones).where(eq(empresaTelefones.empresaId, empresaId))
    if (telefones.length === 0) return
    await db.insert(empresaTelefones).values(
      telefones.map((t) => ({
        tenantId,
        empresaId,
        numero: t.numero,
        numeroE164: t.numeroE164,
        tipo: t.tipo,
        descricao: t.descricao,
        principal: t.principal,
      })),
    )
  }

  private async gravarCnaes(
    db: Transacao,
    tenantId: string,
    empresaId: string,
    lista: CnaeParaGravar[],
  ): Promise<void> {
    await db.delete(empresaCnaes).where(eq(empresaCnaes.empresaId, empresaId))
    if (lista.length === 0) return
    await db
      .insert(empresaCnaes)
      .values(
        lista.map((c) => ({ tenantId, empresaId, cnaeCodigo: c.codigo, principal: c.principal })),
      )
  }

  /** Sócios vêm sempre da Receita (nome e qualificação; nunca o CPF). */
  private async gravarSocios(
    db: Transacao,
    tenantId: string,
    empresaId: string,
    dados: DadosDaReceita,
  ): Promise<void> {
    await db.delete(empresaSocios).where(eq(empresaSocios.empresaId, empresaId))
    if (dados.socios.length === 0) return
    const codigos = dados.socios.flatMap((s) =>
      s.qualificacaoCodigo === null ? [] : [s.qualificacaoCodigo],
    )
    const conhecidos = new Set(
      codigos.length === 0
        ? []
        : (
            await db
              .select({ c: qualificacoesSocio.codigo })
              .from(qualificacoesSocio)
              .where(inArray(qualificacoesSocio.codigo, codigos))
          ).map((q) => q.c),
    )
    await db.insert(empresaSocios).values(
      dados.socios.map((s) => ({
        tenantId,
        empresaId,
        nome: s.nome,
        qualificacaoCodigo:
          s.qualificacaoCodigo !== null && conhecidos.has(s.qualificacaoCodigo)
            ? s.qualificacaoCodigo
            : null,
        qualificacaoTexto: s.qualificacaoTexto,
        origem: 'receita' as const,
      })),
    )
  }

  /**
   * Matriz/filial pela raiz do CNPJ, na mesma transação do salvamento: a filial liga à matriz do
   * tenant, e a matriz recém-cadastrada liga as filiais que já estavam soltas.
   */
  private async ligarMatrizEFiliais(
    db: Transacao,
    id: string,
    matrizFilial: 'matriz' | 'filial',
    documento: string,
  ): Promise<void> {
    const raiz = documento.slice(0, 8)
    if (matrizFilial === 'filial') {
      const [matriz] = await db
        .select({ id: empresas.id })
        .from(empresas)
        .where(
          and(
            eq(empresas.cnpjRaiz, raiz),
            eq(empresas.matrizFilial, 'matriz'),
            isNull(empresas.excluidoEm),
            ne(empresas.id, id),
          ),
        )
      if (matriz) await db.update(empresas).set({ matrizId: matriz.id }).where(eq(empresas.id, id))
    } else {
      await db
        .update(empresas)
        .set({ matrizId: id })
        .where(
          and(
            eq(empresas.cnpjRaiz, raiz),
            eq(empresas.matrizFilial, 'filial'),
            isNull(empresas.excluidoEm),
            isNull(empresas.matrizId),
          ),
        )
    }
  }
}

const assinaturaDoTelefone = (t: {
  numeroE164: string
  tipo: string
  descricao: string | null
  principal: boolean
}): string => `${t.numeroE164}|${t.tipo}|${t.descricao ?? ''}|${t.principal ? 1 : 0}`
