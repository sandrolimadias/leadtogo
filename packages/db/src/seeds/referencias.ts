import {
  cnaes,
  estados,
  microrregioes,
  municipios,
  paises,
  portes,
  qualificacoesSocio,
} from '../schema/index.js'
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

  return total
}
