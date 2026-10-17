import {
  type AjustarPosicao,
  ajustarPosicaoSchema,
  type ConfirmarEndereco,
  confirmarEnderecoSchema,
  type ConsultaDaFila,
  consultaDaFilaSchema,
  type ConsultaDeLotesGeo,
  consultaDeLotesGeoSchema,
  type ConsultaDeRegioes,
  consultaDeRegioesSchema,
  type CriarLoteGeo,
  criarLoteGeoSchema,
  type EscopoDoLote,
  escopoDoLoteSchema,
  type ListaDaFila,
  type ListaDeLotesGeo,
  listaDaFilaSchema,
  listaDeLotesGeoSchema,
  type LoteGeo,
  loteGeoSchema,
  type PosicaoDaEmpresa,
  posicaoDaEmpresaSchema,
  type PreviaDoLote,
  previaDoLoteSchema,
  type RegiaoGeo,
  regiaoSchema,
  type ResumoDaGeolocalizacao,
  resumoDaGeolocalizacaoSchema,
  type SalvarRegiao,
  salvarRegiaoSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { GeolocalizacaoService } from './geolocalizacao.service.js'
import { LotesGeoService } from './lotes-geo.service.js'
import { RegioesGeoService } from './regioes.service.js'

const ADMIN_E_GESTOR = 'Só administradores e gestores (403 `acesso_negado` para o vendedor).'
const ADMIN = 'Só administradores (403 `acesso_negado` para os demais). Registra na auditoria.'

@ApiTags('Geolocalização')
@Controller('geolocalizacao')
export class GeolocalizacaoController {
  constructor(
    private readonly servico: GeolocalizacaoService,
    private readonly lotes: LotesGeoService,
    private readonly regioes: RegioesGeoService,
  ) {}

  @Documenta({
    resumo: 'Resumo da geolocalização',
    descricao:
      'Qualquer membro. Quantas empresas (as que o usuário vê) estão exatas, aproximadas, sem coordenada, a confirmar ou ajustadas à mão, e se o CNEFE e o Nominatim estão disponíveis.',
    resposta: resumoDaGeolocalizacaoSchema,
    erros: [401, 403, 409],
  })
  @Get('resumo')
  resumo(): Promise<ResumoDaGeolocalizacao> {
    return this.servico.resumo()
  }

  @Documenta({
    resumo: 'Fila "Confirmar endereço"',
    descricao:
      'Empresas com a tag de sistema "Endereço a confirmar", com o que falta em cada endereço. O vendedor vê só as suas (ou todas, se a empresa liberou).',
    consulta: consultaDaFilaSchema,
    resposta: listaDaFilaSchema,
    erros: [400, 401, 403, 409],
  })
  @Get('fila')
  fila(@Query(new ZodPipe(consultaDaFilaSchema)) consulta: ConsultaDaFila): Promise<ListaDaFila> {
    return this.servico.fila(consulta)
  }

  // ---- Regiões ----

  @Documenta({
    resumo: 'Regiões (microrregiões oficiais e as do administrador)',
    descricao:
      'Qualquer membro. As microrregiões do IBGE são só leitura (`id` `micro:<código>`); as personalizadas têm id uuid. `uf` limita as microrregiões a um estado.',
    consulta: consultaDeRegioesSchema,
    resposta: z.array(regiaoSchema),
    erros: [400, 401, 403, 409],
  })
  @Get('regioes')
  listarRegioes(
    @Query(new ZodPipe(consultaDeRegioesSchema)) consulta: ConsultaDeRegioes,
  ): Promise<RegiaoGeo[]> {
    return this.regioes.listar(consulta)
  }

  @Documenta({
    resumo: 'Criar região',
    descricao: `${ADMIN} Nome único (409 \`regiao_repetida\`); municípios por código IBGE (400 \`municipio_invalido\`).`,
    corpo: salvarRegiaoSchema,
    resposta: regiaoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post('regioes')
  criarRegiao(@Body(new ZodPipe(salvarRegiaoSchema)) dados: SalvarRegiao): Promise<RegiaoGeo> {
    return this.regioes.criar(dados)
  }

  @Documenta({
    resumo: 'Alterar região',
    descricao: `${ADMIN} Troca o nome e a lista de municípios inteira.`,
    corpo: salvarRegiaoSchema,
    resposta: regiaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Put('regioes/:id')
  alterarRegiao(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(salvarRegiaoSchema)) dados: SalvarRegiao,
  ): Promise<RegiaoGeo> {
    return this.regioes.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir região',
    descricao: `${ADMIN} Exclusão lógica; lotes já feitos não mudam.`,
    status: 204,
    erros: [401, 403, 404, 409],
  })
  @HttpCode(204)
  @Delete('regioes/:id')
  async excluirRegiao(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.regioes.excluir(id)
  }

  // ---- Lotes ----

  @Documenta({
    resumo: 'Prévia de um lote: quantas empresas e quantas já têm coordenada',
    descricao: ADMIN_E_GESTOR,
    corpo: escopoDoLoteSchema,
    resposta: previaDoLoteSchema,
    erros: [400, 401, 403, 409],
  })
  @HttpCode(200)
  @Post('lotes/previa')
  previa(@Body(new ZodPipe(escopoDoLoteSchema)) escopo: EscopoDoLote): Promise<PreviaDoLote> {
    return this.lotes.previa(escopo)
  }

  @Documenta({
    resumo: 'Criar e iniciar um lote de geocodificação',
    descricao: `${ADMIN_E_GESTOR} Um lote em andamento por vez (409 \`lote_em_andamento\`); sem empresas para fazer, 409 \`lote_vazio\`. O worker executa em blocos curtos, com concorrência baixa; acompanhe em \`GET /geolocalizacao/lotes/{id}\`.`,
    corpo: criarLoteGeoSchema,
    resposta: loteGeoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post('lotes')
  criarLote(@Body(new ZodPipe(criarLoteGeoSchema)) dados: CriarLoteGeo): Promise<LoteGeo> {
    return this.lotes.criar(dados)
  }

  @Documenta({
    resumo: 'Lotes de geocodificação, do mais novo ao mais antigo',
    descricao: ADMIN_E_GESTOR,
    consulta: consultaDeLotesGeoSchema,
    resposta: listaDeLotesGeoSchema,
    erros: [400, 401, 403, 409],
  })
  @Get('lotes')
  listarLotes(
    @Query(new ZodPipe(consultaDeLotesGeoSchema)) consulta: ConsultaDeLotesGeo,
  ): Promise<ListaDeLotesGeo> {
    return this.lotes.listar(consulta)
  }

  @Documenta({
    resumo: 'Andamento de um lote',
    descricao: `${ADMIN_E_GESTOR} Lote de outra empresa: 404 \`lote_nao_encontrado\`.`,
    resposta: loteGeoSchema,
    erros: [401, 403, 404, 409],
  })
  @Get('lotes/:id')
  detalharLote(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoteGeo> {
    return this.lotes.detalhar(id)
  }

  @Documenta({
    resumo: 'Cancelar um lote em andamento',
    descricao: `${ADMIN_E_GESTOR} Vale antes da próxima empresa; o que já foi feito fica. 409 \`lote_nao_cancelavel\`.`,
    resposta: loteGeoSchema,
    erros: [401, 403, 404, 409],
  })
  @HttpCode(200)
  @Post('lotes/:id/cancelar')
  cancelarLote(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoteGeo> {
    return this.lotes.cancelar(id)
  }

  @Documenta({
    resumo: 'Retomar um lote cancelado ou que falhou',
    descricao: `${ADMIN_E_GESTOR} Só faz as empresas que faltam (e as que falharam). 409 \`lote_nao_retomavel\` ou \`lote_em_andamento\`.`,
    resposta: loteGeoSchema,
    erros: [401, 403, 404, 409],
  })
  @HttpCode(200)
  @Post('lotes/:id/retomar')
  retomarLote(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoteGeo> {
    return this.lotes.retomar(id)
  }

  // ---- A posição de uma empresa ----

  @Documenta({
    resumo: 'Posição de uma empresa no mapa',
    descricao:
      'Quem vê a empresa. Estado (`exata`, `aproximada`, `sem_coordenada`, `a_confirmar`), origem, raio de incerteza e o que falta no endereço.',
    resposta: posicaoDaEmpresaSchema,
    erros: [401, 403, 404, 409],
  })
  @Get('empresas/:id/posicao')
  posicao(@Param('id', new ParseUUIDPipe()) id: string): Promise<PosicaoDaEmpresa> {
    return this.servico.posicao(id)
  }

  @Documenta({
    resumo: 'Ajustar a posição de uma empresa',
    descricao:
      'Quem edita a empresa. A posição vira exata, de origem `manual`, e é preservada: nenhuma geocodificação a sobrescreve. A tag "Endereço a confirmar" sai. Fora do Brasil: 400 `fora_do_brasil`.',
    corpo: ajustarPosicaoSchema,
    resposta: posicaoDaEmpresaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @HttpCode(200)
  @Post('empresas/:id/posicao')
  ajustar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(ajustarPosicaoSchema)) dados: AjustarPosicao,
  ): Promise<PosicaoDaEmpresa> {
    return this.servico.ajustar(id, dados)
  }

  @Documenta({
    resumo: 'Depois de mudar o endereço: manter a posição ajustada ou refazer',
    descricao:
      'Quem edita a empresa. `manter_posicao` guarda a posição ajustada à mão; `refazer` descarta o ajuste e geocodifica o endereço novo (o worker faz).',
    corpo: confirmarEnderecoSchema,
    resposta: posicaoDaEmpresaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @HttpCode(200)
  @Post('empresas/:id/confirmar-endereco')
  confirmar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(confirmarEnderecoSchema)) dados: ConfirmarEndereco,
  ): Promise<PosicaoDaEmpresa> {
    return this.servico.confirmarEndereco(id, dados)
  }

  @Documenta({
    resumo: 'Geocodificar de novo uma empresa',
    descricao:
      'Quem edita a empresa. Apaga a posição automática e agenda a geocodificação (o worker faz, com limite por minuto). Posição ajustada à mão: 409 `posicao_ajustada`; empresa no exterior: 409 `empresa_no_exterior`.',
    resposta: posicaoDaEmpresaSchema,
    erros: [401, 403, 404, 409],
  })
  @HttpCode(200)
  @Post('empresas/:id/geocodificar')
  geocodificar(@Param('id', new ParseUUIDPipe()) id: string): Promise<PosicaoDaEmpresa> {
    return this.servico.geocodificarDeNovo(id)
  }
}
