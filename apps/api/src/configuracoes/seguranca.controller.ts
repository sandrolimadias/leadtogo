import {
  type Seguranca,
  type SegurancaPatch,
  segurancaPatchSchema,
  segurancaSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { SegurancaService } from './seguranca.service.js'

/** Segurança da empresa ativa. A tela fica para as Configurações; por ora só a API. */
@ApiTags('Configurações')
@Controller('configuracoes/seguranca')
export class SegurancaController {
  constructor(private readonly servico: SegurancaService) {}

  @Documenta({
    resumo: 'Segurança da empresa ativa',
    descricao:
      'Hoje: `doisFatoresExigido`, a política de 2FA da empresa: `admin` (padrão), `admin_gestor` ou `todos`. Quem entra na empresa sem 2FA e a política exige para o papel dele é levado à ativação (`2fa_obrigatorio` nas rotas dela).',
    resposta: segurancaSchema,
    erros: [401, 403, 409],
  })
  @Get()
  obter(): Promise<Seguranca> {
    return this.servico.obter()
  }

  @Documenta({
    resumo: 'Alterar a segurança da empresa ativa',
    descricao:
      'Só administradores da empresa ativa (403 `acesso_negado` para os demais). Vale na próxima requisição de cada pessoa da empresa.',
    corpo: segurancaPatchSchema,
    resposta: segurancaSchema,
    erros: [400, 401, 403, 409],
  })
  @Patch()
  alterar(@Body(new ZodPipe(segurancaPatchSchema)) patch: SegurancaPatch): Promise<Seguranca> {
    return this.servico.alterar(patch)
  }
}
