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
import { type Observable, from, lastValueFrom } from 'rxjs'

import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'
import { MonitorDoPool } from '../infra/monitor-do-pool.js'
import {
  CHAVE_PERMISSAO,
  CHAVE_SEM_TRANSACAO,
  CHAVE_TRANSACAO_SOB_DEMANDA,
} from './acesso.decorators.js'
import { ContextoTenantService, type ContextoDaRequisicao } from './contexto-tenant.service.js'
import { atendeAlguma, carregarPermissoes } from './permissoes-do-membro.js'
import type { PapelMembro, RequisicaoAutenticada } from './requisicao.js'

/**
 * Abre a transação da requisição e define o tenant nela (`SET LOCAL`, via set_config(..., true)):
 *  - empresa: `app.tenant_id` (+ `app.user_id`) e confere de novo, já sob RLS, que o usuário é
 *    membro ativo e que a empresa está em teste ou ativa;
 *  - consolidado: `app.tenant_ids`, em transação SOMENTE LEITURA (e sem `app.tenant_id`, então
 *    nenhuma escrita passaria nem pelo RLS).
 * Tudo que o handler gravar ou ler passa por `ContextoTenantService.db()`, a mesma transação; se
 * o handler falhar, desfaz tudo.
 * Na empresa, carrega também o perfil de acesso e as permissões do membro e confere a marca
 * `@Permissao` da rota (403 `acesso_negado`). Rota com `@Permissao` fora de uma empresa ativa (sem
 * transação, sem empresa, consolidado) é negada: não há perfil para conferir.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly contexto: ContextoTenantService,
    private readonly reflector: Reflector,
    private readonly monitor: MonitorDoPool,
  ) {}

  intercept(execucao: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const marca = (chave: symbol) =>
      this.reflector.getAllAndOverride<boolean | undefined>(chave, [
        execucao.getHandler(),
        execucao.getClass(),
      ])
    const requeridas = this.reflector.getAllAndOverride<string[] | undefined>(CHAVE_PERMISSAO, [
      execucao.getHandler(),
      execucao.getClass(),
    ])
    const req = execucao.switchToHttp().getRequest<RequisicaoAutenticada>()
    const dados = req.dadosDeAcesso
    if (requeridas && (marca(CHAVE_SEM_TRANSACAO) || dados?.acesso.tipo !== 'empresa')) {
      throw new ErroApi('acesso_negado', 'Seu perfil de acesso não permite esta ação.', 403)
    }
    if (marca(CHAVE_SEM_TRANSACAO)) return proximo.handle()
    if (!dados || dados.acesso.tipo === 'sem-empresa') return proximo.handle()
    const { acesso, sessao } = dados

    // Abre a transação (conta no monitor do pool), define o tenant e entrega o contexto ao `fn`.
    // Se o `fn` falhar, desfaz tudo.
    const abrir = <T>(fn: (ctx: ContextoDaRequisicao) => Promise<T>): Promise<T> => {
      this.monitor.iniciar()
      return this.banco.db
        .transaction(
          async (tx) => {
            await tx.execute(sql`SELECT set_config('app.user_id', ${sessao.usuarioId}, true)`)
            const ctx: ContextoDaRequisicao = { usuarioId: sessao.usuarioId, tx, ip: req.ip }

            if (acesso.tipo === 'empresa') {
              await tx.execute(sql`SELECT set_config('app.tenant_id', ${acesso.tenantId}, true)`)
              ctx.tenantId = acesso.tenantId
              // Já sob RLS: confere de novo o que o guard viu antes da transação (corridas)
              const membros = await tx.execute<{
                id: string
                papel: PapelMembro
                perfil_id: string | null
              }>(sql`
              SELECT id, papel, perfil_id FROM membros
              WHERE usuario_id = ${sessao.usuarioId} AND excluido_em IS NULL AND ativo`)
              const membro = membros[0]
              if (!membro) {
                throw new ErroApi(
                  'empresa_ativa_invalida',
                  'Você não tem acesso à empresa ativa. Escolha outra.',
                  403,
                )
              }
              const empresas = await tx.execute<{ situacao: string }>(
                sql`SELECT situacao FROM tenants`,
              )
              if (!['teste', 'ativo'].includes(empresas[0]?.situacao ?? '')) {
                throw new ErroApi(
                  'empresa_indisponivel',
                  'Esta empresa está suspensa ou cancelada.',
                  403,
                )
              }
              ctx.membro = await carregarPermissoes(tx, membro)
              if (requeridas && !atendeAlguma(ctx.membro.permissoes, requeridas)) {
                throw new ErroApi(
                  'acesso_negado',
                  'Seu perfil de acesso não permite esta ação.',
                  403,
                )
              }
            } else {
              await tx.execute(
                sql`SELECT set_config('app.tenant_ids', ${`{${acesso.tenantIds.join(',')}}`}, true)`,
              )
              ctx.tenantIds = acesso.tenantIds
            }

            return fn(ctx)
          },
          acesso.tipo === 'consolidado' ? { accessMode: 'read only' } : undefined,
        )
        .finally(() => this.monitor.terminar())
    }

    const rodarHandler = (ctx: ContextoDaRequisicao) =>
      this.contexto.executar(ctx, () =>
        lastValueFrom(proximo.handle() as Observable<unknown>, { defaultValue: undefined }),
      )

    if (!marca(CHAVE_TRANSACAO_SOB_DEMANDA)) return from(abrir(rodarHandler))

    // Sob demanda: uma transação CURTA só para conferir o acesso e obter o membro; o handler roda sem
    // transação aberta e abre as dele com `ctx.transacao()`
    return from(
      (async () => {
        const conferido = await abrir((ctx) => Promise.resolve(ctx))
        return rodarHandler({ ...conferido, tx: undefined, abrirTransacao: abrir })
      })(),
    )
  }
}
