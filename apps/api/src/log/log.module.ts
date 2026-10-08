import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DestinationStream } from 'pino'
import { LoggerModule } from 'nestjs-pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import {
  camposDoContexto,
  contextoAtual,
  contextoDaRequisicao,
  executarComContexto,
  idDaRequisicao,
} from './contexto-log.js'

/** Nada disso pode ir para o log: cabeçalhos de sessão e campos que carregam senha ou token. */
const REDIGIR = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.senha',
  '*.token',
  '*.secret',
]

class ContextoLogMiddleware {
  use(req: IncomingMessage, res: ServerResponse, proximo: () => void): void {
    executarComContexto(req, res, proximo)
  }
}

@Module({})
export class LogModule implements NestModule {
  /** `destino` troca o stdout (os testes capturam as linhas de log). */
  static com(config: Configuracao, destino?: DestinationStream): DynamicModule {
    const opcoes = {
      level: config.LOG_LEVEL,
      redact: { paths: REDIGIR, censor: '[removido]' },
      // Todo log da requisição leva request_id e, quando conhecidos, tenant_id e user_id. Duas fontes, sem
      // repetir campo: o `mixin` (contexto assíncrono) cobre as linhas da aplicação; o `customProps` (lê da
      // própria requisição) cobre a linha "request completed", onde o contexto assíncrono pode se perder.
      // Na linha de conclusão os dois valem, e o JSON sairia com a chave duplicada: o mixin cede os campos
      // que o logger da linha já traz (suas `bindings`) ou que a própria chamada informa.
      mixin: (objeto: object, _nivel: number, logger: { bindings?: () => object }) => {
        const campos: Record<string, string> = camposDoContexto(contextoAtual())
        const proprios = { ...logger.bindings?.(), ...objeto }
        for (const chave of Object.keys(campos)) if (chave in proprios) delete campos[chave]
        return campos
      },
      customProps: (req: IncomingMessage) => camposDoContexto(contextoDaRequisicao(req)),
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const id = idDaRequisicao(req)
        res.setHeader('x-request-id', id)
        return id
      },
      autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
      // Só método, URL e status; nada de corpo, cabeçalhos ou parâmetros sensíveis
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      ...(config.NODE_ENV === 'development' && !destino
        ? { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }
        : {}),
    }
    return {
      module: LogModule,
      imports: [LoggerModule.forRoot({ pinoHttp: destino ? [opcoes, destino] : opcoes })],
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ContextoLogMiddleware)
      .forRoutes({ path: '{*caminho}', method: RequestMethod.ALL })
  }
}
