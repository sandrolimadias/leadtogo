import {
  type ComentarioDoPortal,
  type ComentarNoPortalEntrada,
  comentarioDoPortalSchema,
  comentarNoPortalSchema,
  type ConsultaDoFeed,
  consultaDoFeedSchema,
  type DenunciarNoPortalEntrada,
  denunciarNoPortalSchema,
  type FeedDoPortal,
  feedDoPortalSchema,
  type ListaDeComentariosDoPortal,
  listaDeComentariosDoPortalSchema,
  type MarcarLeiturasEntrada,
  marcarLeiturasSchema,
  type PublicacaoDoPortal,
  publicacaoDoPortalSchema,
  type ReacoesDaPublicacao,
  reacoesDaPublicacaoSchema,
  type ReagirNoPortalEntrada,
  reagirNoPortalSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PortalPublicacoesService } from './portal-publicacoes.service.js'
import { RotaDoPortal } from './portal.decorators.js'

const uuid = () => new ParseUUIDPipe()
const leiturasMarcadasSchema = z
  .object({ marcadas: z.number().int().nonnegative() })
  .meta({ id: 'LeiturasMarcadas' })

/** Publicações do cliente (Fase 3B): feed, reações, comentários, denúncia e leitura. */
@ApiTags('Portal do cliente: publicações')
@RotaDoPortal()
@Controller('portal/publicacoes')
export class PortalPublicacoesController {
  constructor(private readonly servico: PortalPublicacoesService) {}

  @Documenta({
    resumo: 'Feed de publicações',
    descricao:
      'Só as publicadas e do alcance da empresa do cliente, a fixada primeiro. As reações vêm como total (nunca quem reagiu).',
    consulta: consultaDoFeedSchema,
    resposta: feedDoPortalSchema,
    erros: [400, 401, 403, 503],
  })
  @Get()
  feed(@Query(new ZodPipe(consultaDoFeedSchema)) consulta: ConsultaDoFeed): Promise<FeedDoPortal> {
    return this.servico.feed(consulta)
  }

  @Documenta({
    resumo: 'Marcar publicações como lidas',
    descricao:
      'Registra a leitura (uma por pessoa e publicação) das que o cliente enxerga; as outras são ignoradas. Base do alcance que a equipe vê.',
    corpo: marcarLeiturasSchema,
    resposta: leiturasMarcadasSchema,
    erros: [400, 401, 403, 503],
  })
  @Post('leituras')
  @HttpCode(200)
  @Limite({ nome: 'portal-leituras', max: 600, janelaS: 3600 })
  leituras(
    @Body(new ZodPipe(marcarLeiturasSchema)) dados: MarcarLeiturasEntrada,
  ): Promise<{ marcadas: number }> {
    return this.servico.marcarLeituras(dados.ids)
  }

  @Documenta({
    resumo: 'Denunciar um comentário',
    descricao:
      'Só comentário que o cliente enxerga e que não é dele (422 `denuncia_propria`). Denunciar duas vezes é inofensivo. A equipe trata no hub.',
    corpo: denunciarNoPortalSchema,
    status: 204,
    erros: [400, 401, 403, 404, 422, 503],
  })
  @Post('comentarios/:comentarioId/denuncia')
  @HttpCode(204)
  @Limite({ nome: 'portal-denunciar', max: 60, janelaS: 3600 })
  async denunciar(
    @Param('comentarioId', uuid()) comentarioId: string,
    @Body(new ZodPipe(denunciarNoPortalSchema)) dados: DenunciarNoPortalEntrada,
  ): Promise<void> {
    await this.servico.denunciar(comentarioId, dados)
  }

  @Documenta({
    resumo: 'Ver uma publicação',
    resposta: publicacaoDoPortalSchema,
    erros: [400, 401, 403, 404, 503],
  })
  @Get(':id')
  obter(@Param('id', uuid()) id: string): Promise<PublicacaoDoPortal> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Reagir (ou desfazer a reação)',
    descricao:
      'Clicar liga a reação (curtir ou parabéns); clicar de novo desliga. Devolve os totais e as reações da pessoa.',
    corpo: reagirNoPortalSchema,
    resposta: reacoesDaPublicacaoSchema,
    status: 200,
    erros: [400, 401, 403, 404, 503],
  })
  @Post(':id/reacoes')
  @HttpCode(200)
  @Limite({ nome: 'portal-reagir', max: 600, janelaS: 3600 })
  reagir(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(reagirNoPortalSchema)) dados: ReagirNoPortalEntrada,
  ): Promise<ReacoesDaPublicacao> {
    return this.servico.alternarReacao(id, dados.tipo)
  }

  @Documenta({
    resumo: 'Comentários da publicação',
    descricao:
      'Os visíveis (de todas as empresas, com o nome reduzido do autor) e os próprios, mesmo ocultos, com o motivo.',
    resposta: listaDeComentariosDoPortalSchema,
    erros: [400, 401, 403, 404, 503],
  })
  @Get(':id/comentarios')
  comentarios(@Param('id', uuid()) id: string): Promise<ListaDeComentariosDoPortal> {
    return this.servico.comentarios(id)
  }

  @Documenta({
    resumo: 'Comentar',
    descricao:
      'Texto puro de 1 a 1000 caracteres. 409 `comentarios_fechados` se a publicação está bloqueada ou a chave geral está desligada.',
    corpo: comentarNoPortalSchema,
    resposta: comentarioDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Post(':id/comentarios')
  @Limite({ nome: 'portal-comentar', max: 30, janelaS: 3600 })
  comentar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(comentarNoPortalSchema)) dados: ComentarNoPortalEntrada,
  ): Promise<ComentarioDoPortal> {
    return this.servico.comentar(id, dados)
  }
}
