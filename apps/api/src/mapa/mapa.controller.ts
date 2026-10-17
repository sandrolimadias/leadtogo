import {
  type AlterarEntradaDaLegenda,
  alterarEntradaDaLegendaSchema,
  type CoberturaDoMapa,
  coberturaDoMapaSchema,
  type ConsultaDePontos,
  consultaDePontosSchema,
  type ConsultaDeProximas,
  consultaDeProximasSchema,
  type LegendaDoMapa,
  legendaDoMapaSchema,
  type ListaDeSelecao,
  listaDeSelecaoSchema,
  type OpcoesDoMapa,
  opcoesDoMapaSchema,
  type PontosDoMapa,
  pontosDoMapaSchema,
  type SelecaoDoMapa,
  selecaoDoMapaSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { MapaService } from './mapa.service.js'

const VISIBILIDADE =
  'O vendedor vê no mapa só o que já vê na carteira; administrador e gestor veem tudo.'

@ApiTags('Mapa')
@Controller('mapa')
export class MapaController {
  constructor(private readonly servico: MapaService) {}

  @Documenta({
    resumo: 'Opções do mapa: chips, legenda, filtros e onde abrir',
    descricao: `Qualquer membro. Os chips saem das tags de Status que aparecem no mapa (flag \`apareceNoMapa\`), com o total de empresas com coordenada; \`ligadoAoAbrir\` vem da flag \`visivelAoAbrir\`. Leads só entram por lote de importação (\`lotesDeLeads\`, até \`limiteDeLeads\` por vez). ${VISIBILIDADE}`,
    resposta: opcoesDoMapaSchema,
    erros: [401, 403, 409],
  })
  @Get('opcoes')
  opcoes(): Promise<OpcoesDoMapa> {
    return this.servico.opcoes()
  }

  @Documenta({
    resumo: 'Legenda do mapa (cores e nomes dos estados)',
    descricao:
      'Qualquer membro. Uma entrada por tag de Status que aparece no mapa e os estados fixos `sem_visita` e `visita_tentada`. `cor` e `nome` são o que vale agora (o configurado pelo administrador ou o padrão).',
    resposta: legendaDoMapaSchema,
    erros: [401, 403, 409],
  })
  @Get('legenda')
  legenda(): Promise<LegendaDoMapa> {
    return this.servico.legenda()
  }

  @Documenta({
    resumo: 'Mudar a cor ou o nome de um estado da legenda',
    descricao:
      'Só administradores (403 `acesso_negado`). A cor vem da paleta de 12 cores dos tokens (400 se for outra). Nome vazio ou nulo volta ao padrão. A regra de cada estado não muda. Registra na auditoria.',
    corpo: alterarEntradaDaLegendaSchema,
    resposta: legendaDoMapaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Put('legenda/:chave')
  alterarEntrada(
    @Param('chave') chave: string,
    @Body(new ZodPipe(alterarEntradaDaLegendaSchema)) dados: AlterarEntradaDaLegenda,
  ): Promise<LegendaDoMapa> {
    return this.servico.alterarEntrada(chave, dados)
  }

  @Documenta({
    resumo: 'Restaurar a legenda padrão',
    descricao: 'Só administradores. Apaga todas as cores e nomes personalizados da legenda.',
    resposta: legendaDoMapaSchema,
    erros: [401, 403, 409],
  })
  @HttpCode(200)
  @Post('legenda/restaurar')
  restaurar(): Promise<LegendaDoMapa> {
    return this.servico.restaurarLegenda()
  }

  @Documenta({
    resumo: 'Empresas da área visível do mapa',
    descricao: `Qualquer membro. \`oeste,sul,leste,norte\` e \`zoom\` descrevem a área; os filtros (\`statusTagIds\` separados por vírgula, \`visitada\`, \`vendedorId\`, \`semVisitaDias\`, \`municipioCodigo\`, \`regiaoId\`, \`precisao\`, \`lotes\`) limitam o que vem. Com até 400 empresas na área (1.500 de perto, zoom 14 ou mais) devolve os pontos; com mais, devolve \`agrupamentos\` (bolhas com o total). Sem nenhum Status em \`statusTagIds\`, nada vem; leads só vêm de um lote em \`lotes\`, até 500. ${VISIBILIDADE}`,
    consulta: consultaDePontosSchema,
    resposta: pontosDoMapaSchema,
    erros: [400, 401, 403, 409],
  })
  @Get('pontos')
  pontos(
    @Query(new ZodPipe(consultaDePontosSchema)) consulta: ConsultaDePontos,
  ): Promise<PontosDoMapa> {
    return this.servico.pontos(consulta)
  }

  @Documenta({
    resumo: 'Empresas próximas de um ponto (2, 5, 10, 25 km...)',
    descricao: `Qualquer membro. Em ordem de distância, até 500; \`total\` diz quantas há. Por padrão exclui as já visitadas (\`incluirVisitadas=true\` as inclui). Aceita os mesmos filtros do mapa (sem Status escolhido vale todos). ${VISIBILIDADE}`,
    consulta: consultaDeProximasSchema,
    resposta: listaDeSelecaoSchema,
    erros: [400, 401, 403, 409],
  })
  @Get('proximas')
  proximas(
    @Query(new ZodPipe(consultaDeProximasSchema)) consulta: ConsultaDeProximas,
  ): Promise<ListaDeSelecao> {
    return this.servico.proximas(consulta)
  }

  @Documenta({
    resumo: 'Seleção por retângulo ou por raio',
    descricao: `Qualquer membro. Devolve as empresas dentro da área (até 500, com o total) para listar, abrir ou aplicar tag (a aplicação usa o endpoint de tag em massa das empresas). Por padrão exclui as já visitadas. ${VISIBILIDADE}`,
    corpo: selecaoDoMapaSchema,
    resposta: listaDeSelecaoSchema,
    erros: [400, 401, 403, 409],
  })
  @HttpCode(200)
  @Post('selecao')
  selecao(@Body(new ZodPipe(selecaoDoMapaSchema)) dados: SelecaoDoMapa): Promise<ListaDeSelecao> {
    return this.servico.selecao(dados)
  }

  @Documenta({
    resumo: 'Cobertura por município: visitadas e quantas faltam',
    descricao: `Qualquer membro. Só a carteira (Cliente e Prospect) com coordenada, por município, com o ponto do centro dele para mostrar os números no mapa. ${VISIBILIDADE}`,
    resposta: coberturaDoMapaSchema,
    erros: [401, 403, 409],
  })
  @Get('cobertura')
  cobertura(): Promise<CoberturaDoMapa> {
    return this.servico.cobertura()
  }
}
