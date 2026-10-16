import { and, asc, desc, eq, isNull, schema, sql, type SQL } from '@leadtogo/db'
import {
  type ConsultaDeOportunidades,
  type ConsultaDoKanban,
  type KanbanDeOportunidades,
  LIMITE_POR_FASE_NO_KANBAN,
  type ListaDeOportunidades,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import {
  condicaoDeVisibilidadeDaOportunidade,
  paraOportunidade,
  selecionarOportunidades,
} from './oportunidades-leitura.js'
import { escopoDaCarteira } from './regras-de-carteira.js'

const { empresas, funilFases, funis, oportunidades } = schema

const semAcento = (valor: unknown) => sql`lower(f_unaccent(${valor}))`
const literalParaLike = (texto: string): string => texto.replace(/[\\%_]/g, (c) => `\\${c}`)
const numero = (v: unknown): number => Number(v ?? 0)

/** O Kanban de um funil e a lista simples (com filtros e paginação). */
@Injectable()
export class ListaDeOportunidadesService {
  constructor(private readonly ctx: ContextoTenantService) {}

  private buscaSql(busca: string | undefined): SQL | undefined {
    if (!busca) return undefined
    const termo = `%${literalParaLike(busca.toLowerCase())}%`
    return sql`(${semAcento(oportunidades.titulo)} LIKE ${termo} ESCAPE '\\'
      OR ${semAcento(empresas.razaoSocial)} LIKE ${termo} ESCAPE '\\'
      OR ${semAcento(sql`coalesce(${empresas.nomeFantasia}, '')`)} LIKE ${termo} ESCAPE '\\')`
  }

  async kanban(consulta: ConsultaDoKanban): Promise<KanbanDeOportunidades> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [funil] = await db
      .select()
      .from(funis)
      .where(
        and(
          isNull(funis.excluidoEm),
          consulta.funilId ? eq(funis.id, consulta.funilId) : eq(funis.padrao, true),
        ),
      )
    if (!funil) throw new ErroApi('funil_nao_encontrado', 'Funil não encontrado.', 404)
    const fases = await db
      .select()
      .from(funilFases)
      .where(
        and(
          eq(funilFases.funilId, funil.id),
          isNull(funilFases.excluidoEm),
          eq(funilFases.ativo, true),
        ),
      )
      .orderBy(asc(funilFases.ordem), asc(funilFases.nome))

    const base = and(
      isNull(oportunidades.excluidoEm),
      isNull(empresas.excluidoEm),
      eq(oportunidades.funilId, funil.id),
      condicaoDeVisibilidadeDaOportunidade(escopo),
      consulta.responsavelId ? eq(oportunidades.responsavelId, consulta.responsavelId) : undefined,
      this.buscaSql(consulta.busca),
    )
    const ativas = and(base, eq(oportunidades.status, 'ativo'))

    const somas = await db
      .select({
        faseId: oportunidades.faseId,
        quantidade: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${oportunidades.valorTotal}), 0)`,
        mensal: sql<string>`coalesce(sum(${oportunidades.valorMensal}), 0)`,
        ponderado: sql<string>`coalesce(sum(${oportunidades.valorPonderado}), 0)`,
      })
      .from(oportunidades)
      .innerJoin(empresas, eq(empresas.id, oportunidades.empresaId))
      .where(ativas)
      .groupBy(oportunidades.faseId)
    const [suspensas] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(oportunidades)
      .innerJoin(empresas, eq(empresas.id, oportunidades.empresaId))
      .where(and(base, eq(oportunidades.status, 'suspenso')))

    const agora = new Date()
    const colunas = await Promise.all(
      fases.map(async (f) => {
        const linhas = await selecionarOportunidades(db, escopo)
          .where(and(ativas, eq(oportunidades.faseId, f.id)))
          .orderBy(
            sql`${oportunidades.dataPrevistaFechamento} ASC NULLS LAST`,
            desc(oportunidades.criadoEm),
            desc(oportunidades.id),
          )
          .limit(LIMITE_POR_FASE_NO_KANBAN)
        const s = somas.find((x) => x.faseId === f.id)
        const quantidade = s?.quantidade ?? 0
        return {
          id: f.id,
          nome: f.nome,
          cor: f.cor,
          probabilidadePadrao: f.probabilidadePadrao,
          diasAlertaParada: f.diasAlertaParada,
          quantidade,
          total: numero(s?.total),
          itens: linhas.map((l) => paraOportunidade(l, escopo, agora)),
          semMostrar: Math.max(0, quantidade - linhas.length),
        }
      }),
    )
    return {
      funil: { id: funil.id, nome: funil.nome },
      fases: colunas,
      resumo: {
        ativas: somas.reduce((n, s) => n + s.quantidade, 0),
        total: somas.reduce((n, s) => n + numero(s.total), 0),
        mensal: somas.reduce((n, s) => n + numero(s.mensal), 0),
        ponderado: somas.reduce((n, s) => n + numero(s.ponderado), 0),
      },
      suspensas: suspensas?.n ?? 0,
    }
  }

  async listar(consulta: ConsultaDeOportunidades): Promise<ListaDeOportunidades> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const onde = and(
      isNull(oportunidades.excluidoEm),
      isNull(empresas.excluidoEm),
      condicaoDeVisibilidadeDaOportunidade(escopo),
      consulta.status ? eq(oportunidades.status, consulta.status) : undefined,
      consulta.funilId ? eq(oportunidades.funilId, consulta.funilId) : undefined,
      consulta.faseId ? eq(oportunidades.faseId, consulta.faseId) : undefined,
      consulta.empresaId ? eq(oportunidades.empresaId, consulta.empresaId) : undefined,
      consulta.responsavelId ? eq(oportunidades.responsavelId, consulta.responsavelId) : undefined,
      this.buscaSql(consulta.busca),
    )
    const [somas] = await db
      .select({
        total: sql<number>`count(*)::int`,
        valor: sql<string>`coalesce(sum(${oportunidades.valorTotal}), 0)`,
        mensal: sql<string>`coalesce(sum(${oportunidades.valorMensal}), 0)`,
        ponderado: sql<string>`coalesce(sum(${oportunidades.valorPonderado}), 0)`,
      })
      .from(oportunidades)
      .innerJoin(empresas, eq(empresas.id, oportunidades.empresaId))
      .where(onde)

    const sentido = consulta.sentido === 'asc' ? asc : desc
    const ordem =
      consulta.ordem === 'titulo'
        ? sentido(sql`lower(f_unaccent(${oportunidades.titulo}))`)
        : consulta.ordem === 'total'
          ? sentido(oportunidades.valorTotal)
          : consulta.ordem === 'previsao'
            ? sql`${oportunidades.dataPrevistaFechamento} ${consulta.sentido === 'asc' ? sql`ASC` : sql`DESC`} NULLS LAST`
            : sentido(oportunidades.criadoEm)
    const linhas = await selecionarOportunidades(db, escopo)
      .where(onde)
      .orderBy(ordem, desc(oportunidades.id))
      .limit(consulta.porPagina)
      .offset((consulta.pagina - 1) * consulta.porPagina)
    const agora = new Date()
    return {
      itens: linhas.map((l) => paraOportunidade(l, escopo, agora)),
      total: somas?.total ?? 0,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
      somas: {
        total: numero(somas?.valor),
        mensal: numero(somas?.mensal),
        ponderado: numero(somas?.ponderado),
      },
    }
  }
}
