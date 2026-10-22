import {
  type AlterarPerfilDeImportacaoEntrada,
  alterarPerfilDeImportacaoSchema,
  type CnaesConferidos,
  cnaesConferidosSchema,
  type ConferirCnaesEntrada,
  conferirCnaesSchema,
  type CriarPerfilDeImportacaoEntrada,
  criarPerfilDeImportacaoSchema,
  type PerfilDeImportacao,
  perfilDeImportacaoSchema,
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
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Permissao, TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { PerfisDeImportacaoService } from './perfis.service.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA = 'Exige `cadastros.gerir` (403 `acesso_negado` sem ela). Registra na auditoria.'

/** Perfis de regras da importação da empresa ativa. Ler é de qualquer membro; escrever, do administrador. */
@ApiTags('Importação: perfis de regras')
@Controller('importacao/perfis')
export class PerfisDeImportacaoController {
  constructor(private readonly servico: PerfisDeImportacaoService) {}

  @Documenta({
    resumo: 'Listar perfis de importação',
    descricao:
      'Qualquer membro da empresa ativa. Por nome; sem `incluirInativos=true`, esconde os inativados. Perfis excluídos nunca aparecem.',
    consulta: consultaSchema,
    resposta: z.array(perfilDeImportacaoSchema),
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<PerfilDeImportacao[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Conferir uma lista de CNAEs colada',
    descricao:
      'Qualquer membro da empresa ativa. Lê códigos de 6 ou 7 dígitos, com ou sem pontuação, separados por espaço, vírgula, ponto e vírgula ou linha. Devolve os que existem na tabela de CNAEs (com a descrição), os inválidos (com o motivo) e quantas repetições foram ignoradas. Não grava nada.',
    corpo: conferirCnaesSchema,
    resposta: cnaesConferidosSchema,
    status: 200,
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Post('cnaes/conferir')
  @HttpCode(200)
  conferirCnaes(
    @Body(new ZodPipe(conferirCnaesSchema)) dados: ConferirCnaesEntrada,
  ): Promise<CnaesConferidos> {
    return this.servico.conferirCnaes(dados.texto)
  }

  @Documenta({
    resumo: 'Criar perfil de importação',
    descricao:
      ESCRITA +
      ' Nome único entre os perfis (409 `nome_duplicado`). CNAE que não existe na tabela: 400 `cnaes_invalidos`.',
    corpo: criarPerfilDeImportacaoSchema,
    resposta: perfilDeImportacaoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Post()
  criar(
    @Body(new ZodPipe(criarPerfilDeImportacaoSchema)) dados: CriarPerfilDeImportacaoEntrada,
  ): Promise<PerfilDeImportacao> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Alterar perfil de importação',
    descricao:
      ESCRITA +
      ' Só os campos enviados mudam. As importações já feitas guardam a cópia das regras.',
    corpo: alterarPerfilDeImportacaoSchema,
    resposta: perfilDeImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarPerfilDeImportacaoSchema)) dados: AlterarPerfilDeImportacaoEntrada,
  ): Promise<PerfilDeImportacao> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir perfil de importação',
    descricao:
      ESCRITA +
      ' Exclusão lógica; o nome fica livre. Só se exclui o que nunca foi usado: perfil de algum lote dá 409 `perfil_em_uso`: só inativar.',
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
