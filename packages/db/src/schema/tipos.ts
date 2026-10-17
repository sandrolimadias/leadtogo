import { customType, pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core'

import { novoId } from '../id.js'

/** E-mail sem diferença de caixa (extensão citext). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

/** Chave primária padrão: UUID v7 gerado na aplicação. */
export const chaveUuid = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => novoId())

/** `criado_em` e `atualizado_em` (timestamptz). */
export const carimbos = () => ({
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * Ponto geográfico (`geography(Point,4326)`, em metros nas distâncias). A aplicação lê e grava por SQL
 * (`ST_X`, `ST_Y`, `ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography`), por isso o tipo no TypeScript é opaco.
 */
export const geografiaPonto = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point,4326)'
  },
})

// Geolocalização (docs/plano_geolocalizacao.md): exata = número casado sem ambiguidade (raio 100 m);
// aproximada = o resto, com o tipo da aproximação guardado à parte.
export const geoPrecisao = pgEnum('geo_precisao', ['exata', 'aproximada'])
export const geoAproximacao = pgEnum('geo_aproximacao', ['interpolada', 'rua', 'cep_cidade'])
export const geoOrigem = pgEnum('geo_origem', ['cnefe', 'nominatim', 'cep', 'manual', 'checkin'])
