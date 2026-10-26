import type { Conexao } from '@leadtogo/db'
import { sql } from '@leadtogo/db'
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, from, lastValueFrom, switchMap } from 'rxjs'

import {
  ContextoTenantService,
  type ContextoDaRequisicao,
} from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { identificarNoLog } from '../log/contexto-log.js'
import { BANCO } from '../infra/infra.module.js'
import { MonitorDoPool } from '../infra/monitor-do-pool.js'
import {
  CHAVE_PORTAL,
  CHAVE_PORTAL_PUBLICA,
  CHAVE_PORTAL_SEM_2FA,
  CHAVE_PORTAL_SOB_DEMANDA,
} from './portal.decorators.js'
import { PortalSessaoService } from './portal-sessao.service.js'
import { tenantDoToken } from './portal-token.js'
import type { ContextoDoPortal, RequisicaoDoPortal } from './portal.tipos.js'

/**
 * Transação das rotas protegidas do portal, com as DUAS camadas de isolamento:
 *  - `app.tenant_id` (a empresa da equipe, como no CRM);
 *  - `app.portal_acesso_id`, `app.portal_empresa_id` e `app.portal_contato_id` (a empresa-cliente e o contato),
 *    que ligam as políticas restritivas do banco. Só este interceptador as preenche, e só depois de a sessão
 *    ter sido conferida; o CRM nunca as preenche.
 * Sem o 2FA conferido (quando exigido) só passam as rotas `@PortalPermiteSem2fa`.
 */
@Injectable()
export class PortalInterceptor implements NestInterceptor {
  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly contexto: ContextoTenantService,
    private readonly reflector: Reflector,
    private readonly monitor: MonitorDoPool,
    private readonly sessoes: PortalSessaoService,
  ) {}

  intercept(execucao: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const marca = (chave: symbol) =>
      this.reflector.getAllAndOverride<boolean | undefined>(chave, [
        execucao.getHandler(),
        execucao.getClass(),
      ]) === true
    if (!marca(CHAVE_PORTAL) || marca(CHAVE_PORTAL_PUBLICA)) return proximo.handle()

    const req = execucao.switchToHttp().getRequest<RequisicaoDoPortal>()
    const token = req.portalCookie
    const tenantId = tenantDoToken(token)
    if (!token || !tenantId) throw new ErroApi('nao_autenticado', 'Entre para continuar.', 401)
    const permiteSem2fa = marca(CHAVE_PORTAL_SEM_2FA)

    const sobDemanda = marca(CHAVE_PORTAL_SOB_DEMANDA)

    // Abre a transação (conta no monitor do pool), preenche as duas camadas de isolamento e entrega o contexto.
    // `conhecido`: segunda transação da mesma requisição (rotas sob demanda), sessão já conferida.
    const abrir = <T>(
      fn: (ctx: ContextoDaRequisicao) => Promise<T>,
      conhecido?: ContextoDoPortal,
    ): Promise<T> => {
      this.monitor.iniciar()
      return this.banco.db
        .transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
          const portal = conhecido ?? (await this.sessoes.resolver(tx, tenantId, token))
          // Só agora, com a sessão conferida, as políticas por empresa-cliente passam a valer
          await tx.execute(sql`
            SELECT set_config('app.portal_acesso_id', ${portal.acessoId}, true),
                   set_config('app.portal_empresa_id', ${portal.empresaId}, true),
                   set_config('app.portal_contato_id', ${portal.contatoId}, true)`)
          identificarNoLog({ tenantId })
          if (portal.segundoFatorPendente && !permiteSem2fa) {
            throw new ErroApi(
              '2fa_obrigatorio',
              'Confirme a verificação em duas etapas para continuar.',
              403,
            )
          }
          return fn({ usuarioId: portal.acessoId, tx, ip: req.ip, tenantId, portal })
        })
        .finally(() => this.monitor.terminar())
    }

    const rodar = (ctx: ContextoDaRequisicao) =>
      this.contexto.executar(ctx, () =>
        lastValueFrom(proximo.handle() as Observable<unknown>, { defaultValue: undefined }),
      )

    if (!sobDemanda) return from(abrir(rodar))
    // Sob demanda: a transação curta só confere a sessão. O handler roda a seguir, sem transação aberta e com o
    // contexto ligado ao fluxo (um SSE devolve um fluxo que nunca termina, então nada de esperar o fim dele)
    return from(abrir((ctx) => Promise.resolve(ctx))).pipe(
      switchMap(
        (conferido) =>
          new Observable<unknown>((assinante) => {
            const ctx: ContextoDaRequisicao = {
              ...conferido,
              tx: undefined,
              abrirTransacao: <T>(fn: (c: ContextoDaRequisicao) => Promise<T>) =>
                abrir(fn, conferido.portal),
            }
            return this.contexto.executarSincrono(ctx, () => proximo.handle().subscribe(assinante))
          }),
      ),
    )
  }
}
