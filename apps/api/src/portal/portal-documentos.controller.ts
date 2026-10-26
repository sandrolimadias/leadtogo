import {
  type ConsultaDeDocumentosDoPortal,
  consultaDeDocumentosDoPortalSchema,
  downloadDoDocumentoSchema,
  type DownloadDoDocumento,
  type ListaDeDocumentosDoPortal,
  listaDeDocumentosDoPortalSchema,
} from '@leadtogo/shared'
import { Controller, Get, Param, ParseUUIDPipe, Post, Query, HttpCode } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PortalDocumentosService } from './portal-documentos.service.js'
import { RotaDoPortal } from './portal.decorators.js'

/** Documentos do cliente (Fase 3C): lista e download com registro. */
@ApiTags('Portal do cliente: documentos')
@RotaDoPortal()
@Controller('portal/documentos')
export class PortalDocumentosController {
  constructor(private readonly servico: PortalDocumentosService) {}

  @Documenta({
    resumo: 'Documentos da empresa',
    descricao:
      'Só os documentos já verificados pelo antivírus, visíveis no portal e do alcance da empresa do cliente, os mais novos primeiro. Busca pelo título ou pela descrição.',
    consulta: consultaDeDocumentosDoPortalSchema,
    resposta: listaDeDocumentosDoPortalSchema,
    erros: [400, 401, 403, 503],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeDocumentosDoPortalSchema)) consulta: ConsultaDeDocumentosDoPortal,
  ): Promise<ListaDeDocumentosDoPortal> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Baixar um documento',
    descricao:
      'Registra o download (quem, de que empresa e quando) e devolve a URL pré-assinada de 60 segundos, sempre como arquivo. Documento que o cliente não enxerga: 404 `documento_nao_encontrado`.',
    resposta: downloadDoDocumentoSchema,
    status: 200,
    erros: [400, 401, 403, 404, 429, 503],
  })
  @Post(':id/download')
  @HttpCode(200)
  @Limite({ nome: 'portal-baixar-documento', max: 300, janelaS: 3600 })
  baixar(@Param('id', new ParseUUIDPipe()) id: string): Promise<DownloadDoDocumento> {
    return this.servico.baixar(id)
  }
}
