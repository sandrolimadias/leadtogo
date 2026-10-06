import {
  type EmpresaAtivaEntrada,
  type EmpresaAtivaResposta,
  empresaAtivaSchema,
  type MeResposta,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'

import { PermiteSem2fa, SemEmpresa } from '../acesso/acesso.decorators.js'
import { Acesso } from '../acesso/dados-de-acesso.decorator.js'
import type { DadosDeAcesso } from '../acesso/requisicao.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { MeService } from './me.service.js'

@Controller()
export class MeController {
  constructor(private readonly servico: MeService) {}

  /**
   * Quem sou eu: usuário, empresas (com o papel em cada uma), empresa ativa e se falta ativar o 2FA.
   * Fica aberto ao administrador sem 2FA (é por aqui que o front sabe o que falta) e não exige
   * empresa ativa (é por aqui que o usuário escolhe uma).
   */
  @Get('me')
  @SemEmpresa()
  @PermiteSem2fa()
  me(@Acesso() acesso: DadosDeAcesso): Promise<MeResposta> {
    return this.servico.me(acesso)
  }

  /** Troca a empresa ativa da sessão. Administrador sem 2FA ainda não pode (403 2fa_obrigatorio). */
  @Post('sessao/empresa-ativa')
  @HttpCode(200)
  @SemEmpresa()
  trocarEmpresaAtiva(
    @Acesso() acesso: DadosDeAcesso,
    @Body(new ZodPipe(empresaAtivaSchema)) corpo: EmpresaAtivaEntrada,
  ): Promise<EmpresaAtivaResposta> {
    return this.servico.trocarEmpresaAtiva(acesso, corpo.empresaId)
  }
}
