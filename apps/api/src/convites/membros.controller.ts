import {
  type AlterarMembroEntrada,
  alterarMembroSchema,
  type MembroDaEquipe,
  membroDaEquipeSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Permissao, TodoMembro } from '../acesso/acesso.decorators.js'
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

  /** Lista os membros (não excluídos). O e-mail só aparece para quem tem `equipe.ver_emails`. */
  @Documenta({
    resumo: 'Equipe da empresa ativa',
    descricao:
      'Qualquer membro. Membros não excluídos da empresa ativa, com o perfil de acesso efetivo. O e-mail só aparece com `equipe.ver_emails`; o último acesso, com `equipe.gerir`.',
    consulta: consultaSchema,
    resposta: z.array(membroDaEquipeSchema),
    erros: [400, 401, 403, 409],
  })
  @Get()
  @TodoMembro()
  listar(
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<MembroDaEquipe[]> {
    return this.servico.equipe(consulta.incluirInativos === 'true')
  }

  @Documenta({
    resumo: 'Alterar situação (ou papel, legado) de um membro',
    descricao:
      'Ativa e desativa com `equipe.gerir` (desativar vale na próxima requisição da pessoa e mantém o histórico). `papel` é o legado: troca para o perfil de sistema dele e exige `perfis.gerir` (o novo é PUT /v1/membros/:id/perfil). Recusa: alterar a si mesmo (403) e o dono da conta (403); a empresa nunca fica sem quem gere os perfis de acesso (409). Membro de outra empresa dá 404. Registra na auditoria.',
    corpo: alterarMembroSchema,
    resposta: membroDaEquipeSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  @Permissao('equipe.gerir', 'perfis.gerir')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarMembroSchema)) dados: AlterarMembroEntrada,
  ): Promise<MembroDaEquipe> {
    return this.membros.alterar(id, dados)
  }
}
