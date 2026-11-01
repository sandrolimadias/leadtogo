import {
  type ConsultaDeFormularios,
  consultaDeFormulariosSchema,
  type ConsultaDeRespostas,
  consultaDeRespostasSchema,
  type EnviarRespostaEntrada,
  enviarRespostaSchema,
  type Formulario,
  formularioParaResponderSchema,
  formularioSchema,
  type FormularioParaResponder,
  listaDeFormulariosSchema,
  type ListaDeFormularios,
  listaDeRespostasSchema,
  respostaEnviadaSchema,
  type SalvarFormularioEntrada,
  salvarFormularioSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
import { FormulariosService } from './formularios.service.js'
import { PortalPublica, RotaDoPortal } from './portal.decorators.js'
import { ResponderFormularioService } from './responder-formulario.service.js'

const uuid = () => new ParseUUIDPipe({ version: '7' })
const arquivarSchema = z.object({ arquivado: z.boolean() }).strict()

/** Formulários do portal pela EQUIPE (Fase 4E): construtor, publicação e respostas. */
@ApiTags('Portal do cliente: formulários')
@Controller('portal-formularios')
export class FormulariosController {
  constructor(private readonly servico: FormulariosService) {}

  @Documenta({
    resumo: 'Listar formulários',
    descricao:
      'Exige `portal.ver` ou `portal.formularios`. Os mais recentes primeiro, com o total de respostas.',
    consulta: consultaDeFormulariosSchema,
    resposta: listaDeFormulariosSchema,
    erros: [400, 401, 403],
  })
  @Permissao('portal.ver', 'portal.formularios')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeFormulariosSchema)) c: ConsultaDeFormularios,
  ): Promise<ListaDeFormularios> {
    return this.servico.listar(c)
  }

  @Documenta({
    resumo: 'Criar um formulário',
    descricao:
      'Exige `portal.formularios`. Nasce rascunho, com um endereço público próprio (`slug`). Só passa a aceitar respostas depois de publicado.',
    corpo: salvarFormularioSchema,
    resposta: formularioSchema,
    status: 201,
    erros: [400, 401, 403],
  })
  @Permissao('portal.formularios')
  @Post()
  @Limite({ nome: 'portal-formularios', max: 300, janelaS: 3600 })
  criar(
    @Body(new ZodPipe(salvarFormularioSchema)) d: SalvarFormularioEntrada,
  ): Promise<Formulario> {
    return this.servico.criar(d)
  }

  @Documenta({
    resumo: 'Ver um formulário',
    descricao:
      'Exige `portal.ver` ou `portal.formularios`. Traz o rascunho (a definição que o construtor edita).',
    resposta: formularioSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.ver', 'portal.formularios')
  @Get(':id')
  obter(@Param('id', uuid()) id: string): Promise<Formulario> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Salvar o rascunho',
    descricao:
      'Exige `portal.formularios`. O que está publicado só muda ao publicar de novo (as respostas guardam a versão).',
    corpo: salvarFormularioSchema,
    resposta: formularioSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.formularios')
  @Put(':id')
  @Limite({ nome: 'portal-formularios', max: 300, janelaS: 3600 })
  salvar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(salvarFormularioSchema)) d: SalvarFormularioEntrada,
  ): Promise<Formulario> {
    return this.servico.atualizar(id, d)
  }

  @Documenta({
    resumo: 'Publicar',
    descricao:
      'Exige `portal.formularios`. Congela o rascunho numa versão nova e passa a aceitar respostas. Definição inválida: 422 `definicao_invalida`.',
    resposta: formularioSchema,
    erros: [400, 401, 403, 404, 422],
  })
  @Permissao('portal.formularios')
  @Post(':id/publicar')
  @HttpCode(200)
  publicar(@Param('id', uuid()) id: string): Promise<Formulario> {
    return this.servico.publicar(id)
  }

  @Documenta({
    resumo: 'Arquivar ou reativar',
    descricao: 'Exige `portal.formularios`. Arquivado não aceita respostas; as que existem ficam.',
    corpo: arquivarSchema,
    resposta: formularioSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.formularios')
  @Put(':id/arquivado')
  arquivar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(arquivarSchema)) d: { arquivado: boolean },
  ): Promise<Formulario> {
    return this.servico.arquivar(id, d.arquivado)
  }

  @Documenta({
    resumo: 'Duplicar',
    descricao: 'Exige `portal.formularios`. Cópia em rascunho, sem respostas.',
    resposta: formularioSchema,
    status: 201,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.formularios')
  @Post(':id/duplicar')
  duplicar(@Param('id', uuid()) id: string): Promise<Formulario> {
    return this.servico.duplicar(id)
  }

  @Documenta({
    resumo: 'Excluir',
    descricao:
      'Exige `portal.formularios`. Exclusão lógica: some da lista e deixa de aceitar respostas.',
    status: 204,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.formularios')
  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', uuid()) id: string): Promise<void> {
    await this.servico.excluir(id)
  }

  @Documenta({
    resumo: 'Gerar o segredo dos webhooks',
    descricao:
      'Exige `portal.formularios`. Gera (ou troca) o segredo que assina as ações de webhook (`X-Leadtogo-Assinatura`, HMAC-SHA256). Aparece só nesta resposta.',
    resposta: z.object({ segredo: z.string() }),
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.formularios')
  @Post(':id/segredo')
  @HttpCode(200)
  regerarSegredo(@Param('id', uuid()) id: string): Promise<{ segredo: string }> {
    return this.servico.regerarSegredo(id)
  }

  @Documenta({
    resumo: 'Respostas',
    descricao:
      'Exige `portal.ver` ou `portal.formularios`. As mais recentes primeiro, com a pessoa e a empresa (quando logadas) e os campos da versão publicada.',
    consulta: consultaDeRespostasSchema,
    resposta: listaDeRespostasSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.ver', 'portal.formularios')
  @Get(':id/respostas')
  respostas(
    @Param('id', uuid()) id: string,
    @Query(new ZodPipe(consultaDeRespostasSchema)) c: ConsultaDeRespostas,
  ) {
    return this.servico.respostas(id, c)
  }

  @Documenta({
    resumo: 'Exportar as respostas (CSV)',
    descricao:
      'Exige `portal.formularios`. CSV em UTF-8 com BOM e ";" (abre direto no Excel em português). A exportação fica na auditoria.',
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.formularios')
  @Get(':id/respostas.csv')
  async exportar(@Param('id', uuid()) id: string, @Res() res: Response): Promise<void> {
    const r = await this.servico.exportarCsv(id)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${r.nome}"`)
    res.send(r.conteudo)
  }
}

/** Formulários pelo CLIENTE do portal (logado) e pelo endereço público. */
@ApiTags('Portal do cliente: formulários')
@RotaDoPortal()
@Controller('portal')
export class PortalFormulariosController {
  constructor(private readonly servico: ResponderFormularioService) {}

  @Documenta({
    resumo: 'Abrir um formulário (logado)',
    descricao:
      'A versão publicada, com os valores do preenchimento automático montados pelo servidor (os travados não mudam).',
    resposta: formularioParaResponderSchema,
    erros: [400, 401, 403, 404, 503],
  })
  @Get('formularios/:id')
  abrir(@Param('id', uuid()) id: string): Promise<FormularioParaResponder> {
    return this.servico.paraOCliente(id)
  }

  @Documenta({
    resumo: 'Responder (logado)',
    descricao:
      'Valida tudo de novo no servidor (condicionais, obrigatórios, formatos; os campos travados vêm da sessão). Versão antiga: 409 `versao_desatualizada`. Campos inválidos: 422 `respostas_invalidas` com os detalhes por campo.',
    corpo: enviarRespostaSchema,
    resposta: respostaEnviadaSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 413, 422, 429, 503],
  })
  @Post('formularios/:id/respostas')
  @Limite({ nome: 'portal-formulario-responder', max: 60, janelaS: 3600 })
  async responder(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(enviarRespostaSchema)) d: EnviarRespostaEntrada,
  ): Promise<{ id: string | null; mensagem: string }> {
    const r = await this.servico.responderComoCliente(id, d)
    return { id: r.id, mensagem: r.mensagem }
  }

  @Documenta({
    resumo: 'Abrir um formulário público',
    descricao:
      'Público. Só formulário publicado e com acesso "público". Traz a chave do captcha quando ligado.',
    resposta: formularioParaResponderSchema,
    erros: [400, 404, 429, 503],
  })
  @PortalPublica()
  @Get('publico/formularios/:slug')
  @Limite({ nome: 'portal-formulario-publico', max: 300, janelaS: 3600 })
  abrirPublico(@Param('slug') slug: string): Promise<FormularioParaResponder> {
    return this.servico.publico(slug)
  }

  @Documenta({
    resumo: 'Responder um formulário público',
    descricao:
      'Público. Exige `aceitaPrivacidade: true` (422 `privacidade_obrigatoria`) e o captcha quando ligado (422 `captcha_invalido`). Limite por IP.',
    corpo: enviarRespostaSchema,
    resposta: respostaEnviadaSchema,
    status: 201,
    erros: [400, 404, 409, 413, 422, 429, 503],
  })
  @PortalPublica()
  @Post('publico/formularios/:slug/respostas')
  @Limite({
    nome: 'portal-formulario-publico-responder',
    max: 20,
    janelaS: 3600,
    falhaFechada: true,
  })
  responderPublico(
    @Param('slug') slug: string,
    @Body(new ZodPipe(enviarRespostaSchema)) d: EnviarRespostaEntrada,
    @Req() req: Request,
  ): Promise<{ id: string | null; mensagem: string }> {
    return this.servico.responderPublico(slug, d, req.ip, req.headers['user-agent'])
  }
}
