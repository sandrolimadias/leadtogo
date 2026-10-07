import { type OpcoesDeAcesso, opcoesDeAcessoSchema } from '@leadtogo/shared'
import { Controller, Get, Inject } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Publica } from '../acesso/acesso.decorators.js'
import { type Configuracao, loginGoogleLigado } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { Documenta } from '../documentacao/documenta.js'

@ApiTags('Acesso')
@Publica()
@Controller('acesso')
export class AcessoPublicoController {
  constructor(@Inject(CONFIGURACAO) private readonly config: Configuracao) {}

  @Documenta({
    resumo: 'Opções da tela de login',
    descricao:
      'Público. Diz o que a tela de login pode oferecer. Hoje: se "Entrar com Google" está ligado (`LOGIN_GOOGLE` e credenciais).',
    resposta: opcoesDeAcessoSchema,
    erros: [429],
  })
  @Get('opcoes')
  opcoes(): OpcoesDeAcesso {
    return { loginGoogle: loginGoogleLigado(this.config) }
  }
}
