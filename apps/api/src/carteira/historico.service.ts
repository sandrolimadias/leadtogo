import { and, eq, inArray, isNull, schema, sql } from '@leadtogo/db'
import {
  type ConsultaDoHistorico,
  type EntradaDoHistorico,
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
  type HistoricoDaEmpresa,
  ROTULO_DO_REGIME,
  type RegimeTributario,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { escopoDaCarteira, podeVer } from './regras-de-carteira.js'

const { empresas, membros, municipios, portes, tags, verticais } = schema

type Mudanca = EntradaDoHistorico['mudancas'][number]

type LinhaBruta = {
  id: string
  em: Date | string
  membro_id: string | null
  acao: string
  alteracoes: unknown
  automatica: boolean
  tag_id: string | null
}

const ROTULOS: Record<string, string> = {
  razaoSocial: 'Razão social',
  nomeFantasia: 'Nome fantasia',
  mei: 'MEI',
  dataInicioAtividades: 'Início das atividades',
  porteCodigo: 'Porte',
  regimeTributario: 'Regime tributário',
  vendedorId: 'Vendedor',
  verticalId: 'Vertical',
  website: 'Website',
  observacoes: 'Observações',
  cep: 'CEP',
  tipoLogradouro: 'Tipo de logradouro',
  logradouro: 'Logradouro',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  municipioCodigo: 'Cidade',
  paisCodigo: 'País',
  telefones: 'Telefones',
  cnaes: 'CNAEs',
}

const ROTULOS_DO_CADASTRO: Record<string, string> = {
  documento: 'Documento',
  vendedorId: 'Vendedor',
  origemCadastro: 'Origem do cadastro',
  situacaoNaoVerificada: 'Situação na Receita',
}
const ORIGEM: Record<string, string> = {
  manual: 'Manual',
  receita: 'Consulta à Receita',
  importacao: 'Importação',
  prospeccao: 'Prospecção',
  whatsapp: 'WhatsApp',
  api: 'API',
}

const registro = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** "+552730643021" vira "(27) 3064-3021"; número de outro país fica como está. */
const telefoneLegivel = (e164: string): string =>
  e164.startsWith('+55') ? formatarTelefone(e164.slice(3)) : e164

/** Qualquer valor da auditoria como texto (nunca "[object Object]"). */
const comoTexto = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? String(v)
    : JSON.stringify(v)

const dataLegivel = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/**
 * A aba Histórico da ficha: a auditoria da empresa em português (nomes no lugar de ids) e as tags que o
 * sistema aplicou ou tirou sozinho (que não passam pela auditoria). O mais recente primeiro.
 */
@Injectable()
export class HistoricoDaEmpresaService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async listar(empresaId: string, consulta: ConsultaDoHistorico): Promise<HistoricoDaEmpresa> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [empresa] = await db
      .select({ vendedorId: empresas.vendedorId })
      .from(empresas)
      .where(and(eq(empresas.id, empresaId), isNull(empresas.excluidoEm)))
    if (!empresa || !podeVer(escopo, empresa.vendedorId)) {
      throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    }

    const fontes = sql`
      SELECT 'a' || a.id::text AS id, a.em, a.membro_id, a.acao, a.alteracoes, false AS automatica, NULL::uuid AS tag_id
        FROM auditoria a WHERE a.entidade = 'empresa' AND a.entidade_id = ${empresaId}
      UNION ALL
      SELECT 't' || h.id::text, h.em, h.por, 'tag_' || h.acao::text, NULL::jsonb, true, h.tag_id
        FROM empresa_tags_historico h WHERE h.empresa_id = ${empresaId} AND h.automatica`
    const [contagem] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM (${fontes}) f`,
    )
    const linhas = await db.execute<LinhaBruta>(sql`
      SELECT * FROM (${fontes}) f ORDER BY em DESC, id DESC
      LIMIT ${consulta.porPagina} OFFSET ${(consulta.pagina - 1) * consulta.porPagina}`)
    const nomes = await this.nomesCitados(linhas)

    return {
      itens: linhas.map((l) => this.entrada(l, nomes)),
      total: contagem?.n ?? 0,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    }
  }

  // ---- apoio ----

  /** Nomes de tudo o que as linhas citam por id (membros, verticais, cidades, portes, tags). */
  private async nomesCitados(linhas: LinhaBruta[]) {
    const db = this.ctx.db()
    const membroIds = new Set<string>()
    const verticalIds = new Set<string>()
    const cidades = new Set<number>()
    const portesCitados = new Set<number>()
    const tagIds = new Set<string>()
    const cita = (alvo: Set<string>, v: unknown) => {
      if (typeof v === 'string') alvo.add(v)
    }
    for (const l of linhas) {
      cita(membroIds, l.membro_id)
      cita(tagIds, l.tag_id)
      const alteracoes = registro(l.alteracoes)
      if (l.acao === 'criar') cita(membroIds, alteracoes['vendedorId'])
      if (l.acao === 'alterar') {
        for (const [campo, valor] of Object.entries(alteracoes)) {
          const { de, para } = registro(valor)
          for (const v of [de, para]) {
            if (campo === 'vendedorId') cita(membroIds, v)
            if (campo === 'verticalId') cita(verticalIds, v)
            if (campo === 'municipioCodigo' && typeof v === 'number') cidades.add(v)
            if (campo === 'porteCodigo' && typeof v === 'number') portesCitados.add(v)
          }
        }
      }
    }
    const [m, v, c, p, t] = await Promise.all([
      membroIds.size
        ? db
            .select({ id: membros.id, nome: membros.nome })
            .from(membros)
            .where(inArray(membros.id, [...membroIds]))
        : [],
      verticalIds.size
        ? db
            .select({ id: verticais.id, nome: verticais.nome })
            .from(verticais)
            .where(inArray(verticais.id, [...verticalIds]))
        : [],
      cidades.size
        ? db
            .select({ id: municipios.codigoIbge, nome: municipios.nome, uf: municipios.uf })
            .from(municipios)
            .where(inArray(municipios.codigoIbge, [...cidades]))
        : [],
      portesCitados.size
        ? db
            .select({ id: portes.codigo, nome: portes.descricao })
            .from(portes)
            .where(inArray(portes.codigo, [...portesCitados]))
        : [],
      tagIds.size
        ? db
            .select({ id: tags.id, nome: tags.nome })
            .from(tags)
            .where(inArray(tags.id, [...tagIds]))
        : [],
    ])
    return {
      membro: new Map<string, string>(m.map((x) => [x.id, x.nome])),
      vertical: new Map<string, string>(v.map((x) => [x.id, x.nome])),
      cidade: new Map<number, string>(c.map((x) => [x.id, `${x.nome}/${x.uf}`])),
      porte: new Map<number, string>(p.map((x) => [x.id, x.nome])),
      tag: new Map<string, string>(t.map((x) => [x.id, x.nome])),
    }
  }

  private entrada(
    l: LinhaBruta,
    nomes: Awaited<ReturnType<typeof this.nomesCitados>>,
  ): EntradaDoHistorico {
    const alteracoes = registro(l.alteracoes)
    const autor = l.membro_id ? (nomes.membro.get(l.membro_id) ?? 'Alguém da equipe') : 'Sistema'
    const base = {
      id: l.id,
      em: new Date(l.em).toISOString(),
      por: { id: l.membro_id, nome: autor },
      automatica: l.automatica || l.membro_id === null,
    }
    const valor = (campo: string, v: unknown): string | null => {
      if (v === null || v === undefined || v === '') return null
      switch (campo) {
        case 'vendedorId':
          return typeof v === 'string' ? (nomes.membro.get(v) ?? 'Alguém da equipe') : null
        case 'verticalId':
          return typeof v === 'string' ? (nomes.vertical.get(v) ?? 'Vertical removida') : null
        case 'municipioCodigo':
          return typeof v === 'number' ? (nomes.cidade.get(v) ?? String(v)) : null
        case 'porteCodigo':
          return typeof v === 'number' ? (nomes.porte.get(v) ?? String(v)) : null
        case 'mei':
          return v === true ? 'Sim' : 'Não'
        case 'regimeTributario':
          return ROTULO_DO_REGIME[v as RegimeTributario] ?? comoTexto(v)
        case 'dataInicioAtividades':
          return dataLegivel(comoTexto(v))
        case 'telefones':
          return Array.isArray(v)
            ? v.map((t) => telefoneLegivel(comoTexto(t))).join(', ') || null
            : null
        case 'cnaes':
          return Array.isArray(v) ? v.map(comoTexto).join(', ') || null : null
        default:
          return comoTexto(v)
      }
    }

    switch (l.acao) {
      case 'criar': {
        const mudancas: Mudanca[] = []
        for (const [campo, rotulo] of Object.entries(ROTULOS_DO_CADASTRO)) {
          const v = alteracoes[campo]
          let texto: string | null
          if (campo === 'documento') {
            const doc = typeof v === 'string' ? v : null
            texto = !doc ? null : doc.length === 11 ? formatarCpf(doc) : formatarCnpj(doc)
          } else if (campo === 'origemCadastro') {
            texto = typeof v === 'string' ? (ORIGEM[v] ?? v) : null
          } else if (campo === 'situacaoNaoVerificada') {
            texto = v === true ? 'Não verificada (Receita fora do ar)' : null
          } else {
            texto = valor(campo, v)
          }
          if (texto) mudancas.push({ campo, rotulo, de: null, para: texto })
        }
        return { ...base, titulo: 'Empresa cadastrada', mudancas }
      }
      case 'alterar': {
        const mudancas = Object.entries(alteracoes).map(([campo, v]): Mudanca => {
          const { de, para } = registro(v)
          return {
            campo,
            rotulo: ROTULOS[campo] ?? campo,
            de: valor(campo, de),
            para: valor(campo, para),
          }
        })
        const soVendedor = mudancas.length === 1 && mudancas[0]?.campo === 'vendedorId'
        return {
          ...base,
          titulo: soVendedor ? 'Carteira transferida' : 'Dados alterados',
          mudancas,
        }
      }
      case 'alterar_tags': {
        const lista = (v: unknown) =>
          Array.isArray(v) && v.length > 0 ? v.map(String).join(', ') : null
        const mudancas: Mudanca[] = []
        const adicionadas = lista(alteracoes['adicionadas'])
        const removidas = lista(alteracoes['removidas'])
        if (adicionadas) {
          mudancas.push({
            campo: 'adicionadas',
            rotulo: 'Tags adicionadas',
            de: null,
            para: adicionadas,
          })
        }
        if (removidas) {
          mudancas.push({ campo: 'removidas', rotulo: 'Tags removidas', de: removidas, para: null })
        }
        return { ...base, titulo: 'Tags alteradas', mudancas }
      }
      case 'excluir':
        return { ...base, titulo: 'Empresa excluída', mudancas: [] }
      case 'tag_adicionada':
      case 'tag_removida': {
        const nome = l.tag_id ? (nomes.tag.get(l.tag_id) ?? 'tag') : 'tag'
        return {
          ...base,
          automatica: true,
          titulo: `Tag ${nome} ${l.acao === 'tag_adicionada' ? 'aplicada' : 'retirada'} pelo sistema`,
          mudancas: [],
        }
      }
      default:
        return { ...base, titulo: l.acao, mudancas: [] }
    }
  }
}
