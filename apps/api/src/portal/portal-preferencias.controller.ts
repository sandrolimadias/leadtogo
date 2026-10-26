import {
  type ConfiguracaoDePush,
  configuracaoDePushSchema,
  type ConsultaDeBuscaDoPortal,
  consultaDeBuscaDoPortalSchema,
  type InscreverPushEntrada,
  inscreverPushSchema,
  type PreferenciasDoPortal,
  preferenciasDoPortalSchema,
  type RemoverInscricaoDePushEntrada,
  removerInscricaoDePushSchema,
  type ResultadoDaBuscaDoPortal,
  resultadoDaBuscaDoPortalSchema,
  type SalvarPreferenciasDoPortalEntrada,
  salvarPreferenciasDoPortalSchema,
} from '@leadtogo/shared'
import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PortalBuscaService } from './portal-busca.service.js'
import { PortalPreferenciasService } from './portal-preferencias.service.js'
import { RotaDoPortal } from './portal.decorators.js'

/** Preferências, push e busca do cliente (Fase 3E). */
@ApiTags('Portal do cliente: preferências e busca')
@RotaDoPortal()
@Controller('portal')
export class PortalPreferenciasController {
  constructor(
    private readonly preferencias: PortalPreferenciasService,
    private readonly busca: PortalBuscaService,
  ) {}

  @Documenta({
    resumo: 'Minhas preferências',
    descricao:
      'Horário de silêncio (do push dos avisos normais) e e-mail por tipo. Quem nunca salvou recebe o padrão. Avisos de segurança (entrada, 2FA) não dependem disto.',
    resposta: preferenciasDoPortalSchema,
    erros: [401, 403, 503],
  })
  @Get('preferencias')
  obter(): Promise<PreferenciasDoPortal> {
    return this.preferencias.obter()
  }

  @Documenta({
    resumo: 'Salvar minhas preferências',
    corpo: salvarPreferenciasDoPortalSchema,
    resposta: preferenciasDoPortalSchema,
    erros: [400, 401, 403, 429, 503],
  })
  @Put('preferencias')
  @Limite({ nome: 'portal-preferencias', max: 60, janelaS: 3600 })
  salvar(
    @Body(new ZodPipe(salvarPreferenciasDoPortalSchema)) dados: SalvarPreferenciasDoPortalEntrada,
  ): Promise<PreferenciasDoPortal> {
    return this.preferencias.salvar(dados)
  }

  @Documenta({
    resumo: 'Configuração do push',
    descricao:
      'Se o push está disponível neste servidor, a chave pública (VAPID) e quantos aparelhos desta conta estão inscritos.',
    resposta: configuracaoDePushSchema,
    erros: [401, 403, 503],
  })
  @Get('push/configuracao')
  configuracaoDePush(): Promise<ConfiguracaoDePush> {
    return this.preferencias.configuracaoDePush()
  }

  @Documenta({
    resumo: 'Ativar o push neste aparelho',
    descricao:
      'Guarda a inscrição (endereço e chaves) que o navegador gerou depois do consentimento da pessoa. Idempotente. 503 `push_indisponivel`; 409 `aparelho_em_uso` se o aparelho já recebe avisos de outra conta.',
    corpo: inscreverPushSchema,
    resposta: configuracaoDePushSchema,
    status: 201,
    erros: [400, 401, 403, 409, 429, 503],
  })
  @Post('push/inscricoes')
  @Limite({ nome: 'portal-push', max: 30, janelaS: 3600 })
  inscrever(
    @Body(new ZodPipe(inscreverPushSchema)) dados: InscreverPushEntrada,
  ): Promise<ConfiguracaoDePush> {
    return this.preferencias.inscrever(dados)
  }

  @Documenta({
    resumo: 'Desativar o push neste aparelho',
    corpo: removerInscricaoDePushSchema,
    resposta: configuracaoDePushSchema,
    erros: [400, 401, 403, 503],
  })
  @Delete('push/inscricoes')
  @HttpCode(200)
  remover(
    @Body(new ZodPipe(removerInscricaoDePushSchema)) dados: RemoverInscricaoDePushEntrada,
  ): Promise<ConfiguracaoDePush> {
    return this.preferencias.remover(dados)
  }

  @Documenta({
    resumo: 'Busca global',
    descricao:
      'Chamados, documentos, eventos e publicações que a pessoa pode ver, pelo título e pelo texto (sem acento e sem diferenciar maiúsculas). Até 5 por tipo; mínimo de 2 letras.',
    consulta: consultaDeBuscaDoPortalSchema,
    resposta: resultadoDaBuscaDoPortalSchema,
    erros: [400, 401, 403, 429, 503],
  })
  @Get('busca')
  @Limite({ nome: 'portal-busca', max: 600, janelaS: 3600 })
  buscar(
    @Query(new ZodPipe(consultaDeBuscaDoPortalSchema)) consulta: ConsultaDeBuscaDoPortal,
  ): Promise<ResultadoDaBuscaDoPortal> {
    return this.busca.buscar(consulta.q)
  }
}
