import {
  type AlterarSolucaoEntrada,
  alterarSolucaoSchema,
  type CriarSolucaoEntrada,
  criarSolucaoSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type Solucao,
  solucaoSchema,
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
import { SolucoesService } from './cadastros-simples.services.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Só administradores da empresa ativa (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Soluções da empresa ativa. Ler é de qualquer membro; escrever, do administrador. */
@ApiTags('Cadastros: soluções')
@Controller('configuracoes/solucoes')
export class SolucoesController {
  constructor(private readonly servico: SolucoesService) {}

  @Documenta({
    resumo: 'Listar soluções',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde os inativados. Itens excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(solucaoSchema),
    erros: [400, 401, 403, 409],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<Solucao[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar solução',
    descricao: ESCRITA + ' Nome único entre as soluções. Nome repetido: 409 `nome_duplicado`.',
    corpo: criarSolucaoSchema,
    resposta: solucaoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post()
  criar(@Body(new ZodPipe(criarSolucaoSchema)) dados: CriarSolucaoEntrada): Promise<Solucao> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar soluções',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os itens não excluídos, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir algum).',
    corpo: novaOrdemSchema,
    resposta: z.array(solucaoSchema),
    erros: [400, 401, 403, 409],
  })
  @Put('ordem')
  reordenar(@Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada): Promise<Solucao[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar solução',
    descricao: ESCRITA + ' Só os campos enviados mudam.',
    corpo: alterarSolucaoSchema,
    resposta: solucaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarSolucaoSchema)) dados: AlterarSolucaoEntrada,
  ): Promise<Solucao> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir solução',
    descricao: ESCRITA + ' Exclusão lógica; o nome fica livre para um novo item.',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
