import {
  cnaes,
  estados,
  microrregioes,
  municipios,
  paises,
  portes,
  qualificacoesSocio,
} from '../schema/index.js'
import { sql } from 'drizzle-orm'

import { lerDados } from './dados.js'
import { type Db, upsert } from './upsert.js'

/**
 * Referências globais (docs/modelagem_banco.md, seção 4), de seeds/dados/. Idempotente.
 * Roda com o leadtogo_owner: o app só lê estas tabelas.
 */
interface MunicipioArquivo {
  codigo_ibge: number
  codigo_siafi: number
  nome: string
  uf: string
  microrregiao_codigo: number | null
  latitude: number | null
  longitude: number | null
}

export async function semearReferencias(db: Db): Promise<Record<string, number>> {
  const total: Record<string, number> = {}

  total['estados'] = await upsert(
    db,
    estados,
    await lerDados<typeof estados.$inferInsert>('estados'),
    estados.uf,
    ['nome', 'regiao'],
  )
  // Dependem de estados (FK de uf); as microrregiões antes dos municípios (FK de microrregiao_codigo)
  total['microrregioes'] = await upsert(
    db,
    microrregioes,
    await lerDados<typeof microrregioes.$inferInsert>('microrregioes'),
    microrregioes.codigo,
    ['nome', 'uf'],
  )
  total['municipios'] = await upsert(
    db,
    municipios,
    (await lerDados<MunicipioArquivo>('municipios')).map((m) => ({
      codigoIbge: m.codigo_ibge,
      codigoSiafi: m.codigo_siafi,
      nome: m.nome,
      uf: m.uf,
      microrregiaoCodigo: m.microrregiao_codigo,
      localizacao:
        m.latitude === null || m.longitude === null ? null : { x: m.longitude, y: m.latitude },
    })),
    municipios.codigoIbge,
    ['codigoSiafi', 'nome', 'uf', 'microrregiaoCodigo', 'localizacao'],
  )
  total['paises'] = await upsert(
    db,
    paises,
    await lerDados<typeof paises.$inferInsert>('paises'),
    paises.codigo,
    ['nome'],
  )
  total['portes'] = await upsert(
    db,
    portes,
    await lerDados<typeof portes.$inferInsert>('portes'),
    portes.codigo,
    ['descricao'],
  )
  total['qualificacoes_socio'] = await upsert(
    db,
    qualificacoesSocio,
    await lerDados<typeof qualificacoesSocio.$inferInsert>('qualificacoes_socio'),
    qualificacoesSocio.codigo,
    ['descricao'],
  )

  total['cnaes'] = await upsert(
    db,
    cnaes,
    await lerDados<typeof cnaes.$inferInsert>('cnaes'),
    cnaes.codigo,
    ['descricao', 'secao', 'divisao', 'grupo', 'classe'],
  )

  // Depois dos municípios (FK): os contornos da malha do IBGE para os mapas do Dashboard
  total['municipio_contornos'] = await semearContornos(db)

  return total
}

interface ContornoArquivo {
  codigo_ibge: number
  uf: string
  /** MultiPolygon do GeoJSON */
  poligonos: number[][][][]
}

const FONTE_DOS_CONTORNOS = 'IBGE, malha municipal (simplificada)'

/** Contornos dos municípios: upsert em SQL (a coluna é geometria), só reescrevendo o que mudou. */
async function semearContornos(db: Db): Promise<number> {
  const linhas = await lerDados<ContornoArquivo>('municipio_contornos')
  const LOTE = 50
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE).map((l) => ({
      codigo: l.codigo_ibge,
      uf: l.uf,
      geojson: JSON.stringify({ type: 'MultiPolygon', coordinates: l.poligonos }),
    }))
    await db.execute(sql`
      INSERT INTO municipio_contornos (municipio_codigo, uf, contorno, fonte)
      SELECT x.codigo, x.uf, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(x.geojson)), 4326), ${FONTE_DOS_CONTORNOS}
      FROM json_to_recordset(${JSON.stringify(lote)}::json) AS x(codigo integer, uf char(2), geojson text)
      ON CONFLICT (municipio_codigo) DO UPDATE
        SET uf = excluded.uf, contorno = excluded.contorno, fonte = excluded.fonte, atualizado_em = now()
        WHERE municipio_contornos.uf IS DISTINCT FROM excluded.uf
           OR municipio_contornos.fonte IS DISTINCT FROM excluded.fonte
           OR ST_AsBinary(municipio_contornos.contorno) IS DISTINCT FROM ST_AsBinary(excluded.contorno)`)
  }
  return linhas.length
}
