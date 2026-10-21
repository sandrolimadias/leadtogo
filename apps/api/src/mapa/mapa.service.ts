import { HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { novoId, sql } from '@leadtogo/db'
import {
  type AlterarEntradaDaLegenda,
  CHAVE_SEM_VISITA,
  CHAVE_VISITA_TENTADA,
  chaveDaTagNaLegenda,
  type ChipDoMapa,
  COR_DO_MAPA_DA_TAG,
  type CorDoMapa,
  type CoberturaDoMapa,
  type ConsultaDePontos,
  type ConsultaDeProximas,
  DIAS_SEM_VISITA_DO_ESTADO,
  type EntradaDaLegenda,
  type FiltrosDoMapa,
  type LegendaDoMapa,
  type ListaDeSelecao,
  type OpcoesDoMapa,
  PALETA_DO_MAPA,
  type PontoDoMapa,
  type PontosDoMapa,
  type SelecaoDoMapa,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { escopoDaCarteira } from '../carteira/regras-de-carteira.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { RegioesGeoService } from '../geolocalizacao/regioes.service.js'
import { ErroApi } from '../http/erro-api.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import {
  condicoesDosFiltros,
  DAS_EMPRESAS_DO_MAPA,
  DAS_EMPRESAS_DA_AREA,
  empresasNaArea,
  ESTADO_DO_PIN,
  LIMITE_DE_LEADS,
  visivelAoUsuario,
} from './filtros.js'

/**
 * Até quantos pontos a API devolve por pedido (~110 bytes cada: ~0,5 MB no máximo). O navegador os agrupa em
 * bolhas; acima disso, `truncado` avisa para aproximar o mapa.
 */
const LIMITE_DE_PONTOS = 5000
/** Até quantas empresas na caixa o plano parte da caixa (índice espacial); acima disso, o plano clássico... */
const CAIXA_PEQUENA_MINIMA = 3000
/** ...ou até esta fração da tabela (estimativa do Postgres): a busca por empresa custa ~2,5x o plano clássico por linha. */
const CAIXA_PEQUENA_FRACAO = 0.4
const LIMITE_DA_SELECAO = 500

const NOME_DOS_FIXOS: Record<string, { nome: string; cor: CorDoMapa; regra: string }> = {
  [CHAVE_VISITA_TENTADA]: {
    nome: 'Visita tentada',
    cor: 'indigo',
    regra:
      'A visita foi tentada e a empresa não foi localizada: volta ao grupo das nunca visitadas. Só passa a existir com o check-in da visita.',
  },
  [CHAVE_SEM_VISITA]: {
    nome: `Sem visita há ${DIAS_SEM_VISITA_DO_ESTADO}+ dias`,
    cor: 'alerta',
    regra: `Cliente sem visita realizada há ${DIAS_SEM_VISITA_DO_ESTADO} dias ou mais (ou nunca visitado). Vale sobre a cor do Status.`,
  },
}

type LinhaDeTag = {
  id: string
  nome: string
  cor: string
  chave_sistema: string | null
  visivel_ao_abrir: boolean
}

const eAdmin = (ctx: ContextoTenantService) => ctx.membro.papel === 'admin'

/** O mapa (G2): opções e legenda, pontos por área, próximas, seleção e cobertura por município. */
@Injectable()
export class MapaService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly regioes: RegioesGeoService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    @Inject(ARMAZENAMENTO) private readonly s3: S3Client,
  ) {}

  // ---- Legenda ----

  private async tagsDeStatusDoMapa(): Promise<LinhaDeTag[]> {
    return this.ctx.db().execute<LinhaDeTag>(sql`
      SELECT t.id, t.nome, t.cor, t.chave_sistema, t.visivel_ao_abrir
      FROM tags t JOIN tag_grupos g ON g.id = t.tag_grupo_id AND g.chave_sistema = 'status'
      WHERE t.excluido_em IS NULL AND t.ativo AND t.aparece_no_mapa
      ORDER BY t.ordem, t.nome`)
  }

  private async personalizadas(): Promise<Map<string, { cor: string; nome: string | null }>> {
    const linhas = await this.ctx
      .db()
      .execute<{ chave: string; cor: string; nome: string | null }>(
        sql`SELECT chave, cor, nome FROM mapa_legenda WHERE excluido_em IS NULL`,
      )
    return new Map(linhas.map((l) => [l.chave, { cor: l.cor, nome: l.nome }]))
  }

  async legenda(): Promise<LegendaDoMapa> {
    const [tags, personalizadas] = await Promise.all([
      this.tagsDeStatusDoMapa(),
      this.personalizadas(),
    ])
    const entradas: EntradaDaLegenda[] = []
    const montar = (
      chave: string,
      fixa: boolean,
      nomePadrao: string,
      corPadrao: CorDoMapa,
      regra: string,
    ) => {
      const p = personalizadas.get(chave)
      const corValida = PALETA_DO_MAPA.some((c) => c.chave === p?.cor)
      entradas.push({
        chave,
        fixa,
        nomePadrao,
        corPadrao,
        nome: p?.nome?.trim() ? p.nome : nomePadrao,
        cor: corValida ? (p?.cor as CorDoMapa) : corPadrao,
        personalizada: Boolean(p && (corValida || p.nome?.trim())),
        regra,
      })
    }
    for (const t of tags) {
      montar(
        chaveDaTagNaLegenda(t.id),
        false,
        t.nome,
        COR_DO_MAPA_DA_TAG[t.cor] ?? 'cinza',
        `Empresa com o Status ${t.nome}.`,
      )
    }
    for (const chave of [CHAVE_SEM_VISITA, CHAVE_VISITA_TENTADA]) {
      const f = NOME_DOS_FIXOS[chave]
      if (f) montar(chave, true, f.nome, f.cor, f.regra)
    }
    return { entradas }
  }

  /** Cor e nome de um estado da legenda (só o administrador). Nome vazio volta ao padrão. */
  async alterarEntrada(chave: string, dados: AlterarEntradaDaLegenda): Promise<LegendaDoMapa> {
    if (!eAdmin(this.ctx)) {
      throw new ErroApi('acesso_negado', 'Só administradores mudam a legenda do mapa.', 403)
    }
    const atual = (await this.legenda()).entradas.find((e) => e.chave === chave)
    if (!atual) throw new ErroApi('estado_nao_encontrado', 'Estado da legenda não encontrado.', 404)
    const cor = dados.cor ?? atual.cor
    const nome =
      dados.nome === undefined
        ? atual.nome === atual.nomePadrao
          ? null
          : atual.nome
        : dados.nome?.trim() || null
    await this.ctx.db().execute(sql`
      INSERT INTO mapa_legenda (id, tenant_id, chave, cor, nome, criado_por, atualizado_por)
      VALUES (${novoId()}, ${this.ctx.tenantId}, ${chave}, ${cor}, ${nome}, ${this.ctx.membro.id}, ${this.ctx.membro.id})
      ON CONFLICT (tenant_id, chave) DO UPDATE
        SET cor = excluded.cor, nome = excluded.nome, excluido_em = NULL,
            atualizado_por = excluded.atualizado_por, atualizado_em = now()`)
    await this.auditoria.registrar({
      entidade: 'mapa_legenda',
      acao: 'alterar',
      alteracoes: { chave, cor, nome },
    })
    return this.legenda()
  }

  /** "Restaurar padrão": apaga todas as personalizações da legenda do tenant. */
  async restaurarLegenda(): Promise<LegendaDoMapa> {
    if (!eAdmin(this.ctx)) {
      throw new ErroApi('acesso_negado', 'Só administradores mudam a legenda do mapa.', 403)
    }
    await this.ctx.db().execute(sql`DELETE FROM mapa_legenda`)
    await this.auditoria.registrar({ entidade: 'mapa_legenda', acao: 'restaurar_padrao' })
    return this.legenda()
  }

  // ---- Opções (chips, filtros, centro) ----

  private async mapaInstalado(): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.config.S3_BUCKET,
          Key: this.config.GEO_PMTILES_CHAVE,
        }),
      )
      return true
    } catch {
      return false
    }
  }

  async opcoes(): Promise<OpcoesDoMapa> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const uf = this.config.GEO_UF.toUpperCase()
    const { entradas } = await this.legenda()
    const tags = await this.tagsDeStatusDoMapa()
    const contagens = await db.execute<{ tag_id: string; n: number }>(sql`
      SELECT t.id AS tag_id, count(*)::int AS n ${DAS_EMPRESAS_DO_MAPA}
      WHERE e.excluido_em IS NULL AND e.localizacao IS NOT NULL AND e.pais_codigo IS NULL AND ${visivelAoUsuario(escopo)}
      GROUP BY t.id`)
    const totalPorTag = new Map(contagens.map((c) => [c.tag_id, c.n]))
    const chips: ChipDoMapa[] = tags.map((t) => {
      const e = entradas.find((x) => x.chave === chaveDaTagNaLegenda(t.id))
      return {
        tagId: t.id,
        chave: t.chave_sistema ?? '',
        nome: e?.nome ?? t.nome,
        cor: e?.cor ?? 'cinza',
        ligadoAoAbrir: t.visivel_ao_abrir,
        total: totalPorTag.get(t.id) ?? 0,
        porLote: t.chave_sistema === 'lead',
      }
    })
    const vendedores = escopo.veTodas
      ? await db.execute<{ id: string; nome: string }>(
          sql`SELECT id, nome FROM membros WHERE ativo AND excluido_em IS NULL ORDER BY nome`,
        )
      : []
    const cidades = await db.execute<{ codigo_ibge: number; nome: string }>(sql`
      SELECT DISTINCT m.codigo_ibge, m.nome
      FROM empresas e JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
      WHERE e.excluido_em IS NULL AND e.localizacao IS NOT NULL AND ${visivelAoUsuario(escopo)}
      ORDER BY m.nome`)
    const regioes = (await this.regioes.listar({ uf })).map((r) => ({ id: r.id, nome: r.nome }))
    const lotes = await db.execute<{ id: string; nome: string; n: number }>(sql`
      SELECT i.id, i.nome, count(*)::int AS n
      FROM importacoes i
      JOIN empresas e ON e.importacao_id = i.id AND e.excluido_em IS NULL AND e.localizacao IS NOT NULL
      JOIN empresa_tags st ON st.empresa_id = e.id
      JOIN tags t ON t.id = st.tag_id AND t.chave_sistema = 'lead' AND t.aparece_no_mapa
      WHERE i.tipo = 'empresas' AND i.excluido_em IS NULL AND ${visivelAoUsuario(escopo)}
      GROUP BY i.id, i.nome, i.criado_em
      ORDER BY i.criado_em DESC LIMIT 30`)
    const [centro] = await db.execute<{ lat: number | null; lon: number | null }>(sql`
      SELECT avg(ST_Y(e.localizacao::geometry)) AS lat, avg(ST_X(e.localizacao::geometry)) AS lon
      FROM empresas e
      WHERE e.excluido_em IS NULL AND e.localizacao IS NOT NULL AND ${visivelAoUsuario(escopo)}`)
    const [doEstado] = await db.execute<{ lat: number | null; lon: number | null }>(sql`
      SELECT avg(ST_Y(localizacao)) AS lat, avg(ST_X(localizacao)) AS lon FROM municipios WHERE uf = ${uf}`)
    const temPontos = centro?.lat != null && centro.lon != null
    const base = temPontos ? centro : doEstado
    return {
      uf,
      chips,
      legenda: entradas,
      vendedores,
      cidades: cidades.map((c) => ({ codigoIbge: c.codigo_ibge, nome: c.nome })),
      regioes,
      lotesDeLeads: lotes.map((l) => ({ id: l.id, nome: l.nome, comCoordenada: l.n })),
      limiteDeLeads: LIMITE_DE_LEADS,
      centroInicial: {
        latitude: base?.lat ?? -14,
        longitude: base?.lon ?? -52,
        zoom: temPontos ? 9 : base?.lat != null ? 7 : 4,
      },
      mapaInstalado: await this.mapaInstalado(),
    }
  }

  // ---- Pontos ----

  private async municipiosDaRegiao(f: Pick<FiltrosDoMapa, 'regiaoId'>): Promise<number[] | null> {
    if (!f.regiaoId) return null
    const r = await this.regioes.resolverEscopo({ tipo: 'regiao', id: f.regiaoId })
    return r.municipios
  }

  async pontos(consulta: ConsultaDePontos): Promise<PontosDoMapa> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const filtros = condicoesDosFiltros(consulta, escopo, await this.municipiosDaRegiao(consulta))
    const area = sql`e.localizacao && ST_MakeEnvelope(${consulta.oeste}, ${consulta.sul}, ${consulta.leste}, ${consulta.norte}, 4326)::geography`
    // Quantas empresas estão na caixa (sem joins: o índice espacial responde rápido). Define o plano:
    // caixa pequena = parte da CAIXA (índice espacial) e busca o Status de cada empresa pela chave; caixa grande
    // (o estado todo) = o plano clássico, com joins por hash, que aí é mais rápido que milhares de buscas.
    const [pre] = await db.execute<{ n: number; tabela: number }>(
      sql`SELECT count(*)::int AS n,
                 (SELECT greatest(reltuples, 0)::float8 FROM pg_class WHERE oid = 'public.empresas'::regclass) AS tabela
          FROM empresas e
          WHERE e.excluido_em IS NULL AND e.localizacao IS NOT NULL AND e.pais_codigo IS NULL AND ${area}`,
    )
    const caixaPequena =
      (pre?.n ?? 0) <= Math.max(CAIXA_PEQUENA_MINIMA, CAIXA_PEQUENA_FRACAO * (pre?.tabela ?? 0))
    const [com, de] = caixaPequena
      ? [empresasNaArea(area), DAS_EMPRESAS_DA_AREA]
      : [sql``, sql`${DAS_EMPRESAS_DO_MAPA}`]
    const ondeArea = caixaPequena ? sql`TRUE` : area

    // Uma consulta só: os pontos (com o limite) e, nas mesmas linhas, os totais da área inteira por janela
    // (empresas, leads e se há coordenada do CNEFE). Eram duas consultas com os mesmos joins; juntas, cada
    // pedido gasta metade do tempo no banco. O ponto traz só o que o pin precisa (id, posição, estado e visto);
    // o agrupamento em bolhas é do navegador. Passou do limite do pedido: vem uma amostra espalhada (ordem por
    // hash do id: estável entre pedidos, sem favorecer as empresas mais antigas) e `truncado` avisa para
    // aproximar o mapa.
    const colunas = sql`e.id, ST_Y(e.localizacao::geometry) AS lat, ST_X(e.localizacao::geometry) AS lon,
               ${ESTADO_DO_PIN} AS estado, e.ultima_visita_em IS NOT NULL AS visitada,
               t.chave_sistema = 'lead' AS lead,
               (count(*) OVER ())::int AS total,
               (count(*) FILTER (WHERE t.chave_sistema = 'lead') OVER ())::int AS leads_total,
               bool_or(e.geo_origem = 'cnefe') OVER () AS cnefe`
    // Sem lote escolhido não há lead nenhum no resultado (a condição dos filtros os exclui): dispensa a janela
    // que numera os leads
    const linhas = await db.execute<{
      id: string
      lat: number
      lon: number
      estado: string
      visitada: boolean
      lead: boolean
      total: number
      leads_total: number
      cnefe: boolean
    }>(
      consulta.lotes.length === 0
        ? sql`${com}
              SELECT ${colunas} ${de} WHERE ${filtros} AND ${ondeArea}
              ORDER BY hashtext(e.id::text), e.id LIMIT ${LIMITE_DE_PONTOS}`
        : sql`${com}
      SELECT id, lat, lon, estado, visitada, lead, total, leads_total, cnefe FROM (
        SELECT ${colunas},
               row_number() OVER (PARTITION BY (t.chave_sistema = 'lead') ORDER BY e.id) AS ordem_lead
        ${de}
        WHERE ${filtros} AND ${ondeArea}
      ) x
      WHERE NOT lead OR ordem_lead <= ${LIMITE_DE_LEADS}
      ORDER BY hashtext(id::text), id
      LIMIT ${LIMITE_DE_PONTOS}`,
    )
    const total = linhas[0]?.total ?? 0
    const leadsTotal = linhas[0]?.leads_total ?? 0
    // Peso do pedido: a posição com 6 casas (11 cm) e o estado como posição numa lista curta
    const estados: string[] = []
    const arredondar = (v: number) => Math.round(v * 1e6) / 1e6
    const pontos: PontoDoMapa[] = linhas.map((r) => {
      let i = estados.indexOf(r.estado)
      if (i < 0) i = estados.push(r.estado) - 1
      return {
        id: r.id,
        latitude: arredondar(r.lat),
        longitude: arredondar(r.lon),
        estado: i,
        visitada: r.visitada,
      }
    })
    return {
      total,
      pontos,
      estados,
      truncado: total - Math.max(0, leadsTotal - LIMITE_DE_LEADS) > pontos.length,
      limite: LIMITE_DE_PONTOS,
      comCnefe: linhas[0]?.cnefe ?? false,
      leads: {
        mostrados: Math.min(leadsTotal, LIMITE_DE_LEADS),
        total: leadsTotal,
        limite: LIMITE_DE_LEADS,
      },
    }
  }

  // ---- Próximas e seleção ----

  private async listaPorDistancia(
    f: Omit<FiltrosDoMapa, 'busca'>,
    centro: { latitude: number; longitude: number },
    raioM: number,
    incluirVisitadas: boolean,
    excluirId: string | undefined,
    ordenarPorDistancia: boolean,
  ): Promise<ListaDeSelecao> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const filtros = condicoesDosFiltros(f, escopo, await this.municipiosDaRegiao(f), true)
    const ponto = sql`ST_SetSRID(ST_MakePoint(${centro.longitude}, ${centro.latitude}), 4326)::geography`
    const condicao = sql`${filtros} AND ST_DWithin(e.localizacao, ${ponto}, ${raioM})
      ${incluirVisitadas ? sql`` : sql`AND e.ultima_visita_em IS NULL`}
      ${excluirId ? sql`AND e.id <> ${excluirId}` : sql``}`
    const [c] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n ${DAS_EMPRESAS_DO_MAPA} WHERE ${condicao}`,
    )
    const linhas = await db.execute<{
      id: string
      nome: string
      cidade: string | null
      lat: number
      lon: number
      estado: string
      visitada: boolean
      distancia: number
    }>(sql`
      SELECT e.id, coalesce(e.nome_fantasia, e.razao_social) AS nome, m.nome AS cidade,
             ST_Y(e.localizacao::geometry) AS lat, ST_X(e.localizacao::geometry) AS lon,
             ${ESTADO_DO_PIN} AS estado, e.ultima_visita_em IS NOT NULL AS visitada,
             ST_Distance(e.localizacao, ${ponto}) AS distancia
      ${DAS_EMPRESAS_DO_MAPA}
      WHERE ${condicao}
      ORDER BY ${ordenarPorDistancia ? sql`ST_Distance(e.localizacao, ${ponto})` : sql`nome`}, e.id
      LIMIT ${LIMITE_DA_SELECAO}`)
    return {
      total: c?.n ?? 0,
      limite: LIMITE_DA_SELECAO,
      itens: linhas.map((r) => ({
        id: r.id,
        nome: r.nome,
        cidade: r.cidade,
        latitude: r.lat,
        longitude: r.lon,
        estado: r.estado,
        visitada: r.visitada,
        distanciaM: Math.round(r.distancia),
      })),
    }
  }

  /** "Empresas próximas" (2, 5, 10, 25 km): por padrão, sem as já visitadas. */
  async proximas(c: ConsultaDeProximas): Promise<ListaDeSelecao> {
    const { latitude, longitude, raioKm, incluirVisitadas, excluirEmpresaId, ...filtros } = c
    return this.listaPorDistancia(
      filtros,
      { latitude, longitude },
      raioKm * 1000,
      incluirVisitadas === 'true',
      excluirEmpresaId,
      true,
    )
  }

  /** Seleção por retângulo ou por raio, para listar, abrir ou aplicar tag. */
  async selecao(s: SelecaoDoMapa): Promise<ListaDeSelecao> {
    const filtros = {
      statusTagIds: [],
      lotes: [],
      ...s.filtros,
    } as Omit<FiltrosDoMapa, 'busca'>
    if (s.tipo === 'raio') {
      return this.listaPorDistancia(
        filtros,
        { latitude: s.latitude, longitude: s.longitude },
        s.raioKm * 1000,
        s.incluirVisitadas,
        undefined,
        true,
      )
    }
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const f = condicoesDosFiltros(filtros, escopo, await this.municipiosDaRegiao(filtros), true)
    const condicao = sql`${f}
      AND e.localizacao && ST_MakeEnvelope(${s.oeste}, ${s.sul}, ${s.leste}, ${s.norte}, 4326)::geography
      ${s.incluirVisitadas ? sql`` : sql`AND e.ultima_visita_em IS NULL`}`
    const [c] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n ${DAS_EMPRESAS_DO_MAPA} WHERE ${condicao}`,
    )
    const linhas = await db.execute<{
      id: string
      nome: string
      cidade: string | null
      lat: number
      lon: number
      estado: string
      visitada: boolean
    }>(sql`
      SELECT e.id, coalesce(e.nome_fantasia, e.razao_social) AS nome, m.nome AS cidade,
             ST_Y(e.localizacao::geometry) AS lat, ST_X(e.localizacao::geometry) AS lon,
             ${ESTADO_DO_PIN} AS estado, e.ultima_visita_em IS NOT NULL AS visitada
      ${DAS_EMPRESAS_DO_MAPA}
      WHERE ${condicao}
      ORDER BY nome, e.id LIMIT ${LIMITE_DA_SELECAO}`)
    return {
      total: c?.n ?? 0,
      limite: LIMITE_DA_SELECAO,
      itens: linhas.map((r) => ({
        id: r.id,
        nome: r.nome,
        cidade: r.cidade,
        latitude: r.lat,
        longitude: r.lon,
        estado: r.estado,
        visitada: r.visitada,
        distanciaM: null,
      })),
    }
  }

  // ---- Cobertura por município ----

  async cobertura(): Promise<CoberturaDoMapa> {
    const escopo = await escopoDaCarteira(this.ctx)
    const linhas = await this.ctx.db().execute<{
      codigo_ibge: number
      nome: string
      lat: number
      lon: number
      total: number
      visitadas: number
    }>(sql`
      SELECT m.codigo_ibge, m.nome, ST_Y(m.localizacao) AS lat, ST_X(m.localizacao) AS lon,
             count(*)::int AS total, count(*) FILTER (WHERE e.ultima_visita_em IS NOT NULL)::int AS visitadas
      ${DAS_EMPRESAS_DO_MAPA}
      WHERE e.excluido_em IS NULL AND e.localizacao IS NOT NULL AND e.pais_codigo IS NULL
        AND t.chave_sistema IN ('cliente', 'prospect') AND m.localizacao IS NOT NULL
        AND ${visivelAoUsuario(escopo)}
      GROUP BY m.codigo_ibge, m.nome, m.localizacao
      ORDER BY m.nome`)
    return {
      municipios: linhas.map((l) => ({
        codigoIbge: l.codigo_ibge,
        nome: l.nome,
        latitude: l.lat,
        longitude: l.lon,
        total: l.total,
        visitadas: l.visitadas,
        faltam: l.total - l.visitadas,
      })),
    }
  }
}
