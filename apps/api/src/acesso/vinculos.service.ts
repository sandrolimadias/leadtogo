import type { Conexao } from '@leadtogo/db'
import { Inject, Injectable } from '@nestjs/common'

import { BANCO } from '../infra/infra.module.js'
import type { PapelMembro, Vinculo } from './requisicao.js'

/** Descobre, sem tenant ativo, as empresas do usuário (funções SECURITY DEFINER da migração 0006). */
@Injectable()
export class VinculosService {
  constructor(@Inject(BANCO) private readonly banco: Conexao) {}

  /** Empresas em que o usuário é membro ativo, com o papel em cada uma. */
  async vinculosDo(usuarioId: string): Promise<Vinculo[]> {
    const linhas = await this.banco.cliente<{ tenant_id: string; papel: PapelMembro }[]>`
      SELECT tenant_id, papel FROM app_vinculos_do_usuario(${usuarioId})`
    return linhas.map((l) => ({ tenantId: l.tenant_id, papel: l.papel }))
  }

  /** Todas as empresas das contas que o usuário administra (dono ou administrador): o consolidado. */
  async empresasDaContaDo(usuarioId: string): Promise<string[]> {
    const linhas = await this.banco.cliente<{ tenant_id: string }[]>`
      SELECT tenant_id FROM app_empresas_da_conta_do_usuario(${usuarioId})`
    return linhas.map((l) => l.tenant_id)
  }

  /** O usuário é dono ou administrador de alguma conta? (`conta_administradores` não tem RLS.) */
  async administraConta(usuarioId: string): Promise<boolean> {
    const linhas = await this.banco.cliente`
      SELECT 1 FROM conta_administradores
      WHERE usuario_id = ${usuarioId} AND papel IN ('dono', 'administrador') LIMIT 1`
    return linhas.length > 0
  }
}
