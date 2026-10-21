import { Agent as AgenteHttp } from 'node:http'
import { Agent as AgenteHttps } from 'node:https'

import { S3Client } from '@aws-sdk/client-s3'

import type { Configuracao } from '../configuracao/configuracao.js'

/**
 * Limites do cliente do Garage, todos explícitos (o padrão do SDK é 50 sockets sem prazo nenhum: foi o que
 * deixou a API presa em 19/10/2026, quando pedidos abortados do mapa nunca devolveram os sockets).
 *  - `maxSockets`: conexões simultâneas ao Garage; o resto espera na fila do agente.
 *  - `connectionTimeout`: prazo para abrir a conexão.
 *  - `requestTimeout`: prazo de inatividade do socket (sem um byte em 15 s, o pedido cai).
 */
export const LIMITES_DO_GARAGE = {
  maxSockets: 50,
  connectionTimeout: 3_000,
  requestTimeout: 15_000,
} as const

export function criarClienteS3(
  config: Configuracao,
  limites: { maxSockets: number } = LIMITES_DO_GARAGE,
): S3Client {
  const agente = { keepAlive: true, maxSockets: limites.maxSockets }
  return new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
    maxAttempts: 2,
    requestHandler: {
      httpAgent: new AgenteHttp(agente),
      httpsAgent: new AgenteHttps(agente),
      connectionTimeout: LIMITES_DO_GARAGE.connectionTimeout,
      requestTimeout: LIMITES_DO_GARAGE.requestTimeout,
    },
  })
}
