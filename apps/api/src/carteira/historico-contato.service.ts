import { and, eq, inArray, isNull, schema, sql } from '@leadtogo/db'
import {
  type ConsultaDoHistorico,
  type EntradaDoHistorico,
  formatarTelefone,
  type HistoricoDaEmpresa,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { condicaoDeVisibilidade, escopoDaCarteira } from './regras-de-carteira.js'
import { condicaoDeVisibilidadeDoContato } from './regras-de-contato.js'

const { contatos, empresaContatos, empresas, membros, papeisDecisao } = schema

type Mudanca = EntradaDoHistorico['mudancas'][number]

type LinhaBruta = {
  id: string
  em: Date | string
  membro_id: string | null
  acao: string
  alteracoes: unknown
}

const ROTULOS: Record<string, string> = {
  nome: 'Nome',
  papelDecisaoId: 'Papel na decisão',
  aniversarioDia: 'Dia do aniversário',
  aniversarioMes: 'Mês do aniversário',
  linkedinUrl: 'LinkedIn',
  observacoes: 'Observações',
  aceitaWhatsapp: 'Aceita WhatsApp',
  aceitaEmail: 'Aceita e-mail',
  telefones: 'Telefones',
  emails: 'E-mails',
  cargo: 'Cargo',
  principal: 'Contato principal',
  ativo: 'Vínculo',
}
const CAMPOS_DE_CONSENTIMENTO = new Set(['aceitaWhatsapp', 'aceitaEmail'])

const registro = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const comoTexto = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? String(v)
    : JSON.stringify(v)

/** "+552730643021" vira "(27) 3064-3021"; número de outro país fica como está. */
const telefoneLegivel = (e164: string): string =>
  e164.startsWith('+55') ? formatarTelefone(e164.slice(3)) : e164

const nomeDe = (e: { nomeFantasia: string | null; razaoSocial: string }): string =>
  e.nomeFantasia ?? e.razaoSocial

/**
 * A aba Histórico da ficha do contato: a auditoria do contato em português (quem, quando, o que mudou, com
 * nomes no lugar de ids). O mais recente primeiro. Quem vê o contato vê o histórico dele, **menos** as
 * linhas que citam uma empresa que o usuário não vê (o vendedor não descobre a carteira dos outros).
 */
/** Os nomes das tags gravados na auditoria, separados por vírgula; nulo se não há nenhum. */
const listaDeNomes = (v: unknown): string | null =>
  Array.isArray(v) && v.length > 0 ? v.map(String).join(', ') : null

@Injectable()
export class HistoricoDoContatoService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async listar(contatoId: string, consulta: ConsultaDoHistorico): Promise<HistoricoDaEmpresa> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [contato] = await db
      .select({ id: contatos.id })
      .from(contatos)
      .where(
        and(
          eq(contatos.id, contatoId),
          isNull(contatos.excluidoEm),
          condicaoDeVisibilidadeDoContato(escopo),
        ),
      )
    if (!contato) throw new ErroApi('contato_nao_encontrado', 'Contato não encontrado.', 404)

    // Empresas ligadas ao contato que o usuário NÃO vê: as linhas que as citam (por id ou por nome) somem
    const ligadas = await db
      .select({
        id: empresas.id,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        vista: sql<boolean>`(${condicaoDeVisibilidade(escopo) ?? sql`true`})`,
      })
      .from(empresaContatos)
      .innerJoin(empresas, eq(empresas.id, empresaContatos.empresaId))
      .where(eq(empresaContatos.contatoId, contatoId))
    const escondidas = ligadas.filter((e) => !e.vista)
    const idsEscondidos = escondidas.map((e) => e.id)
    const nomesVistos = new Set(ligadas.filter((e) => e.vista).map(nomeDe))
    const nomesEscondidos = [...new Set(escondidas.map(nomeDe))].filter((n) => !nomesVistos.has(n))
    const lista = (itens: string[]) =>
      sql`ARRAY[${sql.join(
        itens.map((i) => sql`${i}`),
        sql`, `,
      )}]::text[]`
    const visivel = sql`${
      idsEscondidos.length > 0
        ? sql`COALESCE(a.alteracoes->>'empresaId', '') <> ALL(${lista(idsEscondidos)})`
        : sql`true`
    } AND ${
      nomesEscondidos.length > 0
        ? sql`COALESCE(a.alteracoes->>'empresa', '') <> ALL(${lista(nomesEscondidos)})`
        : sql`true`
    }`

    const filtro = sql`a.entidade = 'contato' AND a.entidade_id = ${contatoId} AND ${visivel}`
    const [contagem] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM auditoria a WHERE ${filtro}`,
    )
    const linhas = await db.execute<LinhaBruta>(sql`
      SELECT 'a' || a.id::text AS id, a.em, a.membro_id, a.acao, a.alteracoes
        FROM auditoria a WHERE ${filtro}
       ORDER BY a.em DESC, a.id DESC
       LIMIT ${consulta.porPagina} OFFSET ${(consulta.pagina - 1) * consulta.porPagina}`)
    const nomes = await this.nomesCitados(linhas)

    return {
      itens: linhas.map((l) => this.entrada(l, nomes)),
      total: contagem?.n ?? 0,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    }
  }

  /** Nomes de quem fez (membros), dos papéis na decisão e das empresas que as linhas citam por id. */
  private async nomesCitados(linhas: LinhaBruta[]) {
    const db = this.ctx.db()
    const membroIds = new Set<string>()
    const papelIds = new Set<string>()
    const empresaIds = new Set<string>()
    const cita = (alvo: Set<string>, v: unknown) => {
      if (typeof v === 'string') alvo.add(v)
    }
    for (const l of linhas) {
      cita(membroIds, l.membro_id)
      const alteracoes = registro(l.alteracoes)
      cita(empresaIds, alteracoes['empresaId'])
      const { de, para } = registro(alteracoes['papelDecisaoId'])
      cita(papelIds, de)
      cita(papelIds, para)
    }
    const [m, p, e] = await Promise.all([
      membroIds.size
        ? db
            .select({ id: membros.id, nome: membros.nome })
            .from(membros)
            .where(inArray(membros.id, [...membroIds]))
        : [],
      papelIds.size
        ? db
            .select({ id: papeisDecisao.id, nome: papeisDecisao.nome })
            .from(papeisDecisao)
            .where(inArray(papeisDecisao.id, [...papelIds]))
        : [],
      empresaIds.size
        ? db
            .select({
              id: empresas.id,
              razaoSocial: empresas.razaoSocial,
              nomeFantasia: empresas.nomeFantasia,
            })
            .from(empresas)
            .where(inArray(empresas.id, [...empresaIds]))
        : [],
    ])
    return {
      membro: new Map<string, string>(m.map((x) => [x.id, x.nome])),
      papel: new Map<string, string>(p.map((x) => [x.id, x.nome])),
      empresa: new Map<string, string>(e.map((x) => [x.id, nomeDe(x)])),
    }
  }

  private entrada(
    l: LinhaBruta,
    nomes: Awaited<ReturnType<typeof this.nomesCitados>>,
  ): EntradaDoHistorico {
    const alteracoes = registro(l.alteracoes)
    const base = {
      id: l.id,
      em: new Date(l.em).toISOString(),
      por: {
        id: l.membro_id,
        nome: l.membro_id ? (nomes.membro.get(l.membro_id) ?? 'Alguém da equipe') : 'Sistema',
      },
      automatica: l.membro_id === null,
    }
    const valor = (campo: string, v: unknown): string | null => {
      if (v === null || v === undefined || v === '') return null
      switch (campo) {
        case 'papelDecisaoId':
          return typeof v === 'string' ? (nomes.papel.get(v) ?? 'Papel removido') : null
        case 'aceitaWhatsapp':
        case 'aceitaEmail':
        case 'principal':
          return v === true ? 'Sim' : 'Não'
        case 'ativo':
          return v === true ? 'Ativo' : 'Inativo'
        case 'telefones':
          return Array.isArray(v)
            ? v.map((t) => telefoneLegivel(comoTexto(t))).join(', ') || null
            : null
        case 'emails':
          return Array.isArray(v) ? v.map(comoTexto).join(', ') || null : null
        default:
          return comoTexto(v)
      }
    }
    const empresaCitada =
      typeof alteracoes['empresa'] === 'string'
        ? alteracoes['empresa']
        : typeof alteracoes['empresaId'] === 'string'
          ? (nomes.empresa.get(alteracoes['empresaId']) ?? null)
          : null

    switch (l.acao) {
      case 'criar': {
        const mudancas: Mudanca[] = []
        const cargo = valor('cargo', alteracoes['cargo'])
        if (empresaCitada) {
          mudancas.push({ campo: 'empresa', rotulo: 'Empresa', de: null, para: empresaCitada })
        }
        if (cargo) mudancas.push({ campo: 'cargo', rotulo: 'Cargo', de: null, para: cargo })
        const tags = listaDeNomes(alteracoes['tags'])
        if (tags) mudancas.push({ campo: 'tags', rotulo: 'Tags', de: null, para: tags })
        return {
          ...base,
          titulo:
            alteracoes['origem'] === 'socio' ? 'Criado a partir de sócio' : 'Contato cadastrado',
          mudancas,
        }
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
        const soConsentimento =
          mudancas.length > 0 && mudancas.every((m) => CAMPOS_DE_CONSENTIMENTO.has(m.campo))
        return {
          ...base,
          titulo: soConsentimento ? 'Consentimento alterado' : 'Dados alterados',
          mudancas,
        }
      }
      case 'vincular':
      case 'reativar_vinculo': {
        const mudancas: Mudanca[] = []
        const cargo = valor('cargo', alteracoes['cargo'])
        if (cargo) mudancas.push({ campo: 'cargo', rotulo: 'Cargo', de: null, para: cargo })
        if (alteracoes['principal'] === true) {
          mudancas.push({ campo: 'principal', rotulo: 'Contato principal', de: null, para: 'Sim' })
        }
        const quando = l.acao === 'vincular' ? 'Vinculado a' : 'Vínculo reativado com'
        return { ...base, titulo: `${quando} ${empresaCitada ?? 'uma empresa'}`, mudancas }
      }
      case 'alterar_vinculo': {
        const mudancas = Object.entries(alteracoes)
          .filter(([campo]) => campo !== 'empresa')
          .map(([campo, v]): Mudanca => {
            const { de, para } = registro(v)
            return {
              campo,
              rotulo: ROTULOS[campo] ?? campo,
              de: valor(campo, de),
              para: valor(campo, para),
            }
          })
        const soSituacao = mudancas.length === 1 && mudancas[0]?.campo === 'ativo'
        const inativou = soSituacao && mudancas[0]?.para === 'Inativo'
        const nome = empresaCitada ?? 'uma empresa'
        const titulo = soSituacao
          ? inativou
            ? `Vínculo com ${nome} inativado`
            : `Vínculo com ${nome} reativado`
          : `Vínculo com ${nome} alterado`
        return { ...base, titulo, mudancas: soSituacao ? [] : mudancas }
      }
      case 'alterar_tags': {
        const mudancas: Mudanca[] = []
        const adicionadas = listaDeNomes(alteracoes['adicionadas'])
        const removidas = listaDeNomes(alteracoes['removidas'])
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
        return { ...base, titulo: 'Contato excluído', mudancas: [] }
      default:
        return { ...base, titulo: l.acao, mudancas: [] }
    }
  }
}
