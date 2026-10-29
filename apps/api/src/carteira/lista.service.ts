import { and, asc, desc, eq, inArray, isNull, or, schema, sql } from '@leadtogo/db'
import type {
  ConsultaDaLista,
  ContagensDaLista,
  ItemDaLista,
  ListaDeEmpresas,
  OpcoesDaLista,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { buscaDaEmpresa, semAcento } from './busca-texto.js'
import {
  condicaoDeVisibilidade,
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
} from './regras-de-carteira.js'

const {
  empresas,
  empresaTags,
  empresaTelefones,
  membros,
  municipios,
  tagGrupos,
  tags,
  tenantConfiguracoes,
} = schema

/** O Status da empresa é Cliente ou Prospect (pelas chaves do sistema, que sobrevivem a renomear). */
const statusClienteOuProspect = sql`EXISTS (
  SELECT 1 FROM ${empresaTags} et JOIN ${tags} t ON t.id = et.tag_id
  WHERE et.empresa_id = ${empresas.id} AND t.chave_sistema IN ('cliente', 'prospect'))`

const temATag = (tagId: string) => sql`EXISTS (
  SELECT 1 FROM ${empresaTags} et WHERE et.empresa_id = ${empresas.id} AND et.tag_id = ${tagId})`

const haDias = (dias: number) => sql`now() - ${`${dias} days`}::interval`

/** Lista da carteira: busca, filtros, chips com contagem, opções e paginação. */
@Injectable()
export class ListaDeEmpresasService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async listar(consulta: ConsultaDaLista): Promise<ListaDeEmpresas> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const onde = this.condicoes(escopo, consulta)

    const [contagem] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(empresas)
      .leftJoin(municipios, eq(municipios.codigoIbge, empresas.municipioCodigo))
      .where(onde)

    const linhas = await db
      .select({
        id: empresas.id,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        tipoDocumento: empresas.tipoDocumento,
        documento: empresas.documento,
        matrizFilial: empresas.matrizFilial,
        vendedorId: empresas.vendedorId,
        vendedorNome: membros.nome,
        cidade: municipios.nome,
        uf: municipios.uf,
        tipoLogradouro: empresas.tipoLogradouro,
        logradouro: empresas.logradouro,
        numero: empresas.numero,
        bairro: empresas.bairro,
        cep: empresas.cep,
        ultimaVisitaEm: empresas.ultimaVisitaEm,
        ultimoContatoEm: empresas.ultimoContatoEm,
        proximaAtividadeEm: empresas.proximaAtividadeEm,
        emAberto: sql<string>`(SELECT coalesce(sum(o.valor_total), 0) FROM oportunidades o
          WHERE o.empresa_id = ${empresas.id} AND o.status = 'ativo' AND o.excluido_em IS NULL)`,
        situacaoNaoVerificada: empresas.situacaoNaoVerificada,
      })
      .from(empresas)
      .innerJoin(membros, eq(membros.id, empresas.vendedorId))
      .leftJoin(municipios, eq(municipios.codigoIbge, empresas.municipioCodigo))
      .where(onde)
      .orderBy(...this.ordem(consulta))
      .limit(consulta.porPagina)
      .offset((consulta.pagina - 1) * consulta.porPagina)

    const ids = linhas.map((l) => l.id)
    const [tagsDasEmpresas, telefones] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select({
                empresaId: empresaTags.empresaId,
                id: tags.id,
                nome: tags.nome,
                cor: tags.cor,
                tagGrupoId: tags.tagGrupoId,
              })
              .from(empresaTags)
              .innerJoin(tags, eq(tags.id, empresaTags.tagId))
              .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
              .where(inArray(empresaTags.empresaId, ids))
              // a ordem dos grupos (Configurações > Tags) manda; dentro do grupo, a ordem das tags
              .orderBy(asc(tagGrupos.ordem), asc(tagGrupos.nome), asc(tags.ordem), asc(tags.nome)),
            db
              .select({ empresaId: empresaTelefones.empresaId, e164: empresaTelefones.numeroE164 })
              .from(empresaTelefones)
              .where(
                and(inArray(empresaTelefones.empresaId, ids), eq(empresaTelefones.principal, true)),
              ),
          ])

    const itens: ItemDaLista[] = linhas.map((l) => ({
      id: l.id,
      nome: l.nomeFantasia ?? l.razaoSocial,
      razaoSocial: l.razaoSocial,
      tipoDocumento: l.tipoDocumento,
      documento: l.documento,
      matrizFilial: l.matrizFilial,
      vendedor: { id: l.vendedorId, nome: l.vendedorNome },
      cidade: l.cidade !== null && l.uf !== null ? { nome: l.cidade, uf: l.uf } : null,
      tags: tagsDasEmpresas.filter((t) => t.empresaId === l.id).map(({ empresaId: _, ...t }) => t),
      telefone: telefones.find((t) => t.empresaId === l.id)?.e164 ?? null,
      enderecoParaRota: enderecoEmUmaLinha(l),
      ultimaVisitaEm: l.ultimaVisitaEm?.toISOString() ?? null,
      ultimoContatoEm: l.ultimoContatoEm?.toISOString() ?? null,
      proximaAtividadeEm: l.proximaAtividadeEm?.toISOString() ?? null,
      emAberto: Number(l.emAberto),
      situacaoNaoVerificada: l.situacaoNaoVerificada,
      editavel: podeEditar(escopo, l.vendedorId),
    }))
    return {
      itens,
      total: contagem?.total ?? 0,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    }
  }

  /** Contagem de cada chip, só do que o usuário vê. */
  async contagens(incluirLeads: boolean): Promise<ContagensDaLista> {
    const escopo = await escopoDaCarteira(this.ctx)
    const considera = incluirLeads ? sql`true` : statusClienteOuProspect
    const [r] = await this.ctx.db().execute<{
      todas: number
      minha: number
      sem_visita_90: number
      nunca_visitadas: number
      sem_proxima: number
    }>(sql`
      SELECT count(*)::int AS todas,
        count(*) FILTER (WHERE ${empresas.vendedorId} = ${escopo.membroId})::int AS minha,
        count(*) FILTER (WHERE ${considera} AND ${empresas.ultimaVisitaEm} <= ${haDias(90)})::int AS sem_visita_90,
        count(*) FILTER (WHERE ${considera} AND ${empresas.ultimaVisitaEm} IS NULL)::int AS nunca_visitadas,
        count(*) FILTER (WHERE ${considera} AND ${empresas.proximaAtividadeId} IS NULL)::int AS sem_proxima
      FROM ${empresas}
      WHERE ${and(isNull(empresas.excluidoEm), condicaoDeVisibilidade(escopo))}`)
    return {
      todas: r?.todas ?? 0,
      minha: r?.minha ?? 0,
      semVisita90: r?.sem_visita_90 ?? 0,
      nuncaVisitadas: r?.nunca_visitadas ?? 0,
      semProximaAtividade: r?.sem_proxima ?? 0,
    }
  }

  async opcoes(): Promise<OpcoesDaLista> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [vendedores, cidades, [config]] = await Promise.all([
      db
        .select({ id: membros.id, nome: membros.nome })
        .from(membros)
        .where(and(eq(membros.ativo, true), isNull(membros.excluidoEm)))
        .orderBy(asc(membros.nome)),
      db
        .selectDistinct({
          codigoIbge: municipios.codigoIbge,
          nome: municipios.nome,
          uf: municipios.uf,
        })
        .from(empresas)
        .innerJoin(municipios, eq(municipios.codigoIbge, empresas.municipioCodigo))
        .where(and(isNull(empresas.excluidoEm), condicaoDeVisibilidade(escopo)))
        .orderBy(asc(municipios.nome)),
      db
        .select({ dias: tenantConfiguracoes.diasSemContatoAlerta })
        .from(tenantConfiguracoes)
        .where(eq(tenantConfiguracoes.tenantId, this.ctx.tenantId)),
    ])
    return {
      vendedores,
      unicoMembro: vendedores.length <= 1,
      cidades,
      diasAlertaDeContato: config?.dias ?? 60,
    }
  }

  // ---- apoio ----

  private condicoes(escopo: EscopoDaCarteira, c: ConsultaDaLista) {
    const incluirLeads = c.incluirLeads === 'true'
    const condicoes = [isNull(empresas.excluidoEm), condicaoDeVisibilidade(escopo)]

    switch (c.chip) {
      case 'minha':
        condicoes.push(eq(empresas.vendedorId, escopo.membroId))
        break
      case 'sem_visita_90':
        condicoes.push(sql`${empresas.ultimaVisitaEm} <= ${haDias(90)}`)
        if (!incluirLeads) condicoes.push(statusClienteOuProspect)
        break
      case 'nunca_visitadas':
        condicoes.push(isNull(empresas.ultimaVisitaEm))
        if (!incluirLeads) condicoes.push(statusClienteOuProspect)
        break
      case 'sem_proxima_atividade':
        condicoes.push(isNull(empresas.proximaAtividadeId))
        if (!incluirLeads) condicoes.push(statusClienteOuProspect)
        break
      case 'todas':
        break
    }

    if (c.busca) condicoes.push(buscaDaEmpresa(c.busca))
    for (const tagId of c.tags ?? []) condicoes.push(temATag(tagId))
    if (c.vendedorId) condicoes.push(eq(empresas.vendedorId, c.vendedorId))
    if (c.semContato) {
      // Sem contato há N dias (inclui quem nunca teve): a regra do Dashboard, só Cliente e Prospect salvo "incluir leads"
      condicoes.push(
        or(
          isNull(empresas.ultimoContatoEm),
          sql`${empresas.ultimoContatoEm} <= ${haDias(c.semContato)}`,
        ),
      )
      if (!incluirLeads) condicoes.push(statusClienteOuProspect)
    }
    if (c.municipio) condicoes.push(eq(empresas.municipioCodigo, c.municipio))
    if (c.porte !== undefined) {
      // "Não informado" (0) inclui quem não tem porte nenhum
      condicoes.push(
        c.porte === 0
          ? or(isNull(empresas.porteCodigo), eq(empresas.porteCodigo, 0))
          : eq(empresas.porteCodigo, c.porte),
      )
    }
    if (c.regimeTributario) condicoes.push(eq(empresas.regimeTributario, c.regimeTributario))
    switch (c.ultimaVisita) {
      case '30':
        condicoes.push(sql`${empresas.ultimaVisitaEm} >= ${haDias(30)}`)
        break
      case '60':
      case '90':
        // "Sem visita há N dias" inclui quem nunca foi visitado
        condicoes.push(
          or(
            isNull(empresas.ultimaVisitaEm),
            sql`${empresas.ultimaVisitaEm} <= ${haDias(Number(c.ultimaVisita))}`,
          ),
        )
        break
      case 'nunca':
        condicoes.push(isNull(empresas.ultimaVisitaEm))
        break
      case undefined:
        break
    }
    return and(...condicoes)
  }

  /** Nome, razão social e cidade sem acento; documento por pedaço, com ou sem máscara. */
  private ordem(c: ConsultaDaLista) {
    const sentido = c.sentido === 'desc' ? desc : asc
    const desempate = asc(empresas.id)
    switch (c.ordem) {
      case 'nome':
        return [
          sentido(
            sql`${semAcento(sql`coalesce(${empresas.nomeFantasia}, ${empresas.razaoSocial})`)}`,
          ),
          desempate,
        ]
      case 'criado_em':
        return [sentido(empresas.criadoEm), desempate]
      case 'ultima_visita':
      case 'ultimo_contato': {
        const coluna =
          c.ordem === 'ultima_visita' ? empresas.ultimaVisitaEm : empresas.ultimoContatoEm
        // Crescente: quem nunca foi visitado (nulo) vem primeiro, é o mais atrasado
        return [
          sql`${coluna} ${c.sentido === 'desc' ? sql`DESC NULLS LAST` : sql`ASC NULLS FIRST`}`,
          desempate,
        ]
      }
      case 'proxima_atividade':
        return [
          sql`${empresas.proximaAtividadeEm} ${c.sentido === 'desc' ? sql`DESC NULLS LAST` : sql`ASC NULLS LAST`}`,
          desempate,
        ]
    }
  }
}

/** "Rua das Flores, 567, Centro, 29100001": serve para buscar no mapa; nulo se não tem logradouro. */
function enderecoEmUmaLinha(l: {
  tipoLogradouro: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}): string | null {
  if (!l.logradouro) return null
  const rua = [l.tipoLogradouro, l.logradouro].filter(Boolean).join(' ')
  const cidade = l.cidade && l.uf ? `${l.cidade} - ${l.uf}` : null
  return [rua, l.numero, l.bairro, cidade, l.cep].filter(Boolean).join(', ')
}
