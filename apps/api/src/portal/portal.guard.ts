import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { CHAVE_PORTAL, CHAVE_PORTAL_PUBLICA } from './portal.decorators.js'
import { PortalLinksService } from './portal-links.service.js'
import { lerCookie, nomeDoCookieDoPortal, tenantDoToken } from './portal-token.js'
import type { RequisicaoDoPortal } from './portal.tipos.js'

/**
 * Guarda das rotas do portal (as do CRM não passam por aqui, e o `AcessoGuard` do CRM ignora as do portal):
 *  1. o portal precisa estar configurado (`PORTAL_URL`), senão 503;
 *  2. quem altera dado só vale vindo da origem do portal (cabeçalho Origin): o cookie é `SameSite=Lax`, e
 *     um site irmão (outro subdomínio) ainda poderia enviá-lo; a conferência de Origin fecha essa porta;
 *  3. rota protegida exige o cookie do portal em formato válido (a sessão em si é conferida, já no banco,
 *     pelo interceptador).
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly links: PortalLinksService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true
    const marca = (chave: symbol) =>
      this.reflector.getAllAndOverride<boolean | undefined>(chave, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) === true
    if (!marca(CHAVE_PORTAL)) return true

    const origemDoPortal = this.links.origemDoPortal() // 503 se não configurado
    const req = contexto.switchToHttp().getRequest<Request>() as RequisicaoDoPortal
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origemDoPortal) {
      throw new ErroApi('origem_invalida', 'Requisição de origem não permitida.', 403)
    }
    if (marca(CHAVE_PORTAL_PUBLICA)) return true

    const cookie = lerCookie(req, nomeDoCookieDoPortal(this.config))
    if (!tenantDoToken(cookie)) throw new ErroApi('nao_autenticado', 'Entre para continuar.', 401)
    req.portalCookie = cookie
    return true
  }
}
