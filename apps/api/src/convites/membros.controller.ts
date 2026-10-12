import {
  type AlterarMembroEntrada,
  alterarMembroSchema,
  type MembroDaEquipe,
  membroDaEquipeSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { ConvitesService } from './convites.service.js'
import { MembrosService } from './membros.service.js'

const consultaSchema = z
  .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
  .strict()

/** Equipe da empresa ativa (somente leitura). */
@ApiTags('Equipe e convites')
@Controller('membros')
export class MembrosController {
  constructor(
    private readonly servico: ConvitesService,
    private readonly membros: MembrosService,
  ) {}

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

  @Documenta({
    resumo: 'Alterar papel ou situação de um membro',
    descricao:
      'Só administradores da empresa ativa. Muda o papel e/ou ativa e desativa (desativar vale na próxima requisição da pessoa e mantém o histórico). Recusa: alterar a si mesmo (403) e o dono da conta (403); a empresa nunca fica sem administrador (quem altera é sempre outro administrador ativo). Membro de outra empresa dá 404. Registra na auditoria.',
    corpo: alterarMembroSchema,
    resposta: membroDaEquipeSchema,
    erros: [400, 401, 403, 404],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarMembroSchema)) dados: AlterarMembroEntrada,
  ): Promise<MembroDaEquipe> {
    return this.membros.alterar(id, dados)
  }
}
