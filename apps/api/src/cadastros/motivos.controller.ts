import {
  type AlterarMotivoEntrada,
  alterarMotivoSchema,
  type CriarMotivoEntrada,
  criarMotivoSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type Motivo,
  motivoSchema,
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
import { MotivosService } from './cadastros-simples.services.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Só administradores da empresa ativa (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Motivos da empresa ativa. Ler é de qualquer membro; escrever, do administrador. */
@ApiTags('Cadastros: motivos')
@Controller('configuracoes/motivos')
export class MotivosController {
  constructor(private readonly servico: MotivosService) {}

  @Documenta({
    resumo: 'Listar motivos',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde os inativados. Itens excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(motivoSchema),
    erros: [400, 401, 403, 409],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<Motivo[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar motivo',
    descricao:
      ESCRITA +
      ' Nome único entre os motivos; `aplicaA` lista os status em que o motivo vale (`perdido`, `cancelado`, `suspenso`; ao menos um). Nome repetido: 409 `nome_duplicado`.',
    corpo: criarMotivoSchema,
    resposta: motivoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post()
  criar(@Body(new ZodPipe(criarMotivoSchema)) dados: CriarMotivoEntrada): Promise<Motivo> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar motivos',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os itens não excluídos, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir algum).',
    corpo: novaOrdemSchema,
    resposta: z.array(motivoSchema),
    erros: [400, 401, 403, 409],
  })
  @Put('ordem')
  reordenar(@Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada): Promise<Motivo[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar motivo',
    descricao: ESCRITA + ' Só os campos enviados mudam.',
    corpo: alterarMotivoSchema,
    resposta: motivoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarMotivoSchema)) dados: AlterarMotivoEntrada,
  ): Promise<Motivo> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir motivo',
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
