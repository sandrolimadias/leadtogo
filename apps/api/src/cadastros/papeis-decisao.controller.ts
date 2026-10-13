import {
  type AlterarPapelDecisaoEntrada,
  alterarPapelDecisaoSchema,
  type CriarPapelDecisaoEntrada,
  criarPapelDecisaoSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type PapelDecisao,
  papelDecisaoSchema,
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
import { PapeisDecisaoService } from './cadastros-simples.services.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Só administradores da empresa ativa (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Papéis na decisão da empresa ativa (Decisor, Influenciador...). Ler é de qualquer membro; escrever, do administrador. */
@ApiTags('Cadastros: papéis na decisão')
@Controller('configuracoes/papeis-decisao')
export class PapeisDecisaoController {
  constructor(private readonly servico: PapeisDecisaoService) {}

  @Documenta({
    resumo: 'Listar papéis na decisão',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde os inativados. Itens excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(papelDecisaoSchema),
    erros: [400, 401, 403, 409],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<PapelDecisao[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar papel na decisão',
    descricao: ESCRITA + ' Nome único entre os papéis. Nome repetido: 409 `nome_duplicado`.',
    corpo: criarPapelDecisaoSchema,
    resposta: papelDecisaoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post()
  criar(
    @Body(new ZodPipe(criarPapelDecisaoSchema)) dados: CriarPapelDecisaoEntrada,
  ): Promise<PapelDecisao> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar papéis na decisão',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os itens não excluídos, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir algum).',
    corpo: novaOrdemSchema,
    resposta: z.array(papelDecisaoSchema),
    erros: [400, 401, 403, 409],
  })
  @Put('ordem')
  reordenar(@Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada): Promise<PapelDecisao[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar papel na decisão',
    descricao: ESCRITA + ' Só os campos enviados mudam.',
    corpo: alterarPapelDecisaoSchema,
    resposta: papelDecisaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarPapelDecisaoSchema)) dados: AlterarPapelDecisaoEntrada,
  ): Promise<PapelDecisao> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir papel na decisão',
    descricao:
      ESCRITA +
      ' Exclusão lógica; o nome fica livre para um novo item. Só se exclui o que nunca foi usado: papel de algum contato dá 409 `papel_em_uso`: só inativar.',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
