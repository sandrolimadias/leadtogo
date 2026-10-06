import type { MembroDaEquipe } from '@leadtogo/shared'
import { Controller, Get, Query } from '@nestjs/common'
import { z } from 'zod'

import { ZodPipe } from '../http/zod.pipe.js'
import { ConvitesService } from './convites.service.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

/** Equipe da empresa ativa (somente leitura). */
@Controller('membros')
export class MembrosController {
  constructor(private readonly servico: ConvitesService) {}

  /** Lista os membros (não excluídos). O e-mail só aparece para administradores e gestores. */
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<MembroDaEquipe[]> {
    return this.servico.equipe(consulta.incluirInativos === 'true')
  }
}
