import {
  type AlterarVerticalEntrada,
  alterarVerticalSchema,
  type CriarVerticalEntrada,
  criarVerticalSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type Vertical,
  verticalSchema,
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
import { VerticaisService } from './cadastros-simples.services.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Só administradores da empresa ativa (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Verticais da empresa ativa. Ler é de qualquer membro; escrever, do administrador. */
@ApiTags('Cadastros: verticais')
@Controller('configuracoes/verticais')
export class VerticaisController {
  constructor(private readonly servico: VerticaisService) {}

  @Documenta({
    resumo: 'Listar verticais',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde os inativados. Itens excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(verticalSchema),
    erros: [400, 401, 403, 409],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<Vertical[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar vertical',
    descricao: ESCRITA + ' Nome único entre as verticais. Nome repetido: 409 `nome_duplicado`.',
    corpo: criarVerticalSchema,
    resposta: verticalSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post()
  criar(@Body(new ZodPipe(criarVerticalSchema)) dados: CriarVerticalEntrada): Promise<Vertical> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar verticais',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os itens não excluídos, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir algum).',
    corpo: novaOrdemSchema,
    resposta: z.array(verticalSchema),
    erros: [400, 401, 403, 409],
  })
  @Put('ordem')
  reordenar(@Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada): Promise<Vertical[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar vertical',
    descricao: ESCRITA + ' Só os campos enviados mudam.',
    corpo: alterarVerticalSchema,
    resposta: verticalSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarVerticalSchema)) dados: AlterarVerticalEntrada,
  ): Promise<Vertical> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir vertical',
    descricao:
      ESCRITA +
      ' Exclusão lógica; o nome fica livre para um novo item. Só se exclui o que nunca foi usado: vertical de alguma empresa dá 409 `vertical_em_uso`: só inativar.',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
