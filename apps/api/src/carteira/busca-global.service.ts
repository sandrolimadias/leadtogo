import { and, asc, desc, eq, inArray, isNull, schema, sql, type SQL } from '@leadtogo/db'
import {
  type BuscaRecente,
  type ConsultaDaBuscaGlobal,
  type ItemDaBuscaGlobal,
  MAXIMO_DE_BUSCAS_RECENTES,
  type ResultadoDaBuscaGlobal,
  TIPOS_DA_BUSCA_GLOBAL,
  type TipoDaBuscaGlobal,
  termoComparavel,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import {
  buscaDaEmpresa,
  buscaDaOportunidade,
  buscaDoContato,
  padraoComeca,
  semAcento,
} from './busca-texto.js'
import { condicaoDeVisibilidadeDaOportunidade } from './oportunidades-leitura.js'
import {
  condicaoDeVisibilidade,
  type EscopoDaCarteira,
  escopoDaCarteira,
} from './regras-de-carteira.js'
import { condicaoDeVisibilidadeDoContato } from './regras-de-contato.js'

const {
  buscasRecentes,
  contatos,
  empresaContatos,
  empresas,
  funilFases,
  membros,
  municipios,
  oportunidades,
} = schema

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** "A · B · C" sem as partes vazias; `null` se não sobrar nada. */
const juntar = (...partes: (string | null | undefined)[]): string | null =>
  partes.filter((p): p is string => !!p && p.trim() !== '').join(' · ') || null

/** 0 = algum dos textos começa com o termo; 1 = só contém. Ordena antes da data. */
const comecaCom = (texto: string, ...colunas: unknown[]): SQL =>
  sql`CASE WHEN ${sql.join(
    colunas.map(
      (c) => sql`${semAcento(sql`coalesce(${c}, '')`)} LIKE ${semAcento(padraoComeca(texto))}`,
    ),
    sql` OR `,
  )} THEN 0 ELSE 1 END`

/**
 * Busca global (docs/plano_busca_global.md): empresas, contatos e oportunidades que a pessoa vê, cada tipo com a sua
 * regra de carteira, e as buscas recentes dela. A busca só lê; o histórico é gravado à parte, quando a busca termina.
 */
@Injectable()
export class BuscaGlobalService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async buscar(consulta: ConsultaDaBuscaGlobal): Promise<ResultadoDaBuscaGlobal> {
    const escopo = await escopoDaCarteira(this.ctx)
    const tipos = new Set<TipoDaBuscaGlobal>(consulta.tipos ?? TIPOS_DA_BUSCA_GLOBAL)
    const { q, limite } = consulta
    const vazio = Promise.resolve([] as ItemDaBuscaGlobal[])
    // Em sequência: as consultas dividem a mesma transação (o tenant ativo), que não aceita comandos em paralelo
    const empresasAchadas = await (tipos.has('empresas') ? this.empresas(escopo, q, limite) : vazio)
    const contatosAchados = await (tipos.has('contatos') ? this.contatos(escopo, q, limite) : vazio)
    const oportunidadesAchadas = await (tipos.has('oportunidades')
      ? this.oportunidades(escopo, q, limite)
      : vazio)
    return {
      empresas: empresasAchadas,
      contatos: contatosAchados,
      oportunidades: oportunidadesAchadas,
    }
  }

  private async empresas(
    escopo: EscopoDaCarteira,
    q: string,
    limite: number,
  ): Promise<ItemDaBuscaGlobal[]> {
    const linhas = await this.ctx
      .db()
      .select({
        id: empresas.id,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        cidade: municipios.nome,
        uf: municipios.uf,
        vendedor: membros.nome,
        status: sql<{ nome: string; cor: string } | null>`(
          SELECT json_build_object('nome', t.nome, 'cor', t.cor)
          FROM empresa_tags et
          JOIN tags t ON t.id = et.tag_id AND t.excluido_em IS NULL
          JOIN tag_grupos g ON g.id = t.tag_grupo_id AND g.chave_sistema = 'status'
          WHERE et.empresa_id = ${empresas.id}
          LIMIT 1)`,
      })
      .from(empresas)
      .innerJoin(membros, eq(membros.id, empresas.vendedorId))
      .leftJoin(municipios, eq(municipios.codigoIbge, empresas.municipioCodigo))
      .where(and(isNull(empresas.excluidoEm), condicaoDeVisibilidade(escopo), buscaDaEmpresa(q)))
      .orderBy(
        comecaCom(q, empresas.nomeFantasia, empresas.razaoSocial),
        desc(empresas.atualizadoEm),
        asc(empresas.id),
      )
      .limit(limite)
    return linhas.map((l) => ({
      id: l.id,
      titulo: l.nomeFantasia || l.razaoSocial,
      subtitulo: juntar(l.cidade && l.uf ? `${l.cidade}/${l.uf}` : l.cidade, l.vendedor),
      status: l.status,
      destino: `/empresas/${l.id}`,
    }))
  }

  private async contatos(
    escopo: EscopoDaCarteira,
    q: string,
    limite: number,
  ): Promise<ItemDaBuscaGlobal[]> {
    const db = this.ctx.db()
    const linhas = await db
      .select({ id: contatos.id, nome: contatos.nome })
      .from(contatos)
      .where(
        and(
          isNull(contatos.excluidoEm),
          condicaoDeVisibilidadeDoContato(escopo),
          buscaDoContato(q),
        ),
      )
      .orderBy(comecaCom(q, contatos.nome), desc(contatos.atualizadoEm), asc(contatos.id))
      .limit(limite)
    if (linhas.length === 0) return []

    // A empresa de cada contato: o vínculo ativo e principal primeiro, só entre as empresas que a pessoa vê
    const vinculos = await db
      .select({
        contatoId: empresaContatos.contatoId,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        cargo: empresaContatos.cargo,
      })
      .from(empresaContatos)
      .innerJoin(empresas, eq(empresas.id, empresaContatos.empresaId))
      .where(
        and(
          inArray(
            empresaContatos.contatoId,
            linhas.map((l) => l.id),
          ),
          eq(empresaContatos.ativo, true),
          isNull(empresas.excluidoEm),
          condicaoDeVisibilidade(escopo),
        ),
      )
      .orderBy(desc(empresaContatos.principal), asc(empresaContatos.criadoEm))
    return linhas.map((l) => {
      const v = vinculos.find((x) => x.contatoId === l.id)
      return {
        id: l.id,
        titulo: l.nome,
        subtitulo: v ? juntar(v.nomeFantasia || v.razaoSocial, v.cargo) : null,
        status: null,
        destino: `/contatos/${l.id}`,
      }
    })
  }

  private async oportunidades(
    escopo: EscopoDaCarteira,
    q: string,
    limite: number,
  ): Promise<ItemDaBuscaGlobal[]> {
    const linhas = await this.ctx
      .db()
      .select({
        id: oportunidades.id,
        titulo: oportunidades.titulo,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        fase: funilFases.nome,
        valorTotal: oportunidades.valorTotal,
      })
      .from(oportunidades)
      .innerJoin(empresas, eq(empresas.id, oportunidades.empresaId))
      .leftJoin(funilFases, eq(funilFases.id, oportunidades.faseId))
      .where(
        and(
          isNull(oportunidades.excluidoEm),
          isNull(empresas.excluidoEm),
          condicaoDeVisibilidadeDaOportunidade(escopo),
          buscaDaOportunidade(q),
        ),
      )
      .orderBy(
        comecaCom(q, oportunidades.titulo),
        desc(oportunidades.atualizadoEm),
        asc(oportunidades.id),
      )
      .limit(limite)
    return linhas.map((l) => ({
      id: l.id,
      titulo: l.titulo,
      subtitulo: juntar(
        l.nomeFantasia || l.razaoSocial,
        l.fase,
        Number(l.valorTotal ?? 0) > 0 ? moeda.format(Number(l.valorTotal)) : null,
      ),
      status: null,
      destino: `/oportunidades/${l.id}`,
    }))
  }

  // ---------------------------------------------------------------------------------- buscas recentes

  /** As buscas recentes de quem pede (nunca as de outra pessoa), a mais recente primeiro. */
  async recentes(): Promise<BuscaRecente[]> {
    const linhas = await this.ctx
      .db()
      .select({
        id: buscasRecentes.id,
        termo: buscasRecentes.termo,
        buscadoEm: buscasRecentes.buscadoEm,
      })
      .from(buscasRecentes)
      .where(eq(buscasRecentes.membroId, this.ctx.membro.id))
      .orderBy(desc(buscasRecentes.buscadoEm), desc(buscasRecentes.id))
      .limit(MAXIMO_DE_BUSCAS_RECENTES)
    return linhas.map((l) => ({ ...l, buscadoEm: l.buscadoEm.toISOString() }))
  }

  /** Grava o termo (repetido volta ao topo) e mantém só as 10 mais recentes. */
  async registrar(termo: string): Promise<BuscaRecente[]> {
    const db = this.ctx.db()
    const membroId = this.ctx.membro.id
    await db
      .insert(buscasRecentes)
      .values({
        tenantId: this.ctx.tenantId,
        membroId,
        termo,
        termoComparavel: termoComparavel(termo).slice(0, 100),
        criadoPor: membroId,
        atualizadoPor: membroId,
      })
      .onConflictDoUpdate({
        target: [buscasRecentes.tenantId, buscasRecentes.membroId, buscasRecentes.termoComparavel],
        set: { termo, buscadoEm: sql`now()`, atualizadoEm: sql`now()`, atualizadoPor: membroId },
      })
    await db.execute(sql`
      DELETE FROM buscas_recentes WHERE membro_id = ${membroId} AND id NOT IN (
        SELECT id FROM buscas_recentes WHERE membro_id = ${membroId}
        ORDER BY buscado_em DESC, id DESC LIMIT ${MAXIMO_DE_BUSCAS_RECENTES})`)
    return this.recentes()
  }

  /** Apaga um termo de quem pede; o de outra pessoa (ou inexistente) responde 404. */
  async apagar(id: string): Promise<void> {
    const apagadas = await this.ctx
      .db()
      .delete(buscasRecentes)
      .where(and(eq(buscasRecentes.id, id), eq(buscasRecentes.membroId, this.ctx.membro.id)))
      .returning({ id: buscasRecentes.id })
    if (apagadas.length === 0) {
      throw new ErroApi('busca_recente_nao_encontrada', 'Busca recente não encontrada.', 404)
    }
  }

  /** Limpa o histórico de quem pede. */
  async limpar(): Promise<void> {
    await this.ctx
      .db()
      .delete(buscasRecentes)
      .where(eq(buscasRecentes.membroId, this.ctx.membro.id))
  }
}
