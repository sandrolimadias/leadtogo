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

import { Permissao, TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { TagsService } from './tags.service.js'

const consultaSchema = z
  .object({
    incluirInativos: z.enum(['true', 'false']).default('false'),
    /** Sem o parâmetro, só os grupos de empresa (as telas de empresa nunca veem as de contato nem as de oportunidade) */
    aplicaA: z.enum(['empresa', 'contato', 'oportunidade', 'todos']).default('empresa'),
  })
  .strict()

const ESCRITA =
  'Exige a permissão `cadastros.gerir` do perfil de acesso (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Grupos de tags e tags da empresa ativa. Ler é de qualquer membro; escrever exige `cadastros.gerir`. */
@ApiTags('Cadastros: tags')
@Controller('configuracoes')
export class TagsController {
  constructor(private readonly servico: TagsService) {}

  @Documenta({
    resumo: 'Grupos de tags com suas tags',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde grupos e tags inativados. Itens excluídos nunca aparecem. `aplicaA` escolhe os grupos de empresa (padrão), os de contato, os de oportunidade ou `todos`.',
    consulta: consultaSchema,
    resposta: z.array(tagGrupoSchema),
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get('tag-grupos')
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<TagGrupo[]> {
    return this.servico.listar(
      consulta.incluirInativos === 'true',
      consulta.aplicaA === 'todos' ? undefined : consulta.aplicaA,
    )
  }

  @Documenta({
    resumo: 'Criar grupo de tags',
    descricao: `${ESCRITA} Nome único entre os grupos, de empresa, de contato e de oportunidade (409 \`nome_duplicado\`). \`aplicaA\` (padrão \`empresa\`) não muda depois; grupo de contato ou de oportunidade não é obrigatório.`,
    corpo: criarTagGrupoSchema,
    resposta: tagGrupoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
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
  @Permissao('cadastros.gerir')
  @Put('tag-grupos/ordem')
  reordenarGrupos(
    @Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada,
  ): Promise<TagGrupo[]> {
    return this.servico.reordenarGrupos(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar grupo de tags',
    descricao: `${ESCRITA} Grupo do sistema (Status, Visitação) só pode ser renomeado: mexer na seleção, no "obrigatório" ou inativar dá 409 \`grupo_de_sistema\`. Grupo de contato ou de oportunidade não vira obrigatório (409 \`grupo_de_contato\`). O destino (\`aplicaA\`) não muda.`,
    corpo: alterarTagGrupoSchema,
    resposta: tagGrupoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
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
  @Permissao('cadastros.gerir')
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
  @Permissao('cadastros.gerir')
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
  @Permissao('cadastros.gerir')
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
  @Permissao('cadastros.gerir')
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
  @Permissao('cadastros.gerir')
  @Delete('tags/:id')
  @HttpCode(204)
  excluirTag(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluirTag(id)
  }
}
