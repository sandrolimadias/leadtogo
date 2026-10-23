import {
  type AnexoDoChamado,
  anexoDoChamadoSchema,
  type Chamado,
  chamadoSchema,
  type CriarNotaInternaEntrada,
  criarNotaInternaSchema,
  type DownloadDeAnexo,
  downloadDeAnexoSchema,
  type EnviarMensagemEntrada,
  enviarMensagemSchema,
  type EnvioDeAnexo,
  envioDeAnexoSchema,
  type PedirEnvioDeAnexoEntrada,
  pedirEnvioDeAnexoSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao, TransacaoSobDemanda } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { AnexosService } from './anexos.service.js'
import { MensagensService } from './mensagens.service.js'

const VISIVEL =
  'Chamado que a pessoa não vê: 404 `chamado_nao_encontrado`. Sem a ação permitida neste chamado: 403 `acesso_negado`.'

/** Conversa, notas internas e anexos do chamado (Fase 2). */
@ApiTags('Chamados')
@Controller('chamados')
export class ConversaDoChamadoController {
  constructor(
    private readonly mensagens: MensagensService,
    private readonly anexos: AnexosService,
  ) {}

  @Documenta({
    resumo: 'Responder na conversa do chamado',
    descricao: `Exige \`chamados.ver\`. Quem atende o chamado ou o solicitante; até 5 anexos já enviados e confirmados por quem escreve (400 \`anexo_invalido\`). Chamado resolvido: 409 \`chamado_resolvido\` (reabra antes); fechado: 409 \`chamado_fechado\`. A primeira resposta da equipe marca a métrica de primeira resposta; responder em Pendente passa a Em atendimento; o solicitante que responde em Aguardando cliente devolve o chamado ao atendimento. ${VISIVEL}`,
    corpo: enviarMensagemSchema,
    resposta: chamadoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.ver')
  @Post(':id/mensagens')
  enviar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(enviarMensagemSchema)) dados: EnviarMensagemEntrada,
  ): Promise<Chamado> {
    return this.mensagens.enviar(id, dados)
  }

  @Documenta({
    resumo: 'Fazer uma nota interna',
    descricao: `Exige \`chamados.atender\`. A nota é só da equipe: nunca entra na conversa nem aparece para o solicitante. ${VISIVEL}`,
    corpo: criarNotaInternaSchema,
    resposta: chamadoSchema,
    status: 201,
    erros: [400, 401, 403, 404],
  })
  @Permissao('chamados.atender')
  @Post(':id/notas')
  anotar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(criarNotaInternaSchema)) dados: CriarNotaInternaEntrada,
  ): Promise<Chamado> {
    return this.mensagens.anotar(id, dados)
  }

  @Documenta({
    resumo: 'Pedir o envio de um anexo',
    descricao: `Exige \`chamados.ver\` e poder responder no chamado. Devolve uma URL pré-assinada (PUT, 15 minutos) para enviar o arquivo direto ao armazenamento, de até 25 MB. Depois do PUT, chame \`/confirmar\`. Sem antivírus configurado: 503 \`anexos_indisponiveis\`. ${VISIVEL}`,
    corpo: pedirEnvioDeAnexoSchema,
    resposta: envioDeAnexoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Permissao('chamados.ver')
  @Post(':id/anexos')
  pedirEnvio(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(pedirEnvioDeAnexoSchema)) dados: PedirEnvioDeAnexoEntrada,
  ): Promise<EnvioDeAnexo> {
    return this.anexos.pedirEnvio(id, dados)
  }

  @Documenta({
    resumo: 'Confirmar o envio do anexo',
    descricao: `Exige \`chamados.ver\`. Confere o arquivo no armazenamento (409 \`anexo_nao_enviado\` se ainda não chegou; 400 \`anexo_invalido\` se o tamanho não bate, e o arquivo é descartado) e manda o antivírus varrer. O anexo nasce "pendente_varredura" e só pode ser baixado depois de "limpo". Idempotente. ${VISIVEL}`,
    resposta: anexoDoChamadoSchema,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Permissao('chamados.ver')
  @TransacaoSobDemanda()
  @Post(':id/anexos/:anexoId/confirmar')
  @HttpCode(200)
  confirmar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('anexoId', new ParseUUIDPipe()) anexoId: string,
  ): Promise<AnexoDoChamado> {
    return this.anexos.confirmar(id, anexoId)
  }

  @Documenta({
    resumo: 'Baixar um anexo',
    descricao: `Exige \`chamados.ver\`. URL pré-assinada de 5 minutos, sempre como download. Só anexo de uma mensagem e "limpo": "pendente_varredura" dá 409 \`anexo_em_verificacao\`; "infectado" dá 409 \`anexo_bloqueado\`. ${VISIVEL}`,
    resposta: downloadDeAnexoSchema,
    erros: [401, 403, 404, 409],
  })
  @Permissao('chamados.ver')
  @Get(':id/anexos/:anexoId/download')
  baixar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('anexoId', new ParseUUIDPipe()) anexoId: string,
  ): Promise<DownloadDeAnexo> {
    return this.anexos.baixar(id, anexoId)
  }
}
