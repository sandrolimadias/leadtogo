import {
  type AlterarOrigemEntrada,
  alterarOrigemSchema,
  type CriarOrigemEntrada,
  criarOrigemSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type Origem,
  origemSchema,
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
import { OrigensService } from './cadastros-simples.services.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Exige a permissão `cadastros.gerir` do perfil de acesso (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Origens da empresa ativa. Ler é de qualquer membro; escrever exige `cadastros.gerir`. */
@ApiTags('Cadastros: origens')
@Controller('configuracoes/origens')
export class OrigensController {
  constructor(private readonly servico: OrigensService) {}

  @Documenta({
    resumo: 'Listar origens',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde os inativados. Itens excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(origemSchema),
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<Origem[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar origem',
    descricao: ESCRITA + ' Nome único entre as origens. Nome repetido: 409 `nome_duplicado`.',
    corpo: criarOrigemSchema,
    resposta: origemSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Post()
  criar(@Body(new ZodPipe(criarOrigemSchema)) dados: CriarOrigemEntrada): Promise<Origem> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar origens',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os itens não excluídos, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir algum).',
    corpo: novaOrdemSchema,
    resposta: z.array(origemSchema),
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Put('ordem')
  reordenar(@Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada): Promise<Origem[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar origem',
    descricao:
      ESCRITA +
      ' Só os campos enviados mudam. A origem do sistema (`chaveSistema` `importacao`) pode ser renomeada, mas não inativada nem excluída (409 `origem_de_sistema`).',
    corpo: alterarOrigemSchema,
    resposta: origemSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarOrigemSchema)) dados: AlterarOrigemEntrada,
  ): Promise<Origem> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir origem',
    descricao:
      ESCRITA +
      ' Exclusão lógica; o nome fica livre para um novo item. A origem do sistema (`chaveSistema` `importacao`) pode ser renomeada, mas não inativada nem excluída (409 `origem_de_sistema`).',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
