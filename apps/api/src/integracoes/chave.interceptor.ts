import type { Conexao } from '@leadtogo/db'
import { sql } from '@leadtogo/db'
import { permissoesDaChave } from '@leadtogo/shared'
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Redis } from 'ioredis'
import { type Observable, from, lastValueFrom } from 'rxjs'

import { CHAVE_PERMISSAO } from '../acesso/acesso.decorators.js'
import {
  ContextoTenantService,
  type ContextoDaRequisicao,
} from '../acesso/contexto-tenant.service.js'
import { atendeAlguma } from '../acesso/permissoes-do-membro.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO, VALKEY } from '../infra/infra.module.js'
import { MonitorDoPool } from '../infra/monitor-do-pool.js'
import { CHAVE_API_PUBLICA } from './chave.decorators.js'
import { chaveInvalida, type RequisicaoComChave } from './chave.guard.js'

/** O IP como o Postgres compara: o IPv4 mapeado em IPv6 (`::ffff:1.2.3.4`) vira `1.2.3.4`. */
export const ipNormalizado = (ip: string | undefined): string | null =>
  ip ? ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1') : null

/**
 * Transação das rotas da API pública, com o tenant da chave (`app.tenant_id`), como a do CRM:
 *  - confere de novo, já sob RLS, que a chave vale (corrida com a revogação) e o IP, se a chave tem lista;
 *  - a empresa precisa estar em teste ou ativa;
 *  - o membro da requisição é o membro de integração da chave, com as permissões DELA (alcance "todas");
 *  - a marca `@Permissao` é conferida aqui (403 `escopo_insuficiente`, com a permissão exigida).
 * O último uso é gravado no máximo uma vez por minuto por chave (marca no Valkey), não a cada chamada.
 */
@Injectable()
export class ChaveInterceptor implements NestInterceptor {
  private readonly log = new Logger(ChaveInterceptor.name)

  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    @Inject(VALKEY) private readonly valkey: Redis,
    private readonly contexto: ContextoTenantService,
    private readonly reflector: Reflector,
    private readonly monitor: MonitorDoPool,
  ) {}

  intercept(execucao: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const alvos = [execucao.getHandler(), execucao.getClass()]
    if (this.reflector.getAllAndOverride<boolean | undefined>(CHAVE_API_PUBLICA, alvos) !== true) {
      return proximo.handle()
    }
    const requeridas = this.reflector.getAllAndOverride<string[] | undefined>(
      CHAVE_PERMISSAO,
      alvos,
    )
    const req = execucao.switchToHttp().getRequest<RequisicaoComChave>()
    const localizada = req.chaveLocalizada
    if (!localizada) throw chaveInvalida()
    const ip = ipNormalizado(req.ip)

    this.monitor.iniciar()
    const executar = this.banco.db
      .transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${localizada.tenantId}, true)`)
        const [chave] = await tx.execute<{
          id: string
          nome: string
          membro_id: string
          permissoes: string[]
          responsavel_padrao_id: string | null
          ip_ok: boolean
        }>(sql`
          SELECT c.id, c.nome, c.membro_id, c.permissoes, c.responsavel_padrao_id,
            (cardinality(c.ips_permitidos) = 0
              OR (${ip}::inet IS NOT NULL AND ${ip}::inet <<= ANY (c.ips_permitidos::inet[]))) AS ip_ok
          FROM api_chaves c
          WHERE c.id = ${localizada.chaveId} AND c.revogada_em IS NULL AND c.excluido_em IS NULL
            AND (c.expira_em IS NULL OR c.expira_em > now())`)
        if (!chave || !chave.ip_ok) throw chaveInvalida()

        const [empresa] = await tx.execute<{ situacao: string }>(sql`SELECT situacao FROM tenants`)
        if (!['teste', 'ativo'].includes(empresa?.situacao ?? '')) {
          throw new ErroApi('empresa_indisponivel', 'Esta empresa está suspensa ou cancelada.', 403)
        }

        const permissoes = permissoesDaChave(chave.permissoes)
        if (requeridas && !atendeAlguma(permissoes, requeridas)) {
          throw new ErroApi(
            'escopo_insuficiente',
            'Esta chave de API não tem a permissão exigida por esta rota.',
            403,
            undefined,
            { permissoes: requeridas },
          )
        }
        await this.registrarUso(tx, chave.id, ip)

        const ctx: ContextoDaRequisicao = {
          usuarioId: '',
          tx,
          ip: req.ip,
          tenantId: localizada.tenantId,
          membro: { id: chave.membro_id, papel: 'vendedor', perfil: null, permissoes },
          chaveApi: {
            id: chave.id,
            nome: chave.nome,
            responsavelPadraoId: chave.responsavel_padrao_id,
          },
        }
        return this.contexto.executar(ctx, () =>
          lastValueFrom(proximo.handle() as Observable<unknown>, { defaultValue: undefined }),
        )
      })
      .finally(() => this.monitor.terminar())
    return from(executar)
  }

  private async registrarUso(
    tx: Parameters<Parameters<Conexao['db']['transaction']>[0]>[0],
    chaveId: string,
    ip: string | null,
  ): Promise<void> {
    let gravar = false
    try {
      gravar =
        (await this.valkey.set(`leadtogo:chave-uso:${chaveId}`, '1', 'EX', 60, 'NX')) === 'OK'
    } catch (erro) {
      this.log.warn(`último uso da chave: Valkey indisponível: ${(erro as Error).message}`)
    }
    if (gravar) {
      await tx.execute(sql`
        UPDATE api_chaves SET ultimo_uso_em = now(), ultimo_ip = ${ip}::inet WHERE id = ${chaveId}`)
    }
  }
}
