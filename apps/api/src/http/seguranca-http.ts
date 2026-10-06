import type { INestApplication } from '@nestjs/common'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'

import type { Configuracao } from '../configuracao/configuracao.js'
import { ErroApi } from './erro-api.js'

/** Limite do corpo JSON (as importações de planilha usam upload, não JSON). */
const LIMITE_JSON = '1mb'

/**
 * Rotas cujo corpo NÃO pode ser lido pelo parser do Nest: o Better Auth lê o corpo ele mesmo
 * (se o parser consumir o stream antes, a requisição trava ou chega vazia).
 */
export const ROTAS_COM_CORPO_PROPRIO = ['/v1/auth']

/** Troca o erro do parser (com a mensagem interna do JSON.parse) por um erro nosso, com código estável. */
function traduzirErroDeParser(erro: unknown): unknown {
  const tipo = (erro as { type?: string } | null)?.type
  if (tipo === 'entity.parse.failed') {
    return new ErroApi('corpo_invalido', 'O corpo da requisição não é um JSON válido.', 400)
  }
  if (tipo === 'entity.too.large') {
    return new ErroApi('corpo_grande_demais', 'O corpo da requisição é grande demais.', 413)
  }
  if (tipo === 'charset.unsupported' || tipo === 'encoding.unsupported') {
    return new ErroApi('tipo_nao_suportado', 'Codificação do corpo não suportada.', 415)
  }
  return erro
}

/** Helmet, CORS só para o front e parser de corpo próprio. */
export function aplicarSegurancaHttp(app: INestApplication, config: Configuracao): void {
  const origemDoFront = new URL(config.APP_URL).origin

  // IP real do cliente atrás do Traefik: só confia em X-Forwarded-For pelo número de proxies configurado
  const proxies = config.TRUST_PROXY ?? (config.NODE_ENV === 'production' ? 1 : 0)
  ;(app.getHttpAdapter().getInstance() as express.Express).set('trust proxy', proxies)

  app.use(
    helmet({
      // A API só serve JSON ao front de outro host (mesmo site): nada de embutir recursos dela
      crossOriginResourcePolicy: { policy: 'same-site' },
      // O Swagger UI (só fora de produção) usa scripts inline
      contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false,
    }),
  )

  app.enableCors({
    // Só o front: qualquer outra origem não recebe cabeçalho CORS e o navegador bloqueia
    origin: (
      origem: string | undefined,
      resposta: (erro: Error | null, permitir?: boolean) => void,
    ) => resposta(null, origem === origemDoFront),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  })

  const json = express.json({ limit: LIMITE_JSON })
  app.use((req: Request, res: Response, proximo: NextFunction) => {
    if (
      ROTAS_COM_CORPO_PROPRIO.some(
        (prefixo) => req.path === prefixo || req.path.startsWith(`${prefixo}/`),
      )
    ) {
      return proximo()
    }
    return json(req, res, (erro?: unknown) =>
      erro ? proximo(traduzirErroDeParser(erro)) : proximo(),
    )
  })
}
