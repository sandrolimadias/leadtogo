import {
  type EnviarRespostaEntrada,
  enviarRespostaSchema,
  formularioParaResponderSchema,
  type FormularioParaResponder,
  inscricaoPublicaFeitaSchema,
  type InscricaoPublicaFeita,
  paginaPublicaSchema,
  type PaginaPublica,
  respostaEnviadaSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { z } from 'zod'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PaginaPublicaService } from './pagina-publica.service.js'
import { PortalPublica, RotaDoPortal } from './portal.decorators.js'

const slugPipe = new ZodPipe(z.string().min(1).max(40))

/** Página pública de eventos e "Seja um Associado" (Fase 4H): sem login, pelo endereço público do portal. */
@ApiTags('Portal do cliente: página pública')
@RotaDoPortal()
@Controller('portal/publico/paginas/:slug')
export class PaginaPublicaController {
  constructor(private readonly servico: PaginaPublicaService) {}

  @Documenta({
    resumo: 'Página pública de eventos',
    descricao:
      'Público. O nome do portal, se há "Seja um Associado" e os eventos publicados para todos os clientes que ainda não acabaram (sem participantes nem o número de vagas). 404 `pagina_nao_encontrada` com o portal ou a página desligados.',
    resposta: paginaPublicaSchema,
    erros: [404, 429],
  })
  @PortalPublica()
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @Limite({ nome: 'portal-pagina-publica', max: 600, janelaS: 3600 })
  pagina(@Param('slug', slugPipe) slug: string): Promise<PaginaPublica> {
    return this.servico.pagina(slug)
  }

  @Documenta({
    resumo: 'Formulário da inscrição pública',
    descricao:
      'Público. O formulário de inscrição do evento, ou nome, e-mail, telefone e CNPJ. 403 `evento_so_associados` para o evento exclusivo de associados.',
    resposta: formularioParaResponderSchema,
    erros: [400, 403, 404, 429],
  })
  @PortalPublica()
  @Get('eventos/:id/inscricao')
  @Limite({ nome: 'portal-pagina-publica', max: 600, janelaS: 3600 })
  formularioDeInscricao(
    @Param('slug', slugPipe) slug: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FormularioParaResponder> {
    return this.servico.formularioDeInscricao(slug, id)
  }

  @Documenta({
    resumo: 'Inscrever-se sem login',
    descricao:
      'Público (Q-5: sem código por e-mail). Aceite de privacidade, captcha quando ligado, campo isca e limite por IP. O mesmo e-mail no mesmo evento não duplica. Lotado: lista de espera.',
    corpo: enviarRespostaSchema,
    resposta: inscricaoPublicaFeitaSchema,
    status: 201,
    erros: [400, 403, 404, 409, 422, 429],
  })
  @PortalPublica()
  @Post('eventos/:id/inscricao')
  @Limite({ nome: 'portal-inscricao-publica', max: 20, janelaS: 3600, falhaFechada: true })
  inscrever(
    @Param('slug', slugPipe) slug: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(enviarRespostaSchema)) d: EnviarRespostaEntrada,
    @Req() req: Request,
  ): Promise<InscricaoPublicaFeita> {
    return this.servico.inscrever(slug, id, d, req.ip, req.get('user-agent'))
  }

  @Documenta({
    resumo: 'Formulário "Seja um Associado"',
    descricao: 'Público. 404 `sem_associacao` quando o portal não escolheu o formulário.',
    resposta: formularioParaResponderSchema,
    erros: [404, 429],
  })
  @PortalPublica()
  @Get('associacao')
  @Limite({ nome: 'portal-pagina-publica', max: 600, janelaS: 3600 })
  formularioDeAssociacao(@Param('slug', slugPipe) slug: string): Promise<FormularioParaResponder> {
    return this.servico.formularioDeAssociacao(slug)
  }

  @Documenta({
    resumo: 'Pedir associação',
    descricao:
      'Público. Aceite de privacidade, captcha quando ligado, isca e limite por IP. A resposta fica em Formulários → Respostas; com CNPJ e o vínculo ao CRM ligado, a empresa entra como Lead e o responsável recebe a tarefa.',
    corpo: enviarRespostaSchema,
    resposta: respostaEnviadaSchema,
    status: 201,
    erros: [400, 404, 409, 422, 429],
  })
  @PortalPublica()
  @Post('associacao')
  @Limite({ nome: 'portal-associacao-publica', max: 10, janelaS: 3600, falhaFechada: true })
  associar(
    @Param('slug', slugPipe) slug: string,
    @Body(new ZodPipe(enviarRespostaSchema)) d: EnviarRespostaEntrada,
    @Req() req: Request,
  ): Promise<{ id: string | null; mensagem: string }> {
    return this.servico.associar(slug, d, req.ip, req.get('user-agent'))
  }
}
