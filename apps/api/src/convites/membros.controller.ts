import { type MembroDaEquipe, membroDaEquipeSchema } from '@leadtogo/shared'
import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { ConvitesService } from './convites.service.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

/** Equipe da empresa ativa (somente leitura). */
@ApiTags('Equipe e convites')
@Controller('membros')
export class MembrosController {
  constructor(private readonly servico: ConvitesService) {}

  /** Lista os membros (não excluídos). O e-mail só aparece para administradores e gestores. */
  @Documenta({
    resumo: 'Equipe da empresa ativa',
    descricao:
      'Membros não excluídos da empresa ativa. O e-mail só aparece para administradores e gestores.',
    consulta: consultaSchema,
    resposta: z.array(membroDaEquipeSchema),
    erros: [400, 401, 403, 409],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<MembroDaEquipe[]> {
    return this.servico.equipe(consulta.incluirInativos === 'true')
  }
}
