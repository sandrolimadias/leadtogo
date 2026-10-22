import {
  type Seguranca,
  type SegurancaPatch,
  segurancaPatchSchema,
  segurancaSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao, TodoMembro } from '../acesso/acesso.decorators.js'
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
      'Os perfis de acesso da empresa e se cada um exige a verificação em duas etapas (`exige2fa`). Quem entra na empresa sem 2FA e o perfil dele exige é levado à ativação (`2fa_obrigatorio` nas rotas dela). Quem ainda não tem perfil segue a política antiga por papel (transição).',
    resposta: segurancaSchema,
    erros: [401, 403, 409],
  })
  @Get()
  @TodoMembro()
  obter(): Promise<Seguranca> {
    return this.servico.obter()
  }

  @Documenta({
    resumo: 'Alterar a segurança da empresa ativa',
    descricao:
      'Exige `seguranca.gerir` (403 `acesso_negado` para os demais). Corpo: `{ perfis: { [perfilId]: exige2fa } }`. O perfil Administrador sempre exige (409 `admin_exige_2fa`); perfil de outra empresa ou excluído, 404. Vale na próxima requisição de cada pessoa da empresa. Registra na auditoria.',
    corpo: segurancaPatchSchema,
    resposta: segurancaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch()
  @Permissao('seguranca.gerir')
  alterar(@Body(new ZodPipe(segurancaPatchSchema)) patch: SegurancaPatch): Promise<Seguranca> {
    return this.servico.alterar(patch)
  }
}
