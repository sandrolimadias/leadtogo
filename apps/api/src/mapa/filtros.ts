import { sql, type SQL } from '@leadtogo/db'
import { CHAVE_SEM_VISITA, DIAS_SEM_VISITA_DO_ESTADO, type FiltrosDoMapa } from '@leadtogo/shared'

import { condicaoDeResponsaveis, type EscopoDaCarteira } from '../carteira/regras-de-carteira.js'
import { arraySql } from '../importacao/sql-array.js'
import { inteirosSql } from '../geolocalizacao/sql-inteiros.js'

/** Máximo de leads mostrados por vez (docs/plano_geolocalizacao.md, G2). */
export const LIMITE_DE_LEADS = 500

/** A visibilidade da carteira: o mesmo alcance de `empresas.ver` da lista de empresas. */
export const visivelAoUsuario = (escopo: EscopoDaCarteira): SQL =>
  condicaoDeResponsaveis(escopo.empresas.ver, sql`e.vendedor_id`) ?? sql`TRUE`

/**
 * Empresas que podem ir ao mapa: com coordenada, no Brasil, e com uma tag de Status que "aparece no
 * mapa" (Inativo, por padrão, não). Devolve a tag de Status como `t` e o município como `m`.
 */
export const DAS_EMPRESAS_DO_MAPA = sql`
  FROM empresas e
  JOIN empresa_tags st ON st.empresa_id = e.id
  JOIN tags t ON t.id = st.tag_id AND t.aparece_no_mapa AND t.ativo AND t.excluido_em IS NULL
  JOIN tag_grupos g ON g.id = t.tag_grupo_id AND g.chave_sistema = 'status'
  LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo`

/**
 * A caixa primeiro: as empresas da área saem pelo índice espacial (GiST de `localizacao`) numa CTE MATERIALIZED, e só
 * elas entram nos joins de `DAS_EMPRESAS_DA_AREA`. Sem isto o Postgres começava pelas tags (metade da carteira),
 * ordenava tudo e provava a caixa empresa por empresa: custo proporcional à carteira inteira, mesmo numa caixa de um
 * bairro (360 ms com 100 mil empresas, 14 ms com 6 mil). `MATERIALIZED` fixa a ordem (o `OFFSET 0` não fixava: o
 * Postgres relia a tabela a cada linha das tags). O RLS continua valendo (a CTE lê `empresas`).
 */
export const empresasNaArea = (area: SQL): SQL => sql`
  WITH na_area AS MATERIALIZED (
    SELECT * FROM empresas e
    WHERE e.excluido_em IS NULL AND e.localizacao IS NOT NULL AND e.pais_codigo IS NULL AND ${area})`

/**
 * Os joins das empresas da CTE `na_area` (usar depois de `empresasNaArea`). A tag de Status entra por LATERAL: para
 * cada empresa da CAIXA, uma busca pela chave (empresa_id, tag_id). O Postgres estima 1 linha para `empresa_tags`
 * (a política de RLS, com `OR`, esconde a seletividade) e, sem isto, relia a CTE inteira a cada linha das tags. O
 * `LIMIT 1` (a empresa tem um Status só) impede o Postgres de desfazer o LATERAL e voltar a essa ordem.
 */
export const DAS_EMPRESAS_DA_AREA = sql`
  FROM na_area e
  JOIN LATERAL (
    SELECT t.id, t.chave_sistema
    FROM empresa_tags st
    JOIN tags t ON t.id = st.tag_id AND t.aparece_no_mapa AND t.ativo AND t.excluido_em IS NULL
    JOIN tag_grupos g ON g.id = t.tag_grupo_id AND g.chave_sistema = 'status'
    WHERE st.empresa_id = e.id
    LIMIT 1
  ) t ON TRUE
  LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo`

const BASE = sql`e.excluido_em IS NULL AND e.localizacao IS NOT NULL AND e.pais_codigo IS NULL`

/** O estado que pinta o pin: "sem visita há 60+ dias" prevalece sobre a cor da tag (só Clientes). */
export const ESTADO_DO_PIN = sql`
  CASE WHEN t.chave_sistema = 'cliente'
        AND (e.ultima_visita_em IS NULL OR e.ultima_visita_em < now() - make_interval(days => ${DIAS_SEM_VISITA_DO_ESTADO}))
       THEN ${CHAVE_SEM_VISITA} ELSE 'tag:' || t.id::text END`

/** `lead` só aparece pelo lote de importação (e até o limite): nenhum lote escolhido = nenhum lead. */
function condicaoDeLeads(f: FiltrosDoMapa): SQL {
  return f.lotes.length > 0
    ? sql`(t.chave_sistema IS DISTINCT FROM 'lead' OR e.importacao_id = ANY(${arraySql(f.lotes, 'uuid')}))`
    : sql`(t.chave_sistema IS DISTINCT FROM 'lead')`
}

/** Os filtros do mapa como condições SQL sobre `e`, `t` e `m` (sem a área visível). */
export function condicoesDosFiltros(
  f: Omit<FiltrosDoMapa, 'busca'> & { busca?: string | undefined },
  escopo: EscopoDaCarteira,
  regioesDoFiltro: number[] | null,
  /** Próximas e seleção: sem nenhum Status escolhido vale "todos"; no mapa, tudo desligado é nada */
  semStatusVaiTudo = false,
): SQL {
  const partes: SQL[] = [BASE, visivelAoUsuario(escopo), condicaoDeLeads(f)]
  if (f.statusTagIds.length > 0) {
    partes.push(sql`t.id = ANY(${arraySql(f.statusTagIds, 'uuid')})`)
  } else if (!semStatusVaiTudo) {
    partes.push(sql`FALSE`) // todos os chips desligados: nada a mostrar
  }
  if (f.busca) {
    const q = `%${f.busca.toLocaleLowerCase('pt-BR')}%`
    partes.push(
      sql`(lower(f_unaccent(e.razao_social)) LIKE f_unaccent(${q}) OR lower(f_unaccent(coalesce(e.nome_fantasia, ''))) LIKE f_unaccent(${q})
        OR lower(f_unaccent(coalesce(e.bairro, ''))) LIKE f_unaccent(${q}) OR lower(f_unaccent(coalesce(m.nome, ''))) LIKE f_unaccent(${q}))`,
    )
  }
  switch (f.visitada) {
    case 'alguma_vez':
      partes.push(sql`e.ultima_visita_em IS NOT NULL`)
      break
    case 'nunca':
      partes.push(sql`e.ultima_visita_em IS NULL`)
      break
    case '90_dias':
      partes.push(sql`e.ultima_visita_em >= now() - interval '90 days'`)
      break
    case 'periodo':
      if (f.visitaDe) partes.push(sql`e.ultima_visita_em >= ${f.visitaDe}::date`)
      if (f.visitaAte) partes.push(sql`e.ultima_visita_em < (${f.visitaAte}::date + 1)`)
      break
    default:
  }
  if (f.vendedorId) partes.push(sql`e.vendedor_id = ${f.vendedorId}`)
  if (f.semVisitaDias) {
    partes.push(
      sql`t.chave_sistema IN ('cliente', 'prospect')
        AND (e.ultima_visita_em IS NULL OR e.ultima_visita_em < now() - make_interval(days => ${f.semVisitaDias}))`,
    )
  }
  if (f.municipioCodigo) partes.push(sql`e.municipio_codigo = ${f.municipioCodigo}`)
  if (regioesDoFiltro) partes.push(sql`e.municipio_codigo = ANY(${inteirosSql(regioesDoFiltro)})`)
  if (f.precisao) partes.push(sql`e.geo_precisao = ${f.precisao}::geo_precisao`)
  return sql.join(partes, sql` AND `)
}
