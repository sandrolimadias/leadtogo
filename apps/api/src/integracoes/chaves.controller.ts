import {
  type AlterarChaveEntrada,
  alterarChaveSchema,
  type ChaveCriada,
  chaveCriadaSchema,
  type ChaveDeApi,
  chaveDeApiSchema,
  type CriarChaveEntrada,
  criarChaveSchema,
  type ListaDeChaves,
  listaDeChavesSchema,
  type RotacionarChaveEntrada,
  rotacionarChaveSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Acesso } from '../acesso/dados-de-acesso.decorator.js'
import type { DadosDeAcesso } from '../acesso/requisicao.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { ChavesService } from './chaves.service.js'

/** Chaves de API da empresa ativa (Configurações → Integrações). Só quem tem `integracoes.gerir`. */
@ApiTags('Integrações: chaves de API')
@Controller('integracoes/chaves')
export class ChavesController {
  constructor(private readonly servico: ChavesService) {}

  @Documenta({
    resumo: 'Chaves de API da empresa',
    descricao:
      'Exige `integracoes.gerir`. Ativas primeiro, depois as revogadas. O token nunca volta: só o prefixo (`ltg_live_a1B2c3D4`).',
    resposta: listaDeChavesSchema,
    erros: [401, 403],
  })
  @Permissao('integracoes.gerir')
  @Get()
  listar(): Promise<ListaDeChaves> {
    return this.servico.listar()
  }

  @Documenta({
    resumo: 'Criar uma chave de API',
    descricao:
      'Exige `integracoes.gerir` e o 2FA ativo de quem cria (403 `2fa_obrigatorio`). Devolve o **token uma única vez**. Permissões só entre as liberadas para integração; alcance sempre "todas". 422 `responsavel_invalido`, `validade_no_passado` ou `ip_invalido`.',
    corpo: criarChaveSchema,
    resposta: chaveCriadaSchema,
    status: 201,
    erros: [400, 401, 403, 422],
  })
  @Permissao('integracoes.gerir')
  @Post()
  @Limite({ nome: 'chaves-api', max: 30, janelaS: 3600 })
  criar(
    @Body(new ZodPipe(criarChaveSchema)) dados: CriarChaveEntrada,
    @Acesso() acesso: DadosDeAcesso,
  ): Promise<ChaveCriada> {
    return this.servico.criar(dados, acesso.sessao.twoFactorEnabled)
  }

  @Documenta({
    resumo: 'Alterar uma chave de API',
    descricao:
      'Exige `integracoes.gerir`. Nome, permissões, IPs, responsável padrão e validade; o token não muda. 409 `chave_revogada`.',
    corpo: alterarChaveSchema,
    resposta: chaveDeApiSchema,
    erros: [400, 401, 403, 404, 409, 422],
  })
  @Permissao('integracoes.gerir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarChaveSchema)) dados: AlterarChaveEntrada,
  ): Promise<ChaveDeApi> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Rotacionar uma chave de API',
    descricao:
      'Exige `integracoes.gerir` e o 2FA ativo. Cria uma chave nova com os mesmos dados (devolve o token uma vez) e a antiga vale por mais `prazoDias` (0 a 7; 0 revoga agora). 409 `chave_revogada` ou `chave_ja_rotacionada`.',
    corpo: rotacionarChaveSchema,
    resposta: chaveCriadaSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('integracoes.gerir')
  @Post(':id/rotacionar')
  @Limite({ nome: 'chaves-api', max: 30, janelaS: 3600 })
  rotacionar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(rotacionarChaveSchema)) dados: RotacionarChaveEntrada,
    @Acesso() acesso: DadosDeAcesso,
  ): Promise<ChaveCriada> {
    return this.servico.rotacionar(id, dados, acesso.sessao.twoFactorEnabled)
  }

  @Documenta({
    resumo: 'Revogar uma chave de API',
    descricao:
      'Exige `integracoes.gerir`. Efeito imediato; a chave fica na lista, revogada. 409 `chave_revogada`.',
    resposta: chaveDeApiSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('integracoes.gerir')
  @Post(':id/revogar')
  @HttpCode(200)
  revogar(@Param('id', new ParseUUIDPipe()) id: string): Promise<ChaveDeApi> {
    return this.servico.revogar(id)
  }
}
