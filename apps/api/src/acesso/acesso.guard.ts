import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'

import { AuthService } from '../auth/auth.service.js'
import { ErroApi } from '../http/erro-api.js'
import { identificarNoLog } from '../log/contexto-log.js'
import {
  CHAVE_CONSOLIDADO,
  CHAVE_PUBLICA,
  CHAVE_SEM_2FA,
  CHAVE_SEM_EMPRESA,
} from './acesso.decorators.js'
import type { Acesso, RequisicaoAutenticada, Sessao } from './requisicao.js'
import { VinculosService } from './vinculos.service.js'

/**
 * Controle de acesso de TODA rota (guard global; o padrão é protegido):
 *  1. sessão válida, ou 401 `nao_autenticado`;
 *  2. administrador (de empresa ou de conta) sem 2FA: 403 `2fa_obrigatorio`, salvo `@PermiteSem2fa`;
 *  3. a empresa ativa precisa ser uma das do usuário (função `app_vinculos_do_usuario`);
 *  4. consolidado: só administrador da conta, só leitura.
 * A transação com `SET LOCAL app.tenant_id` é aberta depois, pelo TenantInterceptor.
 */
@Injectable()
export class AcessoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly vinculos: VinculosService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true
    const marca = (chave: symbol) =>
      this.reflector.getAllAndOverride<boolean | undefined>(chave, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) === true
    if (marca(CHAVE_PUBLICA)) return true

    const req = contexto.switchToHttp().getRequest<Request>() as RequisicaoAutenticada
    const sessao = await this.sessaoDe(req)
    identificarNoLog({ userId: sessao.usuarioId })

    const [vinculos, administradorDeConta] = await Promise.all([
      this.vinculos.vinculosDo(sessao.usuarioId),
      this.vinculos.administraConta(sessao.usuarioId),
    ])

    // Administrador sem 2FA não usa a API (só vê o que falta e ativa o 2FA)
    const administrador = administradorDeConta || vinculos.some((v) => v.papel === 'admin')
    if (administrador && !sessao.twoFactorEnabled && !marca(CHAVE_SEM_2FA)) {
      throw new ErroApi(
        '2fa_obrigatorio',
        'Administradores precisam ativar a autenticação em dois fatores para continuar.',
        403,
      )
    }

    let acesso: Acesso
    if (marca(CHAVE_CONSOLIDADO)) {
      if (req.method !== 'GET') {
        throw new ErroApi('metodo_nao_permitido', 'O painel consolidado é somente leitura.', 405)
      }
      const tenantIds = await this.vinculos.empresasDaContaDo(sessao.usuarioId)
      if (tenantIds.length === 0) {
        throw new ErroApi(
          'consolidado_negado',
          'O painel consolidado é só para administradores da conta.',
          403,
        )
      }
      acesso = { tipo: 'consolidado', tenantIds }
    } else if (marca(CHAVE_SEM_EMPRESA)) {
      acesso = { tipo: 'sem-empresa' }
    } else {
      if (!sessao.empresaAtivaId) {
        throw new ErroApi('sem_empresa_ativa', 'Escolha uma empresa para continuar.', 409)
      }
      if (!vinculos.some((v) => v.tenantId === sessao.empresaAtivaId)) {
        throw new ErroApi(
          'empresa_ativa_invalida',
          'Você não tem acesso à empresa ativa. Escolha outra.',
          403,
        )
      }
      identificarNoLog({ tenantId: sessao.empresaAtivaId })
      acesso = { tipo: 'empresa', tenantId: sessao.empresaAtivaId }
    }

    req.dadosDeAcesso = { sessao, vinculos, administradorDeConta, acesso }
    return true
  }

  private async sessaoDe(req: Request): Promise<Sessao> {
    const resultado = await this.auth.obterSessao(req)
    if (!resultado) throw new ErroApi('nao_autenticado', 'Entre para continuar.', 401)
    const { session, user } = resultado
    return {
      sessaoId: session.id,
      usuarioId: user.id,
      email: user.email,
      nome: user.name,
      twoFactorEnabled: user.twoFactorEnabled === true,
      empresaAtivaId: (session as { empresaAtivaId?: string | null }).empresaAtivaId ?? null,
    }
  }
}
