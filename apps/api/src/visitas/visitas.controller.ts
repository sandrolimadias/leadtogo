import {
  type AlterarModeloDeVisitaEntrada,
  alterarModeloDeVisitaSchema,
  type AlterarResultadoDeVisitaEntrada,
  alterarResultadoDeVisitaSchema,
  type ConfiguracaoDeVisitas,
  configuracaoDeVisitasSchema,
  type CriarModeloDeVisitaEntrada,
  criarModeloDeVisitaSchema,
  type CriarResultadoDeVisitaEntrada,
  criarResultadoDeVisitaSchema,
  type ModeloDeVisita,
  modeloDeVisitaSchema,
  type NovaOrdemEntrada,
  novaOrdemSchema,
  type ResultadoDeVisita,
  resultadoDeVisitaSchema,
  type VersaoDoModeloDeVisita,
  versaoDoModeloDeVisitaSchema,
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
import { ConfiguracaoDeVisitasService } from './checkin.service.js'
import { ModelosDeVisitaService } from './modelos.service.js'
import { ResultadosDeVisitaService } from './resultados.service.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

const ESCRITA =
  'Exige a permissão `cadastros.gerir` do perfil de acesso (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Resultados da visita (G3a). Ler é de qualquer membro (o relatório usa); escrever exige `cadastros.gerir`. */
@ApiTags('Visitas: resultados')
@Controller('configuracoes/visitas/resultados')
export class ResultadosDeVisitaController {
  constructor(private readonly servico: ResultadosDeVisitaService) {}

  @Documenta({
    resumo: 'Listar resultados da visita',
    descricao:
      'Qualquer membro da empresa ativa. Em ordem de exibição; sem `incluirInativos=true`, esconde os inativados.',
    consulta: consultaSchema,
    resposta: z.array(resultadoDeVisitaSchema),
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<ResultadoDeVisita[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Criar resultado da visita',
    descricao:
      ESCRITA +
      ' O `modeloId` é o modelo do relatório desse resultado (ativo, da empresa; 404 `modelo_nao_encontrado`, 409 `modelo_inativo`). Nome repetido: 409 `nome_duplicado`.',
    corpo: criarResultadoDeVisitaSchema,
    resposta: resultadoDeVisitaSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Post()
  criar(
    @Body(new ZodPipe(criarResultadoDeVisitaSchema)) dados: CriarResultadoDeVisitaEntrada,
  ): Promise<ResultadoDeVisita> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar resultados da visita',
    descricao:
      ESCRITA +
      ' O corpo traz os ids de TODOS os itens não excluídos, na ordem desejada (400 `ordem_invalida`).',
    corpo: novaOrdemSchema,
    resposta: z.array(resultadoDeVisitaSchema),
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Put('ordem')
  reordenar(
    @Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada,
  ): Promise<ResultadoDeVisita[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar resultado da visita',
    descricao:
      ESCRITA +
      ' Só os campos enviados mudam. "Não localizada" e "Empresa encerrada" (`chaveSistema`) só se renomeiam e trocam de modelo (409 `resultado_de_sistema`).',
    corpo: alterarResultadoDeVisitaSchema,
    resposta: resultadoDeVisitaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarResultadoDeVisitaSchema)) dados: AlterarResultadoDeVisitaEntrada,
  ): Promise<ResultadoDeVisita> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir resultado da visita',
    descricao:
      ESCRITA +
      ' Exclusão lógica. Os resultados de sistema não se excluem (409 `resultado_de_sistema`).',
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

/** Modelos do relatório de visita (G3a), com versões. Ler é de qualquer membro; escrever exige `cadastros.gerir`. */
@ApiTags('Visitas: modelos')
@Controller('configuracoes/visitas/modelos')
export class ModelosDeVisitaController {
  constructor(private readonly servico: ModelosDeVisitaService) {}

  @Documenta({
    resumo: 'Listar modelos do relatório de visita',
    descricao:
      'Qualquer membro da empresa ativa. Cada modelo traz a versão atual (com os campos), quantos resultados o usam e se já tem relatório (`emUso`).',
    consulta: consultaSchema,
    resposta: z.array(modeloDeVisitaSchema),
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<ModeloDeVisita[]> {
    return this.servico.listar(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Obter um modelo do relatório de visita',
    descricao: 'Qualquer membro da empresa ativa.',
    resposta: modeloDeVisitaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @TodoMembro()
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string): Promise<ModeloDeVisita> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Versões de um modelo',
    descricao: 'Qualquer membro da empresa ativa. Da mais nova para a mais antiga.',
    resposta: z.array(versaoDoModeloDeVisitaSchema),
    erros: [400, 401, 403, 404, 409],
  })
  @TodoMembro()
  @Get(':id/versoes')
  versoes(@Param('id', new ParseUUIDPipe()) id: string): Promise<VersaoDoModeloDeVisita[]> {
    return this.servico.versoes(id)
  }

  @Documenta({
    resumo: 'Criar modelo do relatório de visita',
    descricao:
      ESCRITA +
      ' Cria a versão 1 com os campos. Campo `tag`: tag ativa da empresa, de grupo não automático (400 `tag_invalida`). Nome repetido: 409 `nome_duplicado`.',
    corpo: criarModeloDeVisitaSchema,
    resposta: modeloDeVisitaSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Post()
  criar(
    @Body(new ZodPipe(criarModeloDeVisitaSchema)) dados: CriarModeloDeVisitaEntrada,
  ): Promise<ModeloDeVisita> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Reordenar modelos',
    descricao:
      ESCRITA + ' O corpo traz os ids de TODOS os modelos não excluídos, na ordem desejada.',
    corpo: novaOrdemSchema,
    resposta: z.array(modeloDeVisitaSchema),
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Put('ordem')
  reordenar(
    @Body(new ZodPipe(novaOrdemSchema)) dados: NovaOrdemEntrada,
  ): Promise<ModeloDeVisita[]> {
    return this.servico.reordenar(dados.ids)
  }

  @Documenta({
    resumo: 'Alterar modelo do relatório de visita',
    descricao:
      ESCRITA +
      ' Só o que vier muda. `campos`: se o modelo já tem relatório, publica a versão N+1 (a anterior nunca muda); senão, edita a atual. `padrao: true` torna este o padrão. O padrão não se inativa e o modelo usado por resultado ativo também não (409 `modelo_padrao`, `modelo_usado_por_resultado`).',
    corpo: alterarModeloDeVisitaSchema,
    resposta: modeloDeVisitaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarModeloDeVisitaSchema)) dados: AlterarModeloDeVisitaEntrada,
  ): Promise<ModeloDeVisita> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir modelo do relatório de visita',
    descricao:
      ESCRITA +
      ' Exclusão lógica. Não se exclui o padrão, o usado por algum resultado nem o que já tem relatório (409 `modelo_padrao`, `modelo_usado_por_resultado`, `modelo_em_uso`).',
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

/** Check-in e lembrete dos relatórios (Configurações → Visitas → Check-in). */
@ApiTags('Visitas: check-in')
@Controller('configuracoes/visitas/checkin')
export class ConfiguracaoDeVisitasController {
  constructor(private readonly servico: ConfiguracaoDeVisitasService) {}

  @Documenta({
    resumo: 'Configuração do check-in',
    descricao:
      'Qualquer membro da empresa ativa (o check-in usa). `checkinModo`: `avisar` (padrão), `bloquear` ou `so_gravar`; `checkinLimiteM` (padrão 300, de 10 a 50.000); `lembreteRelatoriosHora` "HH:MM" no fuso da empresa (padrão 17:30).',
    resposta: configuracaoDeVisitasSchema,
    erros: [401, 403, 409],
  })
  @TodoMembro()
  @Get()
  obter(): Promise<ConfiguracaoDeVisitas> {
    return this.servico.obter()
  }

  @Documenta({
    resumo: 'Alterar a configuração do check-in',
    descricao: ESCRITA + ' Corpo completo. Vale na próxima requisição de cada pessoa.',
    corpo: configuracaoDeVisitasSchema,
    resposta: configuracaoDeVisitasSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Put()
  alterar(
    @Body(new ZodPipe(configuracaoDeVisitasSchema)) dados: ConfiguracaoDeVisitas,
  ): Promise<ConfiguracaoDeVisitas> {
    return this.servico.alterar(dados)
  }
}
