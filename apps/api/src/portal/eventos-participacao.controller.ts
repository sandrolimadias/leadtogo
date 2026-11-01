import {
  checkinDoEventoSchema,
  checkinPublicoSchema,
  type CheckinPublico,
  type EnviarRespostaEntrada,
  enviarRespostaSchema,
  eventoDoPortalSchema,
  type EventoDoPortal,
  type FazerCheckinEntrada,
  fazerCheckinSchema,
  formularioParaResponderSchema,
  type FormularioParaResponder,
  type IncluirParticipanteEntrada,
  incluirParticipanteSchema,
  listaDeEventosDaEmpresaSchema,
  listaDeParticipantesSchema,
  type ListaDeParticipantes,
  registrarPresencaSchema,
  type ReenviarAvaliacaoEntrada,
  reenviarAvaliacaoSchema,
  respostaEnviadaSchema,
  resultadoDoCheckinSchema,
  type ResultadoDoCheckin,
  resultadoDoPedidoDeAvaliacaoSchema,
  type ResultadoDoPedidoDeAvaliacao,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { z } from 'zod'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { EventosInscricaoService } from './eventos-inscricao.service.js'
import { EventosParticipacaoService } from './eventos-participacao.service.js'
import { EventosService } from './eventos.service.js'
import { PortalPublica, RotaDoPortal } from './portal.decorators.js'

const uuid = () => new ParseUUIDPipe()
const tokenPipe = new ZodPipe(z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/))

/** Eventos 2.0 pela EQUIPE (Fase 4G): presença, encerramento, avaliação, check-in e relatórios. */
@ApiTags('Portal do cliente: agenda')
@Controller('portal-eventos')
export class EventosParticipacaoController {
  constructor(
    private readonly servico: EventosParticipacaoService,
    private readonly eventos: EventosService,
  ) {}

  @Documenta({
    resumo: 'Registrar ou desfazer a presença',
    descricao:
      'Exige `portal.eventos_presenca` ou `portal.agenda`. Para quem participou sem fazer o check-in (B-20).',
    corpo: registrarPresencaSchema,
    resposta: listaDeParticipantesSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.eventos_presenca', 'portal.agenda')
  @Put(':id/participantes/:participacaoId/presenca')
  async presenca(
    @Param('id', uuid()) id: string,
    @Param('participacaoId', uuid()) participacaoId: string,
    @Body(new ZodPipe(registrarPresencaSchema)) d: { presente: boolean },
  ): Promise<ListaDeParticipantes> {
    await this.servico.registrarPresenca(id, participacaoId, d.presente)
    return this.eventos.participantes(id)
  }

  @Documenta({
    resumo: 'Incluir participante presente',
    descricao:
      'Exige `portal.eventos_presenca` ou `portal.agenda`. Quem veio sem se inscrever entra já com a presença registrada; com CNPJ, vai ao CRM como as inscrições (quando ligado).',
    corpo: incluirParticipanteSchema,
    resposta: listaDeParticipantesSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.eventos_presenca', 'portal.agenda')
  @Post(':id/participantes')
  async incluir(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(incluirParticipanteSchema)) d: IncluirParticipanteEntrada,
  ): Promise<ListaDeParticipantes> {
    await this.servico.incluir(id, d)
    return this.eventos.participantes(id)
  }

  @Documenta({
    resumo: 'Encerrar o evento',
    descricao:
      'Exige `portal.agenda`. Depois do início. Quem não tem presença fica ausente; os presentes recebem o pedido de avaliação (push e sino no portal; e-mail com link pessoal para quem não tem acesso, se ligado em Configurações → Portal).',
    resposta: resultadoDoPedidoDeAvaliacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.agenda')
  @Post(':id/encerrar')
  @HttpCode(200)
  encerrar(@Param('id', uuid()) id: string): Promise<ResultadoDoPedidoDeAvaliacao> {
    return this.servico.encerrar(id)
  }

  @Documenta({
    resumo: 'Reenviar o pedido de avaliação',
    descricao:
      'Exige `portal.agenda`. A quem esteve presente e ainda não avaliou (ou às pessoas escolhidas); no máximo 3 pedidos por pessoa.',
    corpo: reenviarAvaliacaoSchema,
    resposta: resultadoDoPedidoDeAvaliacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.agenda')
  @Post(':id/avaliacoes/reenviar')
  @HttpCode(200)
  @Limite({ nome: 'portal-avaliacao-reenviar', max: 30, janelaS: 3600 })
  reenviar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(reenviarAvaliacaoSchema)) d: ReenviarAvaliacaoEntrada,
  ): Promise<ResultadoDoPedidoDeAvaliacao> {
    return this.servico.reenviarAvaliacao(id, d.participacaoIds)
  }

  @Documenta({
    resumo: 'Gerar o QR de check-in',
    descricao:
      'Exige `portal.agenda`. Gera (ou troca) o endereço do QR: aparece só nesta resposta (no banco, só o hash). O QR antigo para de valer.',
    resposta: checkinDoEventoSchema,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Permissao('portal.agenda')
  @Post(':id/checkin')
  @HttpCode(200)
  gerarCheckin(@Param('id', uuid()) id: string): Promise<{ url: string; token: string }> {
    return this.servico.gerarCheckin(id)
  }

  @Documenta({
    resumo: 'Inscritos (CSV)',
    descricao:
      'Exige `portal.eventos_relatorios` ou `portal.agenda`. Todas as inscrições (inclusive canceladas), com presença, avaliação e os campos do formulário de inscrição.',
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.eventos_relatorios', 'portal.agenda')
  @Get(':id/inscritos.csv')
  async csv(@Param('id', uuid()) id: string, @Res() res: Response): Promise<void> {
    const r = await this.servico.exportarCsv(id)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${r.nome}"`)
    res.send(r.conteudo)
  }

  @Documenta({
    resumo: 'Inscritos (Excel)',
    descricao: 'Exige `portal.eventos_relatorios` ou `portal.agenda`.',
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.eventos_relatorios', 'portal.agenda')
  @Get(':id/inscritos.xlsx')
  async xlsx(@Param('id', uuid()) id: string, @Res() res: Response): Promise<void> {
    const r = await this.servico.exportarXlsx(id)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader('Content-Disposition', `attachment; filename="${r.nome}"`)
    res.send(r.conteudo)
  }

  @Documenta({
    resumo: 'Inscritos (para imprimir ou salvar em PDF)',
    descricao:
      'Exige `portal.eventos_relatorios` ou `portal.agenda`. Página A4 paisagem que abre a impressão do navegador ("Salvar como PDF").',
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.eventos_relatorios', 'portal.agenda')
  @Get(':id/inscritos.html')
  async impressao(@Param('id', uuid()) id: string, @Res() res: Response): Promise<void> {
    const r = await this.servico.exportarImpressao(id)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    )
    res.send(r.conteudo)
  }
}

/** Aba Eventos da ficha da empresa (B-21). */
@ApiTags('Carteira: empresas')
@Controller('empresas')
export class EventosDaEmpresaController {
  constructor(private readonly servico: EventosParticipacaoService) {}

  @Documenta({
    resumo: 'Eventos da empresa',
    descricao:
      'Regra de carteira (empresa que o usuário não vê responde 404). Quem da empresa se inscreveu nos eventos do portal, com a presença e a nota da avaliação.',
    resposta: listaDeEventosDaEmpresaSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('empresas.ver')
  @Get(':id/eventos')
  eventos(@Param('id', uuid()) id: string): Promise<z.infer<typeof listaDeEventosDaEmpresaSchema>> {
    return this.servico.daEmpresa(id)
  }
}

/** Eventos 2.0 pelo CLIENTE do portal e pelas páginas sem login (QR e link da avaliação). */
@ApiTags('Portal do cliente: agenda')
@RotaDoPortal()
@Controller('portal')
export class PortalEventosInscricaoController {
  constructor(private readonly servico: EventosInscricaoService) {}

  @Documenta({
    resumo: 'Inscrever-se com o formulário do evento',
    descricao:
      'O formulário vem preenchido com o cadastro (CNPJ, empresa, nome, telefone, e-mail) para conferência. Vagas e lista de espera como na confirmação.',
    corpo: enviarRespostaSchema,
    resposta: eventoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 422, 429, 503],
  })
  @Post('eventos/:id/inscricao')
  @Limite({ nome: 'portal-evento-inscricao', max: 60, janelaS: 3600 })
  inscrever(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(enviarRespostaSchema)) d: EnviarRespostaEntrada,
  ): Promise<EventoDoPortal> {
    return this.servico.inscrever(id, d)
  }

  @Documenta({
    resumo: 'Formulário de avaliação do evento',
    descricao: 'Só para quem esteve presente, depois do encerramento e enquanto não avaliou.',
    resposta: formularioParaResponderSchema,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Get('eventos/:id/avaliacao')
  formularioDeAvaliacao(@Param('id', uuid()) id: string): Promise<FormularioParaResponder> {
    return this.servico.formularioDeAvaliacao(id)
  }

  @Documenta({
    resumo: 'Avaliar o evento',
    descricao: 'Só presente, depois do encerramento; uma vez (409 `ja_avaliado`).',
    corpo: enviarRespostaSchema,
    resposta: eventoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 422, 429, 503],
  })
  @Post('eventos/:id/avaliacao')
  @Limite({ nome: 'portal-evento-avaliacao', max: 30, janelaS: 3600 })
  avaliar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(enviarRespostaSchema)) d: EnviarRespostaEntrada,
  ): Promise<EventoDoPortal> {
    return this.servico.avaliar(id, d)
  }

  @Documenta({
    resumo: 'Check-in pelo QR (logado)',
    descricao:
      'Um toque: marca a presença da própria inscrição confirmada. Fora do horário: 409 `checkin_fechado`.',
    resposta: resultadoDoCheckinSchema,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Post('checkin/:token')
  @HttpCode(200)
  checkinLogado(@Param('token', tokenPipe) token: string): Promise<ResultadoDoCheckin> {
    return this.servico.checkinLogado(token)
  }

  @Documenta({
    resumo: 'Abrir o QR de check-in',
    descricao: 'Público. O evento, se o check-in está aberto agora e se pede o código por e-mail.',
    resposta: checkinPublicoSchema,
    erros: [400, 404, 429, 503],
  })
  @PortalPublica()
  @Get('publico/checkin/:token')
  @Limite({ nome: 'portal-checkin-publico', max: 600, janelaS: 3600 })
  checkinPublico(@Param('token', tokenPipe) token: string): Promise<CheckinPublico> {
    return this.servico.checkinPublico(token)
  }

  @Documenta({
    resumo: 'Fazer o check-in sem login',
    descricao:
      'Público. Com o e-mail da inscrição. Se o evento exige, o primeiro envio manda o código de 6 dígitos ao e-mail (`codigo_enviado`) e o segundo confere. Limite por IP.',
    corpo: fazerCheckinSchema,
    resposta: resultadoDoCheckinSchema,
    erros: [400, 401, 404, 409, 429, 503],
  })
  @PortalPublica()
  @Post('publico/checkin/:token')
  @HttpCode(200)
  @Limite({ nome: 'portal-checkin-fazer', max: 120, janelaS: 3600, falhaFechada: true })
  fazerCheckin(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(fazerCheckinSchema)) d: FazerCheckinEntrada,
  ): Promise<ResultadoDoCheckin> {
    return this.servico.fazerCheckin(token, d)
  }

  @Documenta({
    resumo: 'Abrir a avaliação pelo link pessoal',
    descricao: 'Público. O link que chega por e-mail a quem não tem acesso ao portal.',
    resposta: formularioParaResponderSchema.extend({ evento: z.string() }),
    erros: [400, 404, 409, 429, 503],
  })
  @PortalPublica()
  @Get('publico/avaliacao/:token')
  @Limite({ nome: 'portal-avaliacao-link', max: 120, janelaS: 3600 })
  avaliacaoPorLink(
    @Param('token', tokenPipe) token: string,
  ): Promise<FormularioParaResponder & { evento: string }> {
    return this.servico.avaliacaoPorLink(token)
  }

  @Documenta({
    resumo: 'Avaliar pelo link pessoal',
    descricao: 'Público. Uma avaliação por participação (409 `ja_avaliado`).',
    corpo: enviarRespostaSchema,
    resposta: respostaEnviadaSchema,
    status: 201,
    erros: [400, 404, 409, 422, 429, 503],
  })
  @PortalPublica()
  @Post('publico/avaliacao/:token')
  @Limite({ nome: 'portal-avaliacao-link-responder', max: 30, janelaS: 3600, falhaFechada: true })
  avaliarPorLink(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(enviarRespostaSchema)) d: EnviarRespostaEntrada,
    @Req() req: Request,
  ): Promise<{ id: string; mensagem: string }> {
    return this.servico.avaliarPorLink(token, d, req.ip)
  }
}
