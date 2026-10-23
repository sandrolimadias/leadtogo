import {
  type AdicionarParadasEntrada,
  adicionarParadasSchema,
  type AlterarConfiguracaoDeRotasEntrada,
  alterarConfiguracaoDeRotasSchema,
  type AlterarPontoDePartidaEntrada,
  alterarPontoDePartidaSchema,
  type ConfiguracaoDeRotas,
  configuracaoDeRotasSchema,
  type ConsultaDeRotas,
  consultaDeRotasSchema,
  type CriarPontoDePartidaEntrada,
  criarPontoDePartidaSchema,
  type ListaDeRotas,
  listaDeRotasSchema,
  type OrdemOtimizada,
  ordemOtimizadaSchema,
  type OtimizarRotaEntrada,
  otimizarRotaSchema,
  type ParadasAdicionadas,
  paradasAdicionadasSchema,
  type PontoDePartida,
  pontoDePartidaSchema,
  type PularParadaEntrada,
  pularParadaSchema,
  type Rota,
  type RotaDaEmpresa,
  rotaDaEmpresaSchema,
  rotaSchema,
  type SalvarRotaEntrada,
  salvarRotaSchema,
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
import { PontosDePartidaService } from './pontos.service.js'
import { RotasService } from './rotas.service.js'

const VER =
  'Exige `rotas.ver`; o alcance (própria, equipe, todas) vale sobre o RESPONSÁVEL da rota (404 `rota_nao_encontrada` fora dele).'
const EDITAR =
  'Exige `rotas.editar` no alcance do responsável (403 `acesso_negado`); rota concluída ou cancelada não muda (409 `rota_fechada`). Registra na auditoria.'
const PARADAS = `Paradas: empresas com posição no mapa que quem monta e o responsável da rota veem na carteira (400 \`parada_invalida\`), no máximo \`ROTA_MAX_PARADAS\` (30; 400 \`paradas_demais\`). Montar para outro vendedor exige \`rotas.atribuir\`. A \`posicaoAtual\` entra só no cálculo e nunca é gravada.`

/** Rotas (G4): montar, otimizar, executar e consultar. */
@ApiTags('Rotas')
@Controller('rotas')
export class RotasController {
  constructor(private readonly servico: RotasService) {}

  @Documenta({
    resumo: 'Configuração das rotas',
    descricao:
      'Qualquer membro. Minutos por visita sugeridos, o limite de paradas e se a otimização (VROOM e OSRM) está configurada; sem ela, a tela mostra "Otimização de rotas ainda não configurada".',
    resposta: configuracaoDeRotasSchema,
    erros: [401, 403, 409],
  })
  @TodoMembro()
  @Get('configuracao')
  configuracao(): Promise<ConfiguracaoDeRotas> {
    return this.servico.configuracao()
  }

  @Documenta({
    resumo: 'Rotas de hoje da própria pessoa',
    descricao:
      'Qualquer membro. A "rota do dia" do celular: as rotas de hoje dela, sem as canceladas.',
    resposta: z.array(rotaSchema),
    erros: [401, 403, 409],
  })
  @TodoMembro()
  @Get('hoje')
  hoje(): Promise<Rota[]> {
    return this.servico.hoje()
  }

  @Documenta({
    resumo: 'Rotas em aberto de uma empresa',
    descricao: `As rotas planejadas ou em andamento, de hoje em diante, em que a empresa é parada (o "Na rota · parada N"). ${VER}`,
    resposta: z.array(rotaDaEmpresaSchema),
    erros: [400, 401, 403, 409],
  })
  @Permissao('rotas.ver')
  @Get('empresa/:empresaId')
  daEmpresa(@Param('empresaId', new ParseUUIDPipe()) empresaId: string): Promise<RotaDaEmpresa[]> {
    return this.servico.daEmpresa(empresaId)
  }

  @Documenta({
    resumo: 'Otimizar a ordem das paradas',
    descricao: `Exige \`rotas.editar\`. A ordem mais curta pelas ruas (VROOM), sem gravar. Sem VROOM/OSRM configurados, 409 \`rotas_nao_configuradas\`. Serviço fora do ar: a ordem sai em linha reta, com \`aviso: indisponivel\`. ${PARADAS}`,
    corpo: otimizarRotaSchema,
    resposta: ordemOtimizadaSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('rotas.editar')
  @Post('otimizar')
  @HttpCode(200)
  otimizar(
    @Body(new ZodPipe(otimizarRotaSchema)) dados: OtimizarRotaEntrada,
  ): Promise<OrdemOtimizada> {
    return this.servico.otimizar(dados)
  }

  @Documenta({
    resumo: 'Listar rotas',
    descricao: `${VER} Da mais nova para a mais antiga, com as contagens de paradas visitadas, puladas e pendentes.`,
    consulta: consultaDeRotasSchema,
    resposta: listaDeRotasSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('rotas.ver')
  @Get()
  listar(@Query(new ZodPipe(consultaDeRotasSchema)) c: ConsultaDeRotas): Promise<ListaDeRotas> {
    return this.servico.listar(c)
  }

  @Documenta({
    resumo: 'Criar rota',
    descricao: `Exige \`rotas.editar\`. O código (R-0151) é sequencial por empresa. As distâncias saem pelas ruas (OSRM) ou, sem o serviço, em linha reta (\`estimativa\`). ${PARADAS}`,
    corpo: salvarRotaSchema,
    resposta: rotaSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('rotas.editar')
  @Post()
  criar(@Body(new ZodPipe(salvarRotaSchema)) dados: SalvarRotaEntrada): Promise<Rota> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Obter rota',
    descricao: `${VER} Com as paradas na ordem e o trajeto pelas ruas (nulo em linha reta).`,
    resposta: rotaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('rotas.ver')
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string): Promise<Rota> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Salvar rota',
    descricao: `${EDITAR} Regrava a rota inteira com as paradas na ordem dada e recalcula as estimativas; paradas visitadas ou puladas não saem (409 \`parada_resolvida\`). ${PARADAS}`,
    corpo: salvarRotaSchema,
    resposta: rotaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('rotas.editar')
  @Put(':id')
  salvar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(salvarRotaSchema)) dados: SalvarRotaEntrada,
  ): Promise<Rota> {
    return this.servico.salvar(id, dados)
  }

  @Documenta({
    resumo: 'Adicionar paradas no fim da rota',
    descricao: `${EDITAR} O que cabe entra no fim; as que já estão na rota, as sem posição ou fora da carteira do responsável e as que passam do limite só contam.`,
    corpo: adicionarParadasSchema,
    resposta: paradasAdicionadasSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('rotas.editar')
  @Post(':id/paradas')
  @HttpCode(200)
  adicionar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(adicionarParadasSchema)) dados: AdicionarParadasEntrada,
  ): Promise<ParadasAdicionadas> {
    return this.servico.adicionarParadas(id, dados.empresaIds)
  }

  @Documenta({
    resumo: 'Pular uma parada',
    descricao: `${EDITAR} Só a parada pendente (409 \`parada_resolvida\`), com o motivo. Sem pendentes, a rota fica concluída.`,
    corpo: pularParadaSchema,
    resposta: rotaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('rotas.editar')
  @Post(':id/paradas/:paradaId/pular')
  @HttpCode(200)
  pular(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('paradaId', new ParseUUIDPipe()) paradaId: string,
    @Body(new ZodPipe(pularParadaSchema)) dados: PularParadaEntrada,
  ): Promise<Rota> {
    return this.servico.pular(id, paradaId, dados.motivo)
  }

  @Documenta({
    resumo: 'Encerrar rota',
    descricao: `${EDITAR} A rota fica concluída; as paradas ainda pendentes viram puladas ("Rota encerrada").`,
    resposta: rotaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('rotas.editar')
  @Post(':id/encerrar')
  @HttpCode(200)
  encerrar(@Param('id', new ParseUUIDPipe()) id: string): Promise<Rota> {
    return this.servico.encerrar(id)
  }

  @Documenta({
    resumo: 'Cancelar rota',
    descricao: `${EDITAR} A rota fica cancelada (continua na lista, com a situação).`,
    resposta: rotaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('rotas.editar')
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id', new ParseUUIDPipe()) id: string): Promise<Rota> {
    return this.servico.cancelar(id)
  }
}

const GERIR =
  'Exige a permissão `cadastros.gerir` do perfil de acesso (403 `acesso_negado` para os demais). Registra na auditoria.'

/** Configurações das rotas (G4): pontos de partida e minutos por visita. Ler é de todo membro. */
@ApiTags('Rotas: configurações')
@Controller('configuracoes/rotas')
export class ConfiguracoesDeRotasController {
  constructor(
    private readonly pontos: PontosDePartidaService,
    private readonly rotas: RotasService,
  ) {}

  @Documenta({
    resumo: 'Alterar os minutos por visita',
    descricao: `${GERIR} Valor sugerido nas rotas novas (0 a 480; cada rota pode ajustar o seu).`,
    corpo: alterarConfiguracaoDeRotasSchema,
    resposta: configuracaoDeRotasSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Put()
  alterar(
    @Body(new ZodPipe(alterarConfiguracaoDeRotasSchema)) dados: AlterarConfiguracaoDeRotasEntrada,
  ): Promise<ConfiguracaoDeRotas> {
    return this.rotas.alterarConfiguracao(dados.minutosPorVisita)
  }

  @Documenta({
    resumo: 'Listar pontos de partida',
    descricao: 'Qualquer membro (o editor de rota usa). O padrão primeiro; inclui os inativos.',
    resposta: z.array(pontoDePartidaSchema),
    erros: [401, 403, 409],
  })
  @TodoMembro()
  @Get('pontos')
  listar(): Promise<PontoDePartida[]> {
    return this.pontos.listar()
  }

  @Documenta({
    resumo: 'Criar ponto de partida',
    descricao: `${GERIR} A posição é a marcada no mapa. Marcar como padrão tira o anterior. Nome repetido: 409 \`nome_repetido\`.`,
    corpo: criarPontoDePartidaSchema,
    resposta: pontoDePartidaSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('cadastros.gerir')
  @Post('pontos')
  criar(
    @Body(new ZodPipe(criarPontoDePartidaSchema)) dados: CriarPontoDePartidaEntrada,
  ): Promise<PontoDePartida> {
    return this.pontos.criar(dados)
  }

  @Documenta({
    resumo: 'Alterar ponto de partida',
    descricao: `${GERIR} Só os campos enviados mudam; a posição muda com latitude e longitude juntas.`,
    corpo: alterarPontoDePartidaSchema,
    resposta: pontoDePartidaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Patch('pontos/:id')
  alterarPonto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarPontoDePartidaSchema)) dados: AlterarPontoDePartidaEntrada,
  ): Promise<PontoDePartida> {
    return this.pontos.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir ponto de partida',
    descricao: `${GERIR} Exclusão lógica; usado em alguma rota, só se inativa (409 \`ponto_em_uso\`).`,
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('cadastros.gerir')
  @Delete('pontos/:id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.pontos.excluir(id)
  }
}
