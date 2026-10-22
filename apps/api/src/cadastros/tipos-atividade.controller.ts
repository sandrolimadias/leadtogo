import {
  type AlterarTipoAtividadeEntrada,
  alterarTipoAtividadeSchema,
  type CriarTipoAtividadeEntrada,
  criarTipoAtividadeSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type TipoAtividade,
  tipoAtividadeSchema,
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
import { TiposAtividadeService } from './cadastros-simples.services.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Exige a permissão `cadastros.gerir` do perfil de acesso (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Tipos de atividade da empresa ativa. Ler é de qualquer membro; escrever exige `cadastros.gerir`. */
@ApiTags('Cadastros: tipos de atividade')
@Controller('configuracoes/tipos-atividade')
export class TiposAtividadeController {
  constructor(private readonly servico: TiposAtividadeService) {}

  @Documenta({
    resumo: 'Listar tipos de atividade',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde os inativados. Itens excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(tipoAtividadeSchema),
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<TipoAtividade[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar tipo de atividade',
    descricao:
      ESCRITA +
      ' Nome único entre os tipos; `contaComo` (`visita`, `contato` ou `nenhum`) alimenta o controle de visitadas e contactadas; `icone` é um nome Lucide em kebab-case. Nome repetido: 409 `nome_duplicado`.',
    corpo: criarTipoAtividadeSchema,
    resposta: tipoAtividadeSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Post()
  criar(
    @Body(new ZodPipe(criarTipoAtividadeSchema)) dados: CriarTipoAtividadeEntrada,
  ): Promise<TipoAtividade> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar tipos de atividade',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os itens não excluídos, na ordem desejada (400 `ordem_invalida` se faltar, sobrar ou repetir algum).',
    corpo: novaOrdemSchema,
    resposta: z.array(tipoAtividadeSchema),
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Put('ordem')
  reordenar(@Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada): Promise<TipoAtividade[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar tipo de atividade',
    descricao:
      ESCRITA +
      ' Só os campos enviados mudam. O tipo Tarefa (`chaveSistema` `tarefa`) pode ser renomeado, mudar ícone e cor, mas não ser inativado nem excluído, e continua sem empresa obrigatória e sem contar como visita ou contato (409 `tipo_de_sistema`).',
    corpo: alterarTipoAtividadeSchema,
    resposta: tipoAtividadeSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarTipoAtividadeSchema)) dados: AlterarTipoAtividadeEntrada,
  ): Promise<TipoAtividade> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir tipo de atividade',
    descricao:
      ESCRITA +
      ' Exclusão lógica; o nome fica livre para um novo item. O tipo Tarefa (`chaveSistema` `tarefa`) pode ser renomeado, mudar ícone e cor, mas não ser inativado nem excluído, e continua sem empresa obrigatória e sem contar como visita ou contato (409 `tipo_de_sistema`).',
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
