import { All, Controller, Inject, Req, Res } from '@nestjs/common'
import { Publica } from '../acesso/acesso.decorators.js'
import { toNodeHandler } from 'better-auth/node'
import type { Request, Response } from 'express'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import type { Auth } from './auth.factory.js'
import { AUTH } from './auth.tokens.js'

const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Entrega /v1/auth/* ao Better Auth. Passa pelo Nest (log, request_id, rate limit global e filtro
 * de erros continuam valendo), mas o corpo NÃO é lido antes: o parser de corpo pula /v1/auth
 * (ROTAS_COM_CORPO_PROPRIO) e o Better Auth consome o stream sozinho.
 */
@Publica()
@Controller('auth')
export class AuthController {
  private readonly manipulador: ReturnType<typeof toNodeHandler>
  private readonly origemDoFront: string

  constructor(@Inject(AUTH) auth: Auth, @Inject(CONFIGURACAO) config: Configuracao) {
    this.manipulador = toNodeHandler(auth)
    this.origemDoFront = new URL(config.APP_URL).origin
  }

  @All('{*caminho}')
  async tratar(@Req() req: Request, @Res() res: Response): Promise<void> {
    // O Better Auth só confere a origem quando há cookie; aqui vale sempre: uma escrita vinda de
    // outro site (o navegador sempre manda Origin) é recusada, inclusive o login (CSRF de login).
    // Sem Origin = cliente que não é navegador (curl, testes): segue.
    const origem = req.headers.origin
    if (!METODOS_DE_LEITURA.has(req.method) && origem && origem !== this.origemDoFront) {
      throw new ErroApi('origem_nao_permitida', 'Origem não permitida.', 403)
    }
    // O Better Auth lê o IP de X-Forwarded-For. O Express já decidiu qual é o IP real (req.ip,
    // conforme TRUST_PROXY); repomos esse valor para um cabeçalho forjado não burlar o rate limit.
    req.headers['x-forwarded-for'] = req.ip ?? ''
    await this.manipulador(req, res)
  }
}
