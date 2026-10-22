import { type BaseDoMapa, baseDoMapaSchema } from '@leadtogo/shared'
import { Controller, Get, Inject } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { SemTransacao } from '../acesso/acesso.decorators.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { Documenta } from '../documentacao/documenta.js'
import { Limite, SemLimite } from '../rate-limit/limite.decorator.js'

/**
 * De onde o app lê o mapa base. O PMTiles do estado fica num bucket PÚBLICO só do mapa (dado do OpenStreetMap,
 * nenhum dado de cliente), servido direto pelo Garage em `mapa.crm.aledias.com.br` com `Range`, CORS só para o
 * app e `Cache-Control` imutável: o navegador não passa mais pela API para ler o arquivo (os pedidos de faixa
 * abortados do MapLibre travaram a API em 19/10/2026; `runbook_observabilidade.md`, seção 9). A API só diz qual
 * é a URL, então trocar a versão do mapa é mudar a variável `MAPA_BASE_URL`, sem build.
 */
@ApiTags('Mapa')
@SemTransacao()
@SemLimite()
@Limite({ nome: 'mapa-base', max: 600, janelaS: 60 })
@Controller('mapa')
export class TilesDoMapaController {
  constructor(@Inject(CONFIGURACAO) private readonly config: Configuracao) {}

  @Documenta({
    resumo: 'De onde ler o mapa base',
    descricao:
      'Qualquer membro logado. Devolve a URL pública do PMTiles versionado (`MAPA_BASE_URL`, bucket público do Garage). Sem a variável (só em desenvolvimento; em produção ela é obrigatória), `url` vem nulo e o app mostra o mapa sem a base.',
    resposta: baseDoMapaSchema,
    erros: [401, 403, 409],
  })
  @Get('base')
  origemDaBase(): BaseDoMapa {
    return { url: this.config.MAPA_BASE_URL ?? null }
  }
}
