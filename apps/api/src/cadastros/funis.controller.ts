import {
  type AlterarFaseEntrada,
  type AlterarFunilEntrada,
  alterarFaseSchema,
  alterarFunilSchema,
  type CriarFaseEntrada,
  type CriarFunilEntrada,
  criarFaseSchema,
  criarFunilSchema,
  type Funil,
  funilSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
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
import { FunisService } from './funis.service.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Só administradores da empresa ativa (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Funis e fases da empresa ativa. Ler é de qualquer membro; escrever, do administrador. */
@ApiTags('Cadastros: funis')
@Controller('configuracoes/funis')
export class FunisController {
  constructor(private readonly servico: FunisService) {}

  @Documenta({
    resumo: 'Listar funis com suas fases',
    descricao:
      'Qualquer membro da empresa ativa. Funis e fases em ordem de exibição; sem `incluirInativos=true`, esconde os funis inativados. Excluídos nunca aparecem. Há sempre um funil com `padrao: true`.',
    consulta: consultaSchema,
    resposta: z.array(funilSchema),
    erros: [400, 401, 403, 409],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<Funil[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar funil',
    descricao:
      ESCRITA +
      ' O funil nasce com as fases do corpo (ao menos uma, na ordem enviada). O primeiro funil da empresa é o padrão; os demais nascem comuns. Nome de funil ou de fase repetido: 409 `nome_duplicado`.',
    corpo: criarFunilSchema,
    resposta: funilSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post()
  criar(@Body(new ZodPipe(criarFunilSchema)) dados: CriarFunilEntrada): Promise<Funil> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar os funis',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os funis não excluídos, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir algum).',
    corpo: novaOrdemSchema,
    resposta: z.array(funilSchema),
    erros: [400, 401, 403, 409],
  })
  @Put('ordem')
  reordenar(@Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada): Promise<Funil[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar funil',
    descricao:
      ESCRITA +
      ' Renomear, inativar/reativar e tornar padrão (`padrao: true`; o padrão anterior deixa de ser). O funil padrão não pode ser inativado (409 `funil_padrao`) e um funil inativo não pode virar padrão (409 `funil_inativo`). Não existe "desmarcar" o padrão: escolha outro funil.',
    corpo: alterarFunilSchema,
    resposta: funilSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarFunilSchema)) dados: AlterarFunilEntrada,
  ): Promise<Funil> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir funil',
    descricao:
      ESCRITA +
      ' Exclusão lógica do funil e das fases dele. O funil padrão não se exclui (409 `funil_padrao`).',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }

  @Documenta({
    resumo: 'Criar fase no funil',
    descricao:
      ESCRITA +
      ' A fase entra no fim do funil. Devolve o funil completo. Nome único dentro do funil (409 `nome_duplicado`).',
    corpo: criarFaseSchema,
    resposta: funilSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Post(':id/fases')
  criarFase(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(criarFaseSchema)) dados: CriarFaseEntrada,
  ): Promise<Funil> {
    return this.servico.criarFase(id, dados)
  }

  @Documenta({
    resumo: 'Reordenar as fases de um funil',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODAS as fases não excluídas do funil, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir alguma). Devolve o funil completo.',
    corpo: novaOrdemSchema,
    resposta: funilSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Put(':id/fases/ordem')
  reordenarFases(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada,
  ): Promise<Funil> {
    return this.servico.reordenarFases(id, dados.ids)
  }

  @Documenta({
    resumo: 'Alterar fase',
    descricao:
      ESCRITA +
      ' Só os campos enviados mudam: nome, cor, probabilidade padrão (0 a 100) e dias para o alerta de parada (null = sem alerta). Devolve o funil completo.',
    corpo: alterarFaseSchema,
    resposta: funilSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch('fases/:faseId')
  alterarFase(
    @Param('faseId', new ParseUUIDPipe()) faseId: string,
    @Body(new ZodPipe(alterarFaseSchema)) dados: AlterarFaseEntrada,
  ): Promise<Funil> {
    return this.servico.alterarFase(faseId, dados)
  }

  @Documenta({
    resumo: 'Excluir fase',
    descricao:
      ESCRITA +
      ' Exclusão lógica. A última fase do funil não se exclui (409 `ultima_fase`). Devolve o funil completo.',
    resposta: funilSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete('fases/:faseId')
  excluirFase(@Param('faseId', new ParseUUIDPipe()) faseId: string): Promise<Funil> {
    return this.servico.excluirFase(faseId)
  }
}
