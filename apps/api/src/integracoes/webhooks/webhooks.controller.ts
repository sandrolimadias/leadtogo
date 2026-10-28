import {
  type AlterarWebhookEntrada,
  alterarWebhookSchema,
  type ConsultaDeEntregas,
  consultaDeEntregasSchema,
  type CriarWebhookEntrada,
  criarWebhookSchema,
  type EntregaDeWebhook,
  entregaDeWebhookSchema,
  EVENTOS_DE_WEBHOOK,
  type ListaDeEntregas,
  listaDeEntregasSchema,
  type ListaDeWebhooks,
  listaDeWebhooksSchema,
  ROTULO_DO_EVENTO,
  type ReenvioDeEntregas,
  reenvioDeEntregasSchema,
  type Webhook,
  type WebhookCriado,
  webhookCriadoSchema,
  webhookSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Permissao } from '../../acesso/acesso.decorators.js'
import { Acesso } from '../../acesso/dados-de-acesso.decorator.js'
import type { DadosDeAcesso } from '../../acesso/requisicao.js'
import { Documenta } from '../../documentacao/documenta.js'
import { ZodPipe } from '../../http/zod.pipe.js'
import { Limite } from '../../rate-limit/limite.decorator.js'
import { WebhooksService } from './webhooks.service.js'

const catalogoDeEventosSchema = z
  .object({ itens: z.array(z.object({ tipo: z.string(), rotulo: z.string() })) })
  .meta({ id: 'CatalogoDeEventosDeWebhook' })

/** Webhooks de saída da empresa ativa (Configurações → Integrações). Só quem tem `integracoes.gerir`. */
@ApiTags('Integrações: webhooks')
@Controller('integracoes/webhooks')
export class WebhooksController {
  constructor(private readonly servico: WebhooksService) {}

  @Documenta({
    resumo: 'Eventos que um webhook pode assinar',
    descricao: 'Exige `integracoes.gerir`.',
    resposta: catalogoDeEventosSchema,
    erros: [401, 403],
  })
  @Permissao('integracoes.gerir')
  @Get('eventos')
  eventos(): z.infer<typeof catalogoDeEventosSchema> {
    return { itens: EVENTOS_DE_WEBHOOK.map((tipo) => ({ tipo, rotulo: ROTULO_DO_EVENTO[tipo] })) }
  }

  @Documenta({
    resumo: 'Webhooks da empresa',
    descricao:
      'Exige `integracoes.gerir`. Com as entregas das últimas 24 h. O segredo nunca volta (só na criação e na rotação).',
    resposta: listaDeWebhooksSchema,
    erros: [401, 403],
  })
  @Permissao('integracoes.gerir')
  @Get()
  listar(): Promise<ListaDeWebhooks> {
    return this.servico.listar()
  }

  @Documenta({
    resumo: 'Cadastrar webhook',
    descricao:
      'Exige `integracoes.gerir` e o 2FA ativo. Devolve o **segredo uma única vez** (assina as entregas: `X-Leadtogo-Assinatura`). Em produção só `https`, salvo os hosts de `WEBHOOK_HOSTS_INTERNOS`; endereço de rede interna é recusado (422 `url_invalida`).',
    corpo: criarWebhookSchema,
    resposta: webhookCriadoSchema,
    status: 201,
    erros: [400, 401, 403, 422],
  })
  @Permissao('integracoes.gerir')
  @Post()
  @Limite({ nome: 'webhooks', max: 30, janelaS: 3600 })
  criar(
    @Body(new ZodPipe(criarWebhookSchema)) dados: CriarWebhookEntrada,
    @Acesso() acesso: DadosDeAcesso,
  ): Promise<WebhookCriado> {
    return this.servico.criar(dados, acesso.sessao.twoFactorEnabled)
  }

  @Documenta({
    resumo: 'Alterar webhook',
    descricao:
      'Exige `integracoes.gerir`. Descrição, endereço, eventos e `ativo` (religar zera a contagem de falhas).',
    corpo: alterarWebhookSchema,
    resposta: webhookSchema,
    erros: [400, 401, 403, 404, 422],
  })
  @Permissao('integracoes.gerir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarWebhookSchema)) dados: AlterarWebhookEntrada,
  ): Promise<Webhook> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir webhook',
    descricao:
      'Exige `integracoes.gerir`. Só sem entregas no log (409 `webhook_com_entregas`: desative).',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('integracoes.gerir')
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }

  @Documenta({
    resumo: 'Trocar o segredo',
    descricao:
      'Exige `integracoes.gerir` e o 2FA ativo. Devolve o segredo novo uma vez; o antigo continua assinando junto por 24 h.',
    resposta: webhookCriadoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('integracoes.gerir')
  @Post(':id/rotacionar-segredo')
  @HttpCode(200)
  rotacionarSegredo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Acesso() acesso: DadosDeAcesso,
  ): Promise<WebhookCriado> {
    return this.servico.rotacionarSegredo(id, acesso.sessao.twoFactorEnabled)
  }

  @Documenta({
    resumo: 'Enviar teste',
    descricao:
      'Exige `integracoes.gerir`. Envia o evento `webhook.teste` só para este webhook; acompanhe no log.',
    resposta: entregaDeWebhookSchema,
    status: 201,
    erros: [400, 401, 403, 404],
  })
  @Permissao('integracoes.gerir')
  @Post(':id/testar')
  @Limite({ nome: 'webhooks-teste', max: 30, janelaS: 600 })
  testar(@Param('id', new ParseUUIDPipe()) id: string): Promise<EntregaDeWebhook> {
    return this.servico.testar(id)
  }

  @Documenta({
    resumo: 'Log de entregas',
    descricao:
      'Exige `integracoes.gerir`. Da mais nova para a mais antiga; filtros por situação e tipo. Guardado por 30 dias (sucesso) e 90 dias (falha).',
    consulta: consultaDeEntregasSchema,
    resposta: listaDeEntregasSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('integracoes.gerir')
  @Get(':id/entregas')
  entregas(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(consultaDeEntregasSchema)) consulta: ConsultaDeEntregas,
  ): Promise<ListaDeEntregas> {
    return this.servico.entregas(id, consulta)
  }

  @Documenta({
    resumo: 'Reenviar uma entrega',
    descricao: 'Exige `integracoes.gerir`. Volta a pendente, com as tentativas zeradas.',
    resposta: entregaDeWebhookSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('integracoes.gerir')
  @Post(':id/entregas/:entregaId/reenviar')
  @HttpCode(200)
  reenviar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('entregaId', new ParseUUIDPipe()) entregaId: string,
  ): Promise<EntregaDeWebhook> {
    return this.servico.reenviar(id, entregaId)
  }

  @Documenta({
    resumo: 'Reenviar as falhas',
    descricao: 'Exige `integracoes.gerir`. Todas as entregas que falharam (até 500 por vez).',
    resposta: reenvioDeEntregasSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('integracoes.gerir')
  @Post(':id/entregas/reenviar-falhas')
  @HttpCode(200)
  reenviarFalhas(@Param('id', new ParseUUIDPipe()) id: string): Promise<ReenvioDeEntregas> {
    return this.servico.reenviarFalhas(id)
  }
}
