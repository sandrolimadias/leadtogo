import {
  listaDePedidosDoClienteSchema,
  type ListaDePedidosDoCliente,
  type PedirAcessoParaColegaEntrada,
  pedirAcessoParaColegaSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PortalPedidosService } from './portal-pedidos.service.js'
import { RotaDoPortal } from './portal.decorators.js'

@ApiTags('Portal do cliente: acesso')
@RotaDoPortal()
@Controller('portal/pedidos-de-acesso')
export class PortalPedidosClienteController {
  constructor(private readonly servico: PortalPedidosService) {}

  @Documenta({
    resumo: 'Meus pedidos de acesso para colegas',
    descricao:
      'Só o Responsável. Lista os pedidos da própria empresa-cliente e como a equipe os tratou.',
    resposta: listaDePedidosDoClienteSchema,
    erros: [401, 403, 503],
  })
  @Get()
  listar(): Promise<ListaDePedidosDoCliente> {
    return this.servico.doCliente()
  }

  @Documenta({
    resumo: 'Pedir acesso para um colega',
    descricao:
      'Só o Responsável. A equipe aprova (cria o acesso) ou recusa. A empresa-cliente vem da sessão, nunca do corpo. E-mail que já tem acesso ou pedido pendente dá 409.',
    corpo: pedirAcessoParaColegaSchema,
    status: 204,
    erros: [400, 401, 403, 409, 429, 503],
  })
  @Post()
  @HttpCode(204)
  @Limite({ nome: 'portal-pedido-acesso', max: 20, janelaS: 3600 })
  async pedir(
    @Body(new ZodPipe(pedirAcessoParaColegaSchema)) dados: PedirAcessoParaColegaEntrada,
  ): Promise<void> {
    await this.servico.pedir(dados)
  }
}
