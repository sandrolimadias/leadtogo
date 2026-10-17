import { sql } from '@leadtogo/db'
import {
  faltasNoEndereco,
  type PosicaoDaEmpresa,
  RAIO_DE_INCERTEZA_M,
  textoDoEndereco,
} from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { AproximacaoGeo, OrigemGeo, PrecisaoGeo } from './tipos.js'

/** As colunas da empresa que definem a posição e o endereço (o que `montarPosicao` precisa). */
export interface DadosDaPosicao {
  cep: string | null
  tipoLogradouro: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  municipioCodigo: number | null
  municipioNome: string | null
  paisCodigo: number | null
  geoPrecisao: PrecisaoGeo | null
  geoAproximacao: AproximacaoGeo | null
  geoOrigem: OrigemGeo | null
  geoEnderecoConsultado: string | null
  geoAjusteManual: boolean
  /** Data (ou texto ISO, quando vem de SQL cru) */
  geoAtualizadoEm: Date | string | null
}

/** Latitude e longitude da empresa (a coluna é `geography`; o ST_X/ST_Y é feito no banco). */
export async function coordenadasDaEmpresa(
  tx: Transacao,
  empresaId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const [l] = await tx.execute<{ latitude: number | null; longitude: number | null }>(
    sql`SELECT ST_Y(localizacao::geometry) AS latitude, ST_X(localizacao::geometry) AS longitude
        FROM empresas WHERE id = ${empresaId}`,
  )
  return l && l.latitude !== null && l.longitude !== null
    ? { latitude: l.latitude, longitude: l.longitude }
    : null
}

/**
 * O que o selo da ficha mostra: exata, aproximada, sem coordenada ou a confirmar. "A confirmar" =
 * endereço incompleto (com a tag de sistema, ou sem a tag mas com faltas e sem posição).
 */
export function montarPosicao(
  d: DadosDaPosicao,
  coordenadas: { latitude: number; longitude: number } | null,
  comTagAConfirmar: boolean,
  centroDoMunicipio: { latitude: number; longitude: number } | null = null,
): PosicaoDaEmpresa {
  const faltas = faltasNoEndereco(d)
  const exterior = d.paisCodigo !== null
  const temPosicao = coordenadas !== null
  const aConfirmar = !exterior && !temPosicao && (comTagAConfirmar || faltas.length > 0)
  const estado = temPosicao
    ? d.geoPrecisao === 'exata'
      ? 'exata'
      : 'aproximada'
    : aConfirmar
      ? 'a_confirmar'
      : 'sem_coordenada'
  const textoAtual = textoDoEndereco(d, d.municipioNome)
  return {
    estado,
    latitude: coordenadas?.latitude ?? null,
    longitude: coordenadas?.longitude ?? null,
    precisao: temPosicao ? (d.geoPrecisao ?? 'aproximada') : null,
    aproximacao: temPosicao ? d.geoAproximacao : null,
    origem: temPosicao ? d.geoOrigem : null,
    raioM: temPosicao
      ? d.geoPrecisao === 'exata' || d.geoOrigem === 'manual' || d.geoOrigem === 'checkin'
        ? RAIO_DE_INCERTEZA_M.exata
        : RAIO_DE_INCERTEZA_M[d.geoAproximacao ?? 'cep_cidade']
      : null,
    atualizadoEm: d.geoAtualizadoEm ? new Date(d.geoAtualizadoEm).toISOString() : null,
    ajusteManual: d.geoAjusteManual,
    enderecoMudouDepoisDoAjuste:
      d.geoAjusteManual &&
      d.geoEnderecoConsultado !== null &&
      d.geoEnderecoConsultado !== textoAtual,
    centroSugerido: coordenadas ?? centroDoMunicipio,
    faltas: aConfirmar ? faltas : [],
  }
}
