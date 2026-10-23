import {
  type AlterarAreaEntrada,
  alterarAreaSchema,
  type AlterarTriagemEntrada,
  alterarTriagemSchema,
  type AreaDeAtendimento,
  areaDeAtendimentoSchema,
  type ConfiguracaoDeTriagem,
  configuracaoDeTriagemSchema,
  type CriarAreaEntrada,
  criarAreaSchema,
  type CriarFeriadoEntrada,
  criarFeriadoSchema,
  type DefinirExpedienteEntrada,
  definirExpedienteSchema,
  type DefinirMembrosDaAreaEntrada,
  definirMembrosDaAreaSchema,
  type Expediente,
  expedienteSchema,
  type Feriado,
  feriadoSchema,
  type GerarFeriadosEntrada,
  gerarFeriadosSchema,
  type OpcoesDeConfiguracao,
  opcoesDeConfiguracaoSchema,
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

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { AreasService } from './areas.service.js'
import { ExpedienteService } from './expediente.service.js'
import { TriagemService } from './triagem.service.js'

/** Quem pode ler as áreas, a triagem e o expediente: qualquer perfil com alguma permissão dos chamados. */
const LER = [
  'chamados.ver',
  'chamados.criar',
  'chamados.atender',
  'chamados.triar',
  'chamados.atribuir',
  'chamados.gerir_areas',
] as [string, ...string[]]

const ESCRITA =
  'Exige `chamados.gerir_areas` (403 `acesso_negado` para os demais). Registra na auditoria.'

const consultaDeAreasSchema = z
  .object({ incluirInativas: z.enum(['true', 'false']).default('false') })
  .strict()

/**
 * Configuração da central de chamados: áreas, triagem, expediente e feriados. Este controller vem ANTES
 * do dos chamados no módulo: `/chamados/areas` não pode cair em `/chamados/:id`.
 */
@ApiTags('Chamados: configuração')
@Controller('chamados')
export class ConfiguracaoDeChamadosController {
  constructor(
    private readonly areas: AreasService,
    private readonly triagem: TriagemService,
    private readonly expediente: ExpedienteService,
  ) {}

  @Documenta({
    resumo: 'Opções da configuração dos chamados',
    descricao:
      'Exige `chamados.gerir_areas`. Os membros ativos e os perfis de acesso da empresa, para escolher quem atende a área e quem faz a triagem.',
    resposta: opcoesDeConfiguracaoSchema,
    erros: [401, 403, 409],
  })
  @Permissao('chamados.gerir_areas')
  @Get('opcoes-de-configuracao')
  opcoes(): Promise<OpcoesDeConfiguracao> {
    return this.areas.opcoes()
  }

  // ---- Áreas ----

  @Documenta({
    resumo: 'Listar as áreas de atendimento',
    descricao:
      'Qualquer perfil com permissão dos chamados. Quem tem `chamados.gerir_areas` vê também os membros de cada área e, com `incluirInativas=true`, as inativas; os demais veem só as ativas, sem a lista de membros.',
    consulta: consultaDeAreasSchema,
    resposta: z.array(areaDeAtendimentoSchema),
    erros: [400, 401, 403, 409],
  })
  @Permissao(...LER)
  @Get('areas')
  listarAreas(
    @Query(new ZodPipe(consultaDeAreasSchema)) c: z.infer<typeof consultaDeAreasSchema>,
  ): Promise<AreaDeAtendimento[]> {
    return this.areas.listar(c.incluirInativas === 'true')
  }

  @Documenta({
    resumo: 'Criar uma área de atendimento',
    descricao: `${ESCRITA} Nome único (409 \`nome_duplicado\`). Metas vazias = sem meta e sem alerta de prazo.`,
    corpo: criarAreaSchema,
    resposta: areaDeAtendimentoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('chamados.gerir_areas')
  @Post('areas')
  criarArea(
    @Body(new ZodPipe(criarAreaSchema)) dados: CriarAreaEntrada,
  ): Promise<AreaDeAtendimento> {
    return this.areas.criar(dados)
  }

  @Documenta({
    resumo: 'Alterar uma área de atendimento',
    descricao: `${ESCRITA} Nome, descrição, metas, "visível no portal", "pula a triagem" e ativa.`,
    corpo: alterarAreaSchema,
    resposta: areaDeAtendimentoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.gerir_areas')
  @Patch('areas/:id')
  alterarArea(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarAreaSchema)) dados: AlterarAreaEntrada,
  ): Promise<AreaDeAtendimento> {
    return this.areas.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Definir quem atende a área',
    descricao: `${ESCRITA} Troca a lista inteira: membros (com o gestor da área marcado) e perfis de acesso. Membro ou perfil inexistente ou inativo: 400 \`membro_invalido\` / \`perfil_invalido\`.`,
    corpo: definirMembrosDaAreaSchema,
    resposta: areaDeAtendimentoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('chamados.gerir_areas')
  @Put('areas/:id/membros')
  definirMembros(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(definirMembrosDaAreaSchema)) dados: DefinirMembrosDaAreaEntrada,
  ): Promise<AreaDeAtendimento> {
    return this.areas.definirMembros(id, dados)
  }

  @Documenta({
    resumo: 'Excluir uma área de atendimento',
    descricao: `${ESCRITA} Só a área que nunca teve chamado; a usada só se inativa (409 \`area_em_uso\`).`,
    status: 204,
    erros: [401, 403, 404, 409],
  })
  @Permissao('chamados.gerir_areas')
  @Delete('areas/:id')
  @HttpCode(204)
  async excluirArea(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.areas.excluir(id)
  }

  // ---- Triagem ----

  @Documenta({
    resumo: 'Ver a configuração da triagem',
    descricao:
      'Qualquer perfil com permissão dos chamados. Desligada por padrão; ligada, indica as pessoas e/ou o perfil que triam.',
    resposta: configuracaoDeTriagemSchema,
    erros: [401, 403, 409],
  })
  @Permissao(...LER)
  @Get('triagem')
  verTriagem(): Promise<ConfiguracaoDeTriagem> {
    return this.triagem.configuracao()
  }

  @Documenta({
    resumo: 'Alterar a triagem',
    descricao: `${ESCRITA} Ligar exige ao menos uma pessoa ou um perfil de triagem (409 \`triagem_sem_triador\`). A exceção por área é o campo \`pulaTriagem\` da área.`,
    corpo: alterarTriagemSchema,
    resposta: configuracaoDeTriagemSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('chamados.gerir_areas')
  @Put('triagem')
  alterarTriagem(
    @Body(new ZodPipe(alterarTriagemSchema)) dados: AlterarTriagemEntrada,
  ): Promise<ConfiguracaoDeTriagem> {
    return this.triagem.alterar(dados)
  }

  // ---- Expediente e feriados ----

  @Documenta({
    resumo: 'Ver o expediente e os feriados',
    descricao:
      'Qualquer perfil com permissão dos chamados. Faixas de horário por dia da semana (0 = domingo), feriados e o fuso da empresa. Padrão: segunda a sexta, 8h às 18h, com os feriados nacionais.',
    resposta: expedienteSchema,
    erros: [401, 403, 409],
  })
  @Permissao(...LER)
  @Get('expediente')
  verExpediente(): Promise<Expediente> {
    return this.expediente.obter()
  }

  @Documenta({
    resumo: 'Definir o expediente',
    descricao: `${ESCRITA} Troca as faixas inteiras; faixas do mesmo dia não se sobrepõem (400). Sem faixa nenhuma, as metas deixam de contar prazo.`,
    corpo: definirExpedienteSchema,
    resposta: expedienteSchema,
    erros: [400, 401, 403],
  })
  @Permissao('chamados.gerir_areas')
  @Put('expediente')
  definirExpediente(
    @Body(new ZodPipe(definirExpedienteSchema)) dados: DefinirExpedienteEntrada,
  ): Promise<Expediente> {
    return this.expediente.definir(dados)
  }

  @Documenta({
    resumo: 'Cadastrar um feriado',
    descricao: `${ESCRITA} Uma data só tem um feriado (409 \`feriado_repetido\`). \`recorrente\` vale todo ano no mesmo dia e mês.`,
    corpo: criarFeriadoSchema,
    resposta: feriadoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('chamados.gerir_areas')
  @Post('feriados')
  criarFeriado(
    @Body(new ZodPipe(criarFeriadoSchema)) dados: CriarFeriadoEntrada,
  ): Promise<Feriado> {
    return this.expediente.criarFeriado(dados)
  }

  @Documenta({
    resumo: 'Gerar os feriados nacionais móveis do ano',
    descricao: `${ESCRITA} Carnaval, Sexta-feira Santa e Corpus Christi do ano pedido, sem repetir o que já está no cadastro.`,
    corpo: gerarFeriadosSchema,
    resposta: z.object({ criados: z.number().int() }),
    erros: [400, 401, 403],
  })
  @Permissao('chamados.gerir_areas')
  @Post('feriados/gerar')
  @HttpCode(200)
  gerarFeriados(
    @Body(new ZodPipe(gerarFeriadosSchema)) dados: GerarFeriadosEntrada,
  ): Promise<{ criados: number }> {
    return this.expediente.gerarMoveis(dados.ano)
  }

  @Documenta({
    resumo: 'Excluir um feriado',
    descricao: ESCRITA,
    status: 204,
    erros: [401, 403, 404],
  })
  @Permissao('chamados.gerir_areas')
  @Delete('feriados/:id')
  @HttpCode(204)
  async excluirFeriado(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.expediente.excluirFeriado(id)
  }
}
