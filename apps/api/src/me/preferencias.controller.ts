import {
  type Preferencias,
  type PreferenciasPatch,
  preferenciasPatchSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Patch } from '@nestjs/common'

import { ZodPipe } from '../http/zod.pipe.js'
import { PreferenciasService } from './preferencias.service.js'

/** Exige empresa ativa (as preferências são do membro naquela empresa). */
@Controller('me/preferencias')
export class PreferenciasController {
  constructor(private readonly servico: PreferenciasService) {}

  @Get()
  obter(): Promise<Preferencias> {
    return this.servico.obter()
  }

  /** Só o que mudou; `null` volta ao padrão. Chaves desconhecidas dão 400. */
  @Patch()
  alterar(
    @Body(new ZodPipe(preferenciasPatchSchema)) patch: PreferenciasPatch,
  ): Promise<Preferencias> {
    return this.servico.alterar(patch)
  }
}
