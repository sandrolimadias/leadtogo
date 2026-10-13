import {
  type AlterarTagEntrada,
  type AlterarTagGrupoEntrada,
  alterarTagGrupoSchema,
  alterarTagSchema,
  type CriarTagEntrada,
  type CriarTagGrupoEntrada,
  criarTagGrupoSchema,
  criarTagSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type Tag,
  type TagGrupo,
  tagGrupoSchema,
  tagSchema,
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
import { z } from 'zod'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { TagsService } from './tags.service.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Só administradores da empresa ativa (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Grupos de tags e tags da empresa ativa. Ler é de qualquer membro; escrever, do administrador. */
@ApiTags('Cadastros: tags')
@Controller('configuracoes')
export class TagsController {
  constructor(private readonly servico: TagsService) {}

  @Documenta({
    resumo: 'Grupos de tags com suas tags',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde grupos e tags inativados. Itens excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(tagGrupoSchema),
    erros: [400, 401, 403, 409],
  })
  @Get('tag-grupos')
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<TagGrupo[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar grupo de tags',
    descricao: `${ESCRITA} Nome único entre os grupos (409 \`nome_duplicado\`).`,
    corpo: criarTagGrupoSchema,
    resposta: tagGrupoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post('tag-grupos')
  criarGrupo(
    @Body(new ZodPipe(criarTagGrupoSchema)) dados: CriarTagGrupoEntrada,
  ): Promise<TagGrupo> {
    return this.servico.criarGrupo(dados)
  }

  @Documenta({
    resumo: 'Reordenar os grupos de tags',
    descricao: `${ESCRITA} O corpo traz os ids de TODOS os grupos não excluídos, na ordem desejada (400 \`ordem_invalida\` se faltar, sobrar ou repetir algum).`,
    corpo: novaOrdemSchema,
    resposta: z.array(tagGrupoSchema),
    erros: [400, 401, 403, 409],
  })
  @Put('tag-grupos/ordem')
  reordenarGrupos(
    @Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada,
  ): Promise<TagGrupo[]> {
    return this.servico.reordenarGrupos(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar grupo de tags',
    descricao: `${ESCRITA} Grupo do sistema (Status, Visitação) só pode ser renomeado: mexer na seleção, no "obrigatório" ou inativar dá 409 \`grupo_de_sistema\`.`,
    corpo: alterarTagGrupoSchema,
    resposta: tagGrupoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch('tag-grupos/:id')
  alterarGrupo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarTagGrupoSchema)) dados: AlterarTagGrupoEntrada,
  ): Promise<TagGrupo> {
    return this.servico.alterarGrupo(id, dados)
  }

  @Documenta({
    resumo: 'Excluir grupo de tags',
    descricao: `${ESCRITA} Exclusão lógica do grupo e das tags dele. Grupo do sistema não se exclui (409 \`grupo_de_sistema\`). Só se exclui o que nunca foi usado: se alguma tag do grupo já esteve em uma empresa (inclusive no histórico de Status), 409 \`grupo_em_uso\`: só inativar.`,
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete('tag-grupos/:id')
  @HttpCode(204)
  excluirGrupo(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluirGrupo(id)
  }

  @Documenta({
    resumo: 'Reordenar as tags de um grupo',
    descricao: `${ESCRITA} O corpo traz os ids de TODAS as tags não excluídas do grupo, na ordem desejada (400 \`ordem_invalida\` se faltar, sobrar ou repetir alguma).`,
    corpo: novaOrdemSchema,
    resposta: tagGrupoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Put('tag-grupos/:id/tags/ordem')
  reordenarTags(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada,
  ): Promise<TagGrupo> {
    return this.servico.reordenarTags(id, dados.ids)
  }

  @Documenta({
    resumo: 'Criar tag',
    descricao: `${ESCRITA} Nome único dentro do grupo (409 \`nome_duplicado\`). Grupo automático (Visitação) não aceita tags novas (409 \`grupo_automatico\`).`,
    corpo: criarTagSchema,
    resposta: tagSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Post('tags')
  criarTag(@Body(new ZodPipe(criarTagSchema)) dados: CriarTagEntrada): Promise<Tag> {
    return this.servico.criarTag(dados)
  }

  @Documenta({
    resumo: 'Alterar tag',
    descricao: `${ESCRITA} Tag usada pelas regras do sistema (Lead, Cliente, Visitada...) pode ser renomeada e recolorida, mas não inativada (409 \`tag_de_sistema\`).`,
    corpo: alterarTagSchema,
    resposta: tagSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch('tags/:id')
  alterarTag(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarTagSchema)) dados: AlterarTagEntrada,
  ): Promise<Tag> {
    return this.servico.alterarTag(id, dados)
  }

  @Documenta({
    resumo: 'Excluir tag',
    descricao: `${ESCRITA} Exclusão lógica. Tag usada pelas regras do sistema não se exclui (409 \`tag_de_sistema\`). Só se exclui o que nunca foi usado: tag que já esteve em uma empresa (atual ou no histórico de Status) dá 409 \`tag_em_uso\`: só inativar.`,
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete('tags/:id')
  @HttpCode(204)
  excluirTag(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluirTag(id)
  }
}
