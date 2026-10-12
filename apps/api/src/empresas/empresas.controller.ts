import {
  type CriarEmpresa,
  criarEmpresaSchema,
  type EmpresaCriada,
  empresaCriadaSchema,
} from '@leadtogo/shared'
import { Body, Controller, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'

import { SemEmpresa } from '../acesso/acesso.decorators.js'
import { Acesso } from '../acesso/dados-de-acesso.decorator.js'
import type { DadosDeAcesso } from '../acesso/requisicao.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { EmpresasService } from './empresas.service.js'

@ApiTags('Empresas do grupo')
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly servico: EmpresasService) {}

  @Documenta({
    resumo: 'Criar empresa do grupo',
    descricao:
      'Só dono ou administrador da conta. Cria a empresa (em teste) na conta, as configurações padrão e o criador como administrador dela, numa transação, com registro na auditoria. A empresa NÃO vira a ativa: troque com `POST /v1/sessao/empresa-ativa`. O CNPJ é opcional e validado; não há unicidade global (não revela outras contas), só o aviso `cnpjRepetidoNaConta` quando a mesma conta já tem o CNPJ. Com mais de uma conta administrada, `contaId` é obrigatório.',
    corpo: criarEmpresaSchema,
    resposta: empresaCriadaSchema,
    status: 201,
    erros: [400, 401, 403, 429],
  })
  @Post()
  @SemEmpresa()
  @Limite({ nome: 'empresas-criar', max: 10, janelaS: 3600 })
  criar(
    @Acesso() acesso: DadosDeAcesso,
    @Req() req: Request,
    @Body(new ZodPipe(criarEmpresaSchema)) dados: CriarEmpresa,
  ): Promise<EmpresaCriada> {
    return this.servico.criar(acesso, dados, req.ip)
  }
}
