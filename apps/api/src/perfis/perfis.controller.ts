import {
  type AtribuirPerfilEntrada,
  atribuirPerfilSchema,
  type CriarPerfilEntrada,
  criarPerfilSchema,
  type DuplicarPerfilEntrada,
  duplicarPerfilSchema,
  type EditarPerfilEntrada,
  editarPerfilSchema,
  type MembroDoPerfil,
  membroDoPerfilSchema,
  type PerfilDeAcesso,
  perfilDeAcessoSchema,
  type PerfilDoMembro,
  perfilDoMembroSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { PerfisService } from './perfis.service.js'

const GERIR = 'Exige a permissão `perfis.gerir`.'

/** Perfis de acesso da empresa ativa (Configurações → Perfis de acesso). */
@ApiTags('Perfis de acesso')
@Controller('perfis')
@Permissao('perfis.gerir')
export class PerfisController {
  constructor(private readonly perfis: PerfisService) {}

  @Documenta({
    resumo: 'Perfis de acesso',
    descricao: `${GERIR} Os não excluídos, com a matriz de permissões e quantos membros têm cada um (os de sistema primeiro).`,
    resposta: z.array(perfilDeAcessoSchema),
    erros: [401, 403, 409],
  })
  @Get()
  listar(): Promise<PerfilDeAcesso[]> {
    return this.perfis.listar()
  }

  @Documenta({
    resumo: 'Um perfil de acesso',
    descricao: GERIR,
    resposta: perfilDeAcessoSchema,
    erros: [401, 403, 404],
  })
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string): Promise<PerfilDeAcesso> {
    return this.perfis.obter(id)
  }

  @Documenta({
    resumo: 'Usuários do perfil',
    descricao: `${GERIR} Membros não excluídos cujo perfil efetivo é este.`,
    resposta: z.array(membroDoPerfilSchema),
    erros: [401, 403, 404],
  })
  @Get(':id/membros')
  membros(@Param('id', new ParseUUIDPipe()) id: string): Promise<MembroDoPerfil[]> {
    return this.perfis.membros(id)
  }

  @Documenta({
    resumo: 'Criar perfil de acesso',
    descricao: `${GERIR} Nome único na empresa (sem diferença de caixa). Só chaves do catálogo; alcance só onde se admite. Registra na auditoria.`,
    corpo: criarPerfilSchema,
    resposta: perfilDeAcessoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Post()
  criar(@Body(new ZodPipe(criarPerfilSchema)) dados: CriarPerfilEntrada): Promise<PerfilDeAcesso> {
    return this.perfis.criar(dados)
  }

  @Documenta({
    resumo: 'Duplicar perfil de acesso',
    descricao: `${GERIR} Copia descrição, 2FA e permissões para um perfil novo da empresa, com o nome informado.`,
    corpo: duplicarPerfilSchema,
    resposta: perfilDeAcessoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Post(':id/duplicar')
  duplicar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(duplicarPerfilSchema)) dados: DuplicarPerfilEntrada,
  ): Promise<PerfilDeAcesso> {
    return this.perfis.duplicar(id, dados)
  }

  @Documenta({
    resumo: 'Editar perfil de acesso',
    descricao: `${GERIR} Nome, descrição, 2FA, situação e a matriz inteira de permissões. Recusa (409): o Administrador sem \`perfis.gerir\` ou \`equipe.gerir\`; inativar perfil de sistema ou em uso; tirar \`perfis.gerir\` do próprio perfil; deixar a empresa sem ninguém ativo que gere os perfis. Registra na auditoria, com as permissões antes e depois.`,
    corpo: editarPerfilSchema,
    resposta: perfilDeAcessoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(editarPerfilSchema)) dados: EditarPerfilEntrada,
  ): Promise<PerfilDeAcesso> {
    return this.perfis.editar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir perfil de acesso',
    descricao: `${GERIR} Exclusão lógica. Recusa (409) perfil de sistema e perfil com membros ou convites pendentes.`,
    status: 204,
    erros: [401, 403, 404, 409],
  })
  @HttpCode(204)
  @Delete(':id')
  async excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.perfis.excluir(id)
  }
}

/** Troca do perfil de um membro (substitui a troca de papel). */
@ApiTags('Perfis de acesso')
@Controller('membros')
export class PerfilDoMembroController {
  constructor(private readonly perfis: PerfisService) {}

  @Documenta({
    resumo: 'Trocar o perfil de acesso de um membro',
    descricao: `${GERIR} Recusa: trocar o próprio perfil (403), o do dono da conta (403), perfil inativo (409) e deixar a empresa sem ninguém ativo que gere os perfis (409). Membro de outra empresa dá 404. Registra na auditoria.`,
    corpo: atribuirPerfilSchema,
    resposta: perfilDoMembroSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Put(':id/perfil')
  @Permissao('perfis.gerir')
  atribuir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(atribuirPerfilSchema)) dados: AtribuirPerfilEntrada,
  ): Promise<PerfilDoMembro> {
    return this.perfis.atribuir(id, dados)
  }
}
