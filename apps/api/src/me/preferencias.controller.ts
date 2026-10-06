import {
  type Preferencias,
  type PreferenciasPatch,
  preferenciasPatchSchema,
  preferenciasSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { PreferenciasService } from './preferencias.service.js'

/** Exige empresa ativa (as preferências são do membro naquela empresa). */
@ApiTags('Usuário')
@Controller('me/preferencias')
export class PreferenciasController {
  constructor(private readonly servico: PreferenciasService) {}

  @Documenta({
    resumo: 'Minhas preferências',
    descricao:
      'Preferências de interface do membro na empresa ativa; sempre completas, com os padrões onde ainda não escolheu.',
    resposta: preferenciasSchema,
    erros: [401, 403, 409],
  })
  @Get()
  obter(): Promise<Preferencias> {
    return this.servico.obter()
  }

  /** Só o que mudou; `null` volta ao padrão. Chaves desconhecidas dão 400. */
  @Documenta({
    resumo: 'Alterar minhas preferências',
    descricao:
      'Só o que mudou. `null` volta uma chave ao padrão; em `filtroPadrao`, `null` remove o filtro da tela. Chaves desconhecidas dão 400.',
    corpo: preferenciasPatchSchema,
    resposta: preferenciasSchema,
    erros: [400, 401, 403, 409],
  })
  @Patch()
  alterar(
    @Body(new ZodPipe(preferenciasPatchSchema)) patch: PreferenciasPatch,
  ): Promise<Preferencias> {
    return this.servico.alterar(patch)
  }
}
