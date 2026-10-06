import {
  type EmpresaAtivaEntrada,
  type EmpresaAtivaResposta,
  empresaAtivaRespostaSchema,
  empresaAtivaSchema,
  type MeResposta,
  meRespostaSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { PermiteSem2fa, SemEmpresa } from '../acesso/acesso.decorators.js'
import { Acesso } from '../acesso/dados-de-acesso.decorator.js'
import type { DadosDeAcesso } from '../acesso/requisicao.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { MeService } from './me.service.js'

@ApiTags('Usuário')
@Controller()
export class MeController {
  constructor(private readonly servico: MeService) {}

  /**
   * Quem sou eu: usuário, empresas (com o papel em cada uma), empresa ativa e se falta ativar o 2FA.
   * Fica aberto ao administrador sem 2FA (é por aqui que o front sabe o que falta) e não exige
   * empresa ativa (é por aqui que o usuário escolhe uma).
   */
  @Documenta({
    resumo: 'Quem sou eu',
    descricao:
      'Usuário, empresas em que é membro (com o papel em cada uma), empresa ativa e se falta ativar o 2FA. Não exige empresa ativa e fica aberto ao administrador que ainda não ativou o 2FA.',
    resposta: meRespostaSchema,
    erros: [401],
  })
  @Get('me')
  @SemEmpresa()
  @PermiteSem2fa()
  me(@Acesso() acesso: DadosDeAcesso): Promise<MeResposta> {
    return this.servico.me(acesso)
  }

  /** Troca a empresa ativa da sessão. Administrador sem 2FA ainda não pode (403 2fa_obrigatorio). */
  @Documenta({
    resumo: 'Trocar a empresa ativa',
    descricao:
      'Define a empresa ativa DESTA sessão. Só vale para empresa em que o usuário é membro ativo e que está em teste ou ativa; uma empresa alheia e uma inexistente dão o mesmo 403 (`empresa_nao_permitida`). Administrador sem 2FA recebe `2fa_obrigatorio`.',
    corpo: empresaAtivaSchema,
    resposta: empresaAtivaRespostaSchema,
    erros: [400, 401, 403],
  })
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
