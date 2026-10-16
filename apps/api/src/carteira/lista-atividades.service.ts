import { and, asc, desc, eq, isNull, schema, sql, type SQL } from '@leadtogo/db'
import type { ConsultaDeAtividades, ListaDeAtividades } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import {
  condicaoDeVisibilidadeDaAtividade,
  fusoDaEmpresa,
  paraAtividade,
  selecionarAtividades,
} from './atividades-leitura.js'
import { agendadas, atrasada, hoje, proximos7 } from './atividades-janelas.js'
import { escopoDaCarteira } from './regras-de-carteira.js'

const { atividades, contatos, empresas } = schema

const semAcento = (valor: unknown) => sql`lower(f_unaccent(${valor}))`
const literalParaLike = (texto: string): string => texto.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Lista de atividades com as abas Agendadas, Atrasadas e Realizadas. "Atrasada" e o dia de cada
 * atividade de dia inteiro são calculados no fuso da empresa (nunca em UTC).
 */
@Injectable()
export class ListaDeAtividadesService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async listar(consulta: ConsultaDeAtividades): Promise<ListaDeAtividades> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, this.ctx.tenantId)

    const filtros = this.filtros(escopo.membroId, consulta)
    const base = and(
      isNull(atividades.excluidoEm),
      condicaoDeVisibilidadeDaAtividade(escopo),
      ...filtros,
    )

    const abas = {
      agendadas: agendadas(fuso),
      atrasadas: atrasada(fuso),
      realizadas: sql`${atividades.situacao} = 'realizada'`,
      hoje: hoje(fuso),
      proximos7: proximos7(fuso),
    }

    const [contagem] = await db
      .select({
        agendadas: sql<number>`count(*) FILTER (WHERE ${abas.agendadas})::int`,
        atrasadas: sql<number>`count(*) FILTER (WHERE ${abas.atrasadas})::int`,
        realizadas: sql<number>`count(*) FILTER (WHERE ${abas.realizadas})::int`,
        hoje: sql<number>`count(*) FILTER (WHERE ${abas.hoje})::int`,
        proximos7: sql<number>`count(*) FILTER (WHERE ${abas.proximos7})::int`,
        todas: sql<number>`count(*)::int`,
      })
      .from(atividades)
      .leftJoin(empresas, eq(empresas.id, atividades.empresaId))
      .leftJoin(contatos, eq(contatos.id, atividades.contatoId))
      .where(base)

    const onde = consulta.aba ? and(base, abas[consulta.aba]) : base
    const linhas = await selecionarAtividades(db, escopo)
      .where(onde)
      .orderBy(...this.ordem(consulta.aba))
      .limit(consulta.porPagina)
      .offset((consulta.pagina - 1) * consulta.porPagina)

    const agora = new Date()
    const contagens = {
      agendadas: contagem?.agendadas ?? 0,
      atrasadas: contagem?.atrasadas ?? 0,
      realizadas: contagem?.realizadas ?? 0,
      hoje: contagem?.hoje ?? 0,
      proximos7: contagem?.proximos7 ?? 0,
    }
    return {
      itens: linhas.map((l) => paraAtividade(l, agora, fuso)),
      total: consulta.aba ? contagens[consulta.aba] : (contagem?.todas ?? 0),
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
      contagens,
    }
  }

  private filtros(membroId: string, c: ConsultaDeAtividades): (SQL | undefined)[] {
    const busca = c.busca ? `%${literalParaLike(c.busca.toLowerCase())}%` : undefined
    return [
      c.empresaId ? eq(atividades.empresaId, c.empresaId) : undefined,
      c.contatoId ? eq(atividades.contatoId, c.contatoId) : undefined,
      c.oportunidadeId ? eq(atividades.oportunidadeId, c.oportunidadeId) : undefined,
      c.tipoAtividadeId ? eq(atividades.tipoAtividadeId, c.tipoAtividadeId) : undefined,
      c.responsavelId ? eq(atividades.responsavelId, c.responsavelId) : undefined,
      c.minhas === 'true' ? eq(atividades.responsavelId, membroId) : undefined,
      busca
        ? sql`(${semAcento(atividades.titulo)} LIKE ${busca} ESCAPE '\\'
            OR ${semAcento(empresas.razaoSocial)} LIKE ${busca} ESCAPE '\\'
            OR ${semAcento(sql`coalesce(${empresas.nomeFantasia}, '')`)} LIKE ${busca} ESCAPE '\\'
            OR ${semAcento(sql`coalesce(${contatos.nome}, '')`)} LIKE ${busca} ESCAPE '\\')`
        : undefined,
    ]
  }

  /**
   * Agendadas e atrasadas: a mais próxima (ou a mais antiga) primeiro. Realizadas: a mais recente
   * primeiro. Sem aba (linha do tempo da ficha): as abertas primeiro, por data, depois o histórico.
   */
  private ordem(aba: ConsultaDeAtividades['aba']) {
    if (aba === 'realizadas') {
      return [desc(atividades.realizadaEm), desc(atividades.id)]
    }
    if (aba === 'agendadas' || aba === 'atrasadas' || aba === 'hoje' || aba === 'proximos7') {
      return [asc(atividades.dataInicio), asc(atividades.id)]
    }
    return [
      sql`(${atividades.situacao} IN ('pendente', 'em_execucao')) DESC`,
      sql`CASE WHEN ${atividades.situacao} IN ('pendente', 'em_execucao') THEN ${atividades.dataInicio} END ASC`,
      sql`coalesce(${atividades.realizadaEm}, ${atividades.dataInicio}) DESC`,
      desc(atividades.id),
    ]
  }
}
