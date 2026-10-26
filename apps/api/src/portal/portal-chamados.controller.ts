import {
  type AbrirChamadoNoPortalEntrada,
  abrirChamadoNoPortalSchema,
  type AvaliarChamadoEntrada,
  avaliarChamadoSchema,
  type ChamadoDoPortal,
  chamadoDoPortalSchema,
  type ConsultaDeChamadosDoPortal,
  consultaDeChamadosDoPortalSchema,
  type ConsultaDeNotificacoes,
  consultaDeNotificacoesSchema,
  type DownloadDeAnexo,
  downloadDeAnexoSchema,
  type EnvioDeAnexo,
  envioDeAnexoSchema,
  inicioDoPortalSchema,
  type InicioDoPortal,
  listaDeAreasDoPortalSchema,
  listaDeChamadosDoPortalSchema,
  type ListaDeChamadosDoPortal,
  listaDeNotificacoesDoPortalSchema,
  naoLidasDoPortalSchema,
  type PedirEnvioDeAnexoEntrada,
  pedirEnvioDeAnexoSchema,
  type ResponderChamadoNoPortalEntrada,
  responderChamadoNoPortalSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Observable } from 'rxjs'
import { z } from 'zod'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { INTERVALO_DO_SINAL_MS } from '../notificacoes/notificacoes.controller.js'
import { TempoRealDoSino } from '../notificacoes/tempo-real.service.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PortalAnexosService } from './portal-anexos.service.js'
import { PortalChamadosService } from './portal-chamados.service.js'
import { PortalNotificacoesService } from './portal-notificacoes.service.js'
import { PortalTransacaoSobDemanda, RotaDoPortal } from './portal.decorators.js'

const uuid = () => new ParseUUIDPipe()

/** Chamados do cliente (Fase 3A). A empresa e o solicitante vêm da sessão do portal, nunca do corpo. */
@ApiTags('Portal do cliente: chamados')
@RotaDoPortal()
@Controller('portal')
export class PortalChamadosController {
  constructor(
    private readonly chamados: PortalChamadosService,
    private readonly anexos: PortalAnexosService,
  ) {}

  @Documenta({
    resumo: 'Início do portal',
    descricao: 'Contagens (em aberto, aguardando você, para avaliar) e os chamados mais recentes.',
    resposta: inicioDoPortalSchema,
    erros: [401, 403, 503],
  })
  @Get('inicio')
  inicio(): Promise<InicioDoPortal> {
    return this.chamados.inicio()
  }

  @Documenta({
    resumo: 'Áreas para abrir chamado',
    descricao:
      'Só as áreas marcadas como visíveis no portal. "Não sei" (sem área) vai para a triagem.',
    resposta: listaDeAreasDoPortalSchema,
    erros: [401, 403, 503],
  })
  @Get('areas')
  areas() {
    return this.chamados.areas()
  }

  @Documenta({
    resumo: 'Meus chamados',
    descricao:
      'Os chamados da empresa-cliente abertos pelo portal (os de colegas também aparecem). O estado é o que o cliente vê: Aberto, Em atendimento, Aguardando sua resposta, Resolvido ou Fechado.',
    consulta: consultaDeChamadosDoPortalSchema,
    resposta: listaDeChamadosDoPortalSchema,
    erros: [400, 401, 403, 503],
  })
  @Get('chamados')
  listar(
    @Query(new ZodPipe(consultaDeChamadosDoPortalSchema)) consulta: ConsultaDeChamadosDoPortal,
  ): Promise<ListaDeChamadosDoPortal> {
    return this.chamados.listar(consulta)
  }

  @Documenta({
    resumo: 'Abrir um chamado',
    descricao:
      'A empresa-cliente e o solicitante são os da sessão (o corpo não os aceita). Só áreas visíveis no portal; sem área, o chamado vai para a triagem. Os anexos entram depois, pela conversa.',
    corpo: abrirChamadoNoPortalSchema,
    resposta: chamadoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 429, 503],
  })
  @Post('chamados')
  @Limite({ nome: 'portal-abrir-chamado', max: 30, janelaS: 3600 })
  abrir(
    @Body(new ZodPipe(abrirChamadoNoPortalSchema)) dados: AbrirChamadoNoPortalEntrada,
  ): Promise<ChamadoDoPortal> {
    return this.chamados.abrir(dados)
  }

  @Documenta({
    resumo: 'Detalhe de um chamado',
    descricao:
      'Conversa, anexos, marcos e o que o cliente pode fazer agora. Chamado de outra empresa-cliente (ou interno) dá 404.',
    resposta: chamadoDoPortalSchema,
    erros: [400, 401, 403, 404, 503],
  })
  @Get('chamados/:id')
  obter(@Param('id', uuid()) id: string): Promise<ChamadoDoPortal> {
    return this.chamados.obter(id)
  }

  @Documenta({
    resumo: 'Responder um chamado',
    descricao:
      'Em "Aguardando sua resposta" devolve o chamado ao atendimento. Resolvido: 409 `chamado_resolvido` (reabra antes); fechado: 409 `chamado_fechado`. Até 5 anexos já enviados e confirmados por quem escreve.',
    corpo: responderChamadoNoPortalSchema,
    resposta: chamadoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Post('chamados/:id/mensagens')
  @Limite({ nome: 'portal-responder', max: 120, janelaS: 3600 })
  responder(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(responderChamadoNoPortalSchema)) dados: ResponderChamadoNoPortalEntrada,
  ): Promise<ChamadoDoPortal> {
    return this.chamados.responder(id, dados)
  }

  @Documenta({
    resumo: 'Reabrir um chamado resolvido',
    descricao: `Até 7 dias depois de Resolvido (409 \`prazo_de_reabertura_vencido\`); depois, abra um novo chamado.`,
    resposta: chamadoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Post('chamados/:id/reabrir')
  reabrir(@Param('id', uuid()) id: string): Promise<ChamadoDoPortal> {
    return this.chamados.reabrir(id)
  }

  @Documenta({
    resumo: 'Avaliar um chamado',
    descricao:
      'Nota de 1 a 5 e comentário opcional, uma vez por chamado resolvido ou fechado (409 `ja_avaliado`).',
    corpo: avaliarChamadoSchema,
    resposta: chamadoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Post('chamados/:id/avaliacao')
  avaliar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(avaliarChamadoSchema)) dados: AvaliarChamadoEntrada,
  ): Promise<ChamadoDoPortal> {
    return this.chamados.avaliar(id, dados)
  }

  // ------------------------------------------------------------------------------------------ anexos

  @Documenta({
    resumo: 'Pedir o envio de um anexo',
    descricao:
      'Devolve uma URL pré-assinada (PUT, 15 minutos) para enviar o arquivo (até 25 MB) direto ao armazenamento. Depois do PUT, chame `/confirmar`. Sem antivírus configurado: 503 `anexos_indisponiveis`.',
    corpo: pedirEnvioDeAnexoSchema,
    resposta: envioDeAnexoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Post('chamados/:id/anexos')
  @Limite({ nome: 'portal-anexos', max: 120, janelaS: 3600 })
  pedirEnvio(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(pedirEnvioDeAnexoSchema)) dados: PedirEnvioDeAnexoEntrada,
  ): Promise<EnvioDeAnexo> {
    return this.anexos.pedirEnvio(id, dados)
  }

  @Documenta({
    resumo: 'Confirmar o envio de um anexo',
    descricao:
      'Depois do PUT: confere o arquivo no armazenamento e manda o antivírus varrê-lo. Só se baixa o que estiver "limpo".',
    resposta: z.object({ id: z.uuid(), estado: z.string() }),
    status: 200,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @PortalTransacaoSobDemanda()
  @Post('chamados/:id/anexos/:anexoId/confirmar')
  @HttpCode(200)
  confirmar(@Param('id', uuid()) id: string, @Param('anexoId', uuid()) anexoId: string) {
    return this.anexos.confirmar(id, anexoId)
  }

  @Documenta({
    resumo: 'Baixar um anexo',
    descricao:
      'URL pré-assinada de 60 segundos, só de anexo "limpo" de chamado da própria empresa. Sempre como download.',
    resposta: downloadDeAnexoSchema,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Get('chamados/:id/anexos/:anexoId/download')
  baixar(
    @Param('id', uuid()) id: string,
    @Param('anexoId', uuid()) anexoId: string,
  ): Promise<DownloadDeAnexo> {
    return this.anexos.baixar(id, anexoId)
  }
}

/** O sino do cliente: lista, marcar como lida e o fluxo em tempo real. */
@ApiTags('Portal do cliente: notificações')
@RotaDoPortal()
@Controller('portal/notificacoes')
export class PortalNotificacoesController {
  constructor(
    private readonly servico: PortalNotificacoesService,
    private readonly tempoReal: TempoRealDoSino,
    private readonly ctx: ContextoTenantService,
  ) {}

  @Documenta({
    resumo: 'Minhas notificações',
    descricao:
      'Só as do próprio contato, da mais nova para a mais antiga. `naoLidas` é o número do sino.',
    consulta: consultaDeNotificacoesSchema,
    resposta: listaDeNotificacoesDoPortalSchema,
    erros: [400, 401, 403, 503],
  })
  @Get()
  listar(@Query(new ZodPipe(consultaDeNotificacoesSchema)) consulta: ConsultaDeNotificacoes) {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Marcar todas como lidas',
    resposta: naoLidasDoPortalSchema,
    status: 201,
    erros: [401, 403, 503],
  })
  @Post('lidas')
  marcarTodas() {
    return this.servico.marcarTodasComoLidas()
  }

  @Documenta({
    resumo: 'Fluxo em tempo real do sino (SSE)',
    descricao:
      '`text/event-stream`. Eventos: `nova` (dados `{ id, tipo, titulo }`) e `sinal` (a cada 25 s). Só as notificações do contato da sessão. O app reconecta sozinho e relê a lista.',
    erros: [401, 403, 503],
  })
  @PortalTransacaoSobDemanda()
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Sse('fluxo')
  fluxo(): Observable<MessageEvent> {
    const { tenantId, contatoId } = this.ctx.portal
    return new Observable<MessageEvent>((assinante) => {
      let parar: (() => void) | null = null
      let encerrado = false
      assinante.next({ type: 'sinal', data: { em: new Date().toISOString() } })
      void this.tempoReal
        .ouvir(tenantId, contatoId, (mensagem) => {
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
    resposta: naoLidasDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 503],
  })
  @Post(':id/lida')
  marcarComoLida(@Param('id', uuid()) id: string) {
    return this.servico.marcarComoLida(id)
  }
}
