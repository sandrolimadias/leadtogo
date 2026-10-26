import {
  type AcessoDoPortal,
  acessoDoPortalSchema,
  type AlterarAcessoDoPortalEntrada,
  alterarAcessoDoPortalSchema,
  type AtualizarConfiguracaoDoPortalEntrada,
  atualizarConfiguracaoDoPortalSchema,
  type ConfiguracaoDoPortal,
  configuracaoDoPortalSchema,
  type ConsultaDeAcessosDoPortal,
  consultaDeAcessosDoPortalSchema,
  type ConsultaDePedidosDeAcesso,
  consultaDePedidosDeAcessoSchema,
  type DarAcessoAoPortalEntrada,
  darAcessoAoPortalSchema,
  type ListaDeAcessosDoPortal,
  listaDeAcessosDoPortalSchema,
  type ListaDePedidosDeAcesso,
  listaDePedidosDeAcessoSchema,
  type TratarPedidoDeAcessoEntrada,
  tratarPedidoDeAcessoSchema,
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

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PortalAcessosService } from './portal-acessos.service.js'
import { PortalPedidosService } from './portal-pedidos.service.js'

/**
 * Gestão do portal pela EQUIPE (rotas do CRM, com a sessão e o perfil de acesso do CRM). As rotas do próprio
 * cliente ficam em `/v1/portal/*`.
 */
@ApiTags('Portal do cliente: gestão')
@Controller('portal-acessos')
export class PortalAcessosController {
  constructor(private readonly servico: PortalAcessosService) {}

  @Documenta({
    resumo: 'Acessos ao portal',
    descricao:
      'Exige `portal.ver` ou `portal.acessos`. Lista os acessos (sem os revogados, salvo filtro por situação), por empresa-cliente, contato ou busca.',
    consulta: consultaDeAcessosDoPortalSchema,
    resposta: listaDeAcessosDoPortalSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('portal.ver', 'portal.acessos')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeAcessosDoPortalSchema)) consulta: ConsultaDeAcessosDoPortal,
  ): Promise<ListaDeAcessosDoPortal> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Dar acesso ao portal a um contato',
    descricao:
      'Exige `portal.acessos`. O contato precisa estar ativo na empresa-cliente. Sem `email`, usa o principal do contato. Cria o acesso como "Convite enviado" e envia o link de convite (7 dias, uso único). Portal desligado dá 409; contato fora da empresa, 422; já tem acesso ou e-mail em uso, 409.',
    corpo: darAcessoAoPortalSchema,
    resposta: acessoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 409, 422, 429, 503],
  })
  @Permissao('portal.acessos')
  @Post()
  @Limite({ nome: 'portal-dar-acesso', max: 60, janelaS: 3600 })
  darAcesso(
    @Body(new ZodPipe(darAcessoAoPortalSchema)) dados: DarAcessoAoPortalEntrada,
  ): Promise<AcessoDoPortal> {
    return this.servico.darAcesso(dados)
  }

  @Documenta({
    resumo: 'Reenviar o convite',
    descricao:
      'Exige `portal.acessos`. Só para quem ainda não aceitou. O convite anterior deixa de valer.',
    resposta: acessoDoPortalSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Permissao('portal.acessos')
  @Post(':id/reenviar')
  @Limite({ nome: 'portal-dar-acesso', max: 60, janelaS: 3600 })
  reenviar(@Param('id', new ParseUUIDPipe()) id: string): Promise<AcessoDoPortal> {
    return this.servico.reenviarConvite(id)
  }

  @Documenta({
    resumo: 'Alterar o papel ou suspender/reativar um acesso',
    descricao:
      'Exige `portal.acessos`. Suspender derruba as sessões abertas na hora. Só se suspende o acesso ativo e só se reativa o suspenso (409 nos outros casos).',
    corpo: alterarAcessoDoPortalSchema,
    resposta: acessoDoPortalSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.acessos')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarAcessoDoPortalSchema)) dados: AlterarAcessoDoPortalEntrada,
  ): Promise<AcessoDoPortal> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Revogar um acesso',
    descricao:
      'Exige `portal.acessos`. Revoga em definitivo (um novo convite cria outro acesso), derruba as sessões e invalida os links pendentes.',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.acessos')
  @Delete(':id')
  @HttpCode(204)
  async revogar(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.servico.revogar(id)
  }
}

@ApiTags('Portal do cliente: gestão')
@Controller('portal-pedidos')
export class PortalPedidosController {
  constructor(private readonly servico: PortalPedidosService) {}

  @Documenta({
    resumo: 'Pedidos de acesso dos clientes',
    descricao:
      'Exige `portal.ver` ou `portal.acessos`. Pedidos que o Responsável de uma empresa-cliente fez para colegas (por padrão, os pendentes).',
    consulta: consultaDePedidosDeAcessoSchema,
    resposta: listaDePedidosDeAcessoSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('portal.ver', 'portal.acessos')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDePedidosDeAcessoSchema)) consulta: ConsultaDePedidosDeAcesso,
  ): Promise<ListaDePedidosDeAcesso> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Aprovar ou recusar um pedido de acesso',
    descricao:
      'Exige `portal.acessos`. Aprovar cria o contato, o vínculo com a empresa-cliente e o acesso (Colega) com o convite, numa transação só. Recusar guarda o motivo, que o Responsável vê. Pedido já tratado dá 409.',
    corpo: tratarPedidoDeAcessoSchema,
    status: 204,
    erros: [400, 401, 403, 404, 409, 422, 503],
  })
  @Permissao('portal.acessos')
  @Post(':id/tratar')
  @HttpCode(204)
  async tratar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(tratarPedidoDeAcessoSchema)) dados: TratarPedidoDeAcessoEntrada,
  ): Promise<void> {
    await this.servico.tratar(id, dados)
  }
}

@ApiTags('Portal do cliente: gestão')
@Controller('portal-configuracao')
export class PortalConfiguracaoController {
  constructor(private readonly servico: PortalAcessosService) {}

  @Documenta({
    resumo: 'Configuração do portal',
    descricao: 'Exige `portal.ver` ou `portal.configurar`.',
    resposta: configuracaoDoPortalSchema,
    erros: [401, 403, 409],
  })
  @Permissao('portal.ver', 'portal.configurar')
  @Get()
  obter(): Promise<ConfiguracaoDoPortal> {
    return this.servico.configuracao()
  }

  @Documenta({
    resumo: 'Alterar a configuração do portal',
    descricao:
      'Exige `portal.configurar`. Liga ou desliga o portal da empresa (desligado, ninguém entra e as sessões deixam de valer), muda o nome mostrado no topo e a exigência de 2FA do Responsável.',
    corpo: atualizarConfiguracaoDoPortalSchema,
    resposta: configuracaoDoPortalSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('portal.configurar')
  @Put()
  atualizar(
    @Body(new ZodPipe(atualizarConfiguracaoDoPortalSchema))
    dados: AtualizarConfiguracaoDoPortalEntrada,
  ): Promise<ConfiguracaoDoPortal> {
    return this.servico.atualizarConfiguracao(dados)
  }
}
