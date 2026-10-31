import {
  type BloquearComentariosEntrada,
  bloquearComentariosSchema,
  type ConsultaDePublicacoes,
  consultaDePublicacoesSchema,
  type FixarPublicacaoEntrada,
  fixarPublicacaoSchema,
  type ListaDeComentariosParaModeracao,
  listaDeComentariosParaModeracaoSchema,
  type ListaDePublicacoes,
  listaDePublicacoesSchema,
  type ModerarComentarioEntrada,
  moderarComentarioSchema,
  type Publicacao,
  publicacaoSchema,
  type SalvarPublicacaoEntrada,
  salvarPublicacaoSchema,
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
  Put,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PublicacoesService } from './publicacoes.service.js'

const uuid = () => new ParseUUIDPipe()

/** Publicações do portal pela EQUIPE (rotas do CRM, com o perfil de acesso do CRM). */
@ApiTags('Portal do cliente: publicações')
@Controller('portal-publicacoes')
export class PublicacoesController {
  constructor(private readonly servico: PublicacoesService) {}

  @Documenta({
    resumo: 'Publicações do portal',
    descricao:
      'Exige `portal.ver`, `portal.publicar` ou `portal.moderar`. Por aba (todas, publicadas, agendadas, rascunhos), com alcance, reações, comentários e denúncias de cada uma e o total de denúncias abertas.',
    consulta: consultaDePublicacoesSchema,
    resposta: listaDePublicacoesSchema,
    erros: [400, 401, 403],
  })
  @Permissao('portal.ver', 'portal.publicar', 'portal.moderar')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDePublicacoesSchema)) consulta: ConsultaDePublicacoes,
  ): Promise<ListaDePublicacoes> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Criar uma publicação',
    descricao:
      'Exige `portal.publicar`. `situacao`: rascunho, publicada (publica agora) ou agendada (exige `agendadaPara` no futuro; 422 `agenda_no_passado`). Alcance "empresas" exige a lista de empresas (422 `empresa_invalida` se alguma não existe). O texto é Markdown restrito, sem HTML.',
    corpo: salvarPublicacaoSchema,
    resposta: publicacaoSchema,
    status: 201,
    erros: [400, 401, 403, 422],
  })
  @Permissao('portal.publicar')
  @Post()
  @Limite({ nome: 'portal-publicar', max: 120, janelaS: 3600 })
  criar(
    @Body(new ZodPipe(salvarPublicacaoSchema)) dados: SalvarPublicacaoEntrada,
  ): Promise<Publicacao> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Ver uma publicação',
    descricao: 'Exige `portal.ver`, `portal.publicar` ou `portal.moderar`.',
    resposta: publicacaoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.ver', 'portal.publicar', 'portal.moderar')
  @Get(':id')
  obter(@Param('id', uuid()) id: string): Promise<Publicacao> {
    return this.servico.detalhe(id)
  }

  @Documenta({
    resumo: 'Editar uma publicação',
    descricao:
      'Exige `portal.publicar`. Rascunho e agendada mudam livremente (inclusive para publicada). Publicada só tem o conteúdo e o alcance editados: voltar a rascunho ou agenda dá 409 `publicacao_ja_publicada`.',
    corpo: salvarPublicacaoSchema,
    resposta: publicacaoSchema,
    erros: [400, 401, 403, 404, 409, 422],
  })
  @Permissao('portal.publicar')
  @Patch(':id')
  editar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(salvarPublicacaoSchema)) dados: SalvarPublicacaoEntrada,
  ): Promise<Publicacao> {
    return this.servico.atualizar(id, dados)
  }

  @Documenta({
    resumo: 'Duplicar uma publicação',
    descricao:
      'Exige `portal.publicar`. A cópia ("Cópia de …") leva o corpo e o alcance e nasce rascunho, sem fixar, sem agenda e sem reações, comentários nem leituras.',
    resposta: publicacaoSchema,
    status: 201,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.publicar')
  @Post(':id/duplicar')
  @Limite({ nome: 'portal-publicar', max: 120, janelaS: 3600 })
  duplicar(@Param('id', uuid()) id: string): Promise<Publicacao> {
    return this.servico.duplicar(id)
  }

  @Documenta({
    resumo: 'Excluir uma publicação',
    descricao:
      'Exige `portal.publicar`. Exclusão lógica: some do portal e da lista, os dados ficam guardados.',
    status: 204,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.publicar')
  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', uuid()) id: string): Promise<void> {
    await this.servico.excluir(id)
  }

  @Documenta({
    resumo: 'Fixar ou desafixar',
    descricao:
      'Exige `portal.publicar`. Só uma publicação fica fixada por vez (fixar outra desafixa a anterior); só a já publicada pode ser fixada (409 `so_publicada_fixa`).',
    corpo: fixarPublicacaoSchema,
    resposta: publicacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.publicar')
  @Put(':id/fixada')
  fixar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(fixarPublicacaoSchema)) dados: FixarPublicacaoEntrada,
  ): Promise<Publicacao> {
    return this.servico.fixar(id, dados.fixada)
  }

  @Documenta({
    resumo: 'Bloquear ou liberar os comentários da publicação',
    descricao:
      'Exige `portal.moderar`. Bloqueada, ninguém comenta; os comentários que já existem continuam visíveis.',
    corpo: bloquearComentariosSchema,
    resposta: publicacaoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.moderar')
  @Put(':id/comentarios-bloqueados')
  bloquear(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(bloquearComentariosSchema)) dados: BloquearComentariosEntrada,
  ): Promise<Publicacao> {
    return this.servico.bloquearComentarios(id, dados.bloqueados)
  }

  @Documenta({
    resumo: 'Comentários para moderar',
    descricao:
      'Exige `portal.moderar`. Todos os comentários da publicação, inclusive os ocultos (com o motivo e quem ocultou), com a empresa do autor e as denúncias abertas.',
    resposta: listaDeComentariosParaModeracaoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.moderar')
  @Get(':id/comentarios')
  comentarios(@Param('id', uuid()) id: string): Promise<ListaDeComentariosParaModeracao> {
    return this.servico.comentarios(id)
  }

  @Documenta({
    resumo: 'Moderar um comentário',
    descricao:
      'Exige `portal.moderar`. `manter` dispensa as denúncias; `ocultar` (com motivo) esconde dos outros clientes sem apagar (o autor continua vendo, com o motivo) e encerra as denúncias; `reexibir` desfaz.',
    corpo: moderarComentarioSchema,
    resposta: listaDeComentariosParaModeracaoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.moderar')
  @Patch(':id/comentarios/:comentarioId')
  moderar(
    @Param('id', uuid()) id: string,
    @Param('comentarioId', uuid()) comentarioId: string,
    @Body(new ZodPipe(moderarComentarioSchema)) dados: ModerarComentarioEntrada,
  ): Promise<ListaDeComentariosParaModeracao> {
    return this.servico.moderar(id, comentarioId, dados)
  }
}
