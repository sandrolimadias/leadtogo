import {
  type ConsultaDeNotificacoes,
  consultaDeNotificacoesSchema,
  type ListaDeNotificacoes,
  listaDeNotificacoesSchema,
  type MarcadasComoLidas,
  marcadasComoLidasSchema,
} from '@leadtogo/shared'
import {
  Controller,
  Get,
  Header,
  Inject,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Observable } from 'rxjs'
import { type Conexao, sql } from '@leadtogo/db'

import { SemTransacao, TodoMembro } from '../acesso/acesso.decorators.js'
import type { RequisicaoAutenticada } from '../acesso/requisicao.js'
import { Documenta } from '../documentacao/documenta.js'
import { ErroApi } from '../http/erro-api.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { BANCO } from '../infra/infra.module.js'
import { NotificacoesService } from './notificacoes.service.js'
import { TempoRealDoSino } from './tempo-real.service.js'

/** Intervalo do sinal de vida do SSE (proxies cortam conexão parada). */
export const INTERVALO_DO_SINAL_MS = 25_000

/** O sino do CRM (Fase 2): lista, marcar como lida e o fluxo em tempo real. */
@ApiTags('Notificações')
@Controller('notificacoes')
export class NotificacoesController {
  constructor(
    private readonly servico: NotificacoesService,
    private readonly tempoReal: TempoRealDoSino,
    @Inject(BANCO) private readonly banco: Conexao,
  ) {}

  @Documenta({
    resumo: 'Listar as minhas notificações',
    descricao:
      'Qualquer membro da empresa ativa: só as dele, da mais nova para a mais antiga. `naoLidas` é o número do sino.',
    consulta: consultaDeNotificacoesSchema,
    resposta: listaDeNotificacoesSchema,
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeNotificacoesSchema)) consulta: ConsultaDeNotificacoes,
  ): Promise<ListaDeNotificacoes> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Marcar todas como lidas',
    descricao: 'Qualquer membro: só as notificações dele.',
    resposta: marcadasComoLidasSchema,
    erros: [401, 403, 409],
  })
  @TodoMembro()
  @Post('lidas')
  marcarTodas(): Promise<MarcadasComoLidas> {
    return this.servico.marcarTodasComoLidas()
  }

  /**
   * Fluxo em tempo real (Server-Sent Events). Sem transação aberta (a conexão fica horas aberta). Cada
   * evento `nova` traz `{ id, tipo, titulo }` de uma notificação nova do membro; o app atualiza o sino. Um
   * evento `sinal` a cada 25 s mantém a conexão viva. Quem perde a conexão reconecta e relê a lista.
   */
  @Documenta({
    resumo: 'Fluxo em tempo real do sino (SSE)',
    descricao:
      '`text/event-stream`. Eventos: `nova` (dados `{ id, tipo, titulo }`) e `sinal` (a cada 25 s). Só as notificações do membro da empresa ativa. O app reconecta sozinho e relê a lista ao reconectar.',
    erros: [401, 403, 409],
  })
  @TodoMembro()
  @SemTransacao()
  // Proxies (Traefik/Caddy) não devem guardar o fluxo em buffer
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Sse('fluxo')
  async fluxo(@Req() req: RequisicaoAutenticada): Promise<Observable<MessageEvent>> {
    const dados = req.dadosDeAcesso
    if (!dados || dados.acesso.tipo !== 'empresa') {
      throw new ErroApi('sem_empresa_ativa', 'Esta rota exige uma empresa ativa.', 409)
    }
    const tenantId = dados.acesso.tenantId
    const membroId = await this.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      const [m] = await tx.execute<{ id: string }>(sql`
        SELECT id FROM membros WHERE usuario_id = ${dados.sessao.usuarioId} AND ativo AND excluido_em IS NULL`)
      return m?.id
    })
    if (!membroId)
      throw new ErroApi('empresa_ativa_invalida', 'Você não tem acesso à empresa ativa.', 403)
    return new Observable<MessageEvent>((assinante) => {
      let parar: (() => void) | null = null
      let encerrado = false
      assinante.next({ type: 'sinal', data: { em: new Date().toISOString() } })
      void this.tempoReal
        .ouvir(tenantId, membroId, (mensagem) => {
          try {
            assinante.next({ type: 'nova', data: JSON.parse(mensagem) as object })
          } catch {
            /* mensagem torta: ignora */
          }
        })
        .then((f) => {
          if (encerrado) f()
          else parar = f
        })
        .catch((e) => assinante.error(e))
      const relogio = setInterval(
        () => assinante.next({ type: 'sinal', data: { em: new Date().toISOString() } }),
        INTERVALO_DO_SINAL_MS,
      )
      return () => {
        encerrado = true
        clearInterval(relogio)
        parar?.()
      }
    })
  }

  @Documenta({
    resumo: 'Marcar uma notificação como lida',
    descricao:
      'Qualquer membro: só as dele (a de outra pessoa dá 404 `notificacao_nao_encontrada`).',
    resposta: marcadasComoLidasSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @TodoMembro()
  @Post(':id/lida')
  marcarComoLida(@Param('id', new ParseUUIDPipe()) id: string): Promise<MarcadasComoLidas> {
    return this.servico.marcarComoLida(id)
  }
}
