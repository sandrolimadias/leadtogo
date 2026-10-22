import {
  type ConfiguracaoDaCarteira,
  type ConfiguracaoDaCarteiraPatch,
  configuracaoDaCarteiraPatchSchema,
  configuracaoDaCarteiraSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao, TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { ConfiguracaoDaCarteiraService } from './carteira.service.js'

/** Regras da carteira de empresas da empresa ativa (Configurações → Carteira). */
@ApiTags('Configurações')
@Controller('configuracoes/carteira')
export class ConfiguracaoDaCarteiraController {
  constructor(private readonly servico: ConfiguracaoDaCarteiraService) {}

  @Documenta({
    resumo: 'Regras da carteira da empresa ativa',
    descricao:
      'Qualquer membro da empresa ativa. `bloquearEmpresaNaoAtiva` (padrão ligado): não cadastra CNPJ que a Receita não dê como ativo (409 `empresa_nao_ativa`), só em cadastro novo. Quem vê a carteira de quem agora é o alcance de `ver` no perfil de acesso.',
    resposta: configuracaoDaCarteiraSchema,
    erros: [401, 403, 409],
  })
  @Get()
  @TodoMembro()
  obter(): Promise<ConfiguracaoDaCarteira> {
    return this.servico.obter()
  }

  @Documenta({
    resumo: 'Alterar as regras da carteira',
    descricao:
      'Exige `carteira.configurar` (403 `acesso_negado` para os demais). Só o que vier muda. Vale na próxima requisição de cada pessoa. Registra na auditoria.',
    corpo: configuracaoDaCarteiraPatchSchema,
    resposta: configuracaoDaCarteiraSchema,
    erros: [400, 401, 403, 409],
  })
  @Patch()
  @Permissao('carteira.configurar')
  alterar(
    @Body(new ZodPipe(configuracaoDaCarteiraPatchSchema)) patch: ConfiguracaoDaCarteiraPatch,
  ): Promise<ConfiguracaoDaCarteira> {
    return this.servico.alterar(patch)
  }
}
