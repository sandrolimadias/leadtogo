import type { Conexao } from '@leadtogo/db'
import type { PoliticaDoisFatores } from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { BANCO } from '../infra/infra.module.js'
import type { PapelMembro, Vinculo } from './requisicao.js'

/** Descobre, sem tenant ativo, as empresas do usuário (funções SECURITY DEFINER da migração 0006). */
@Injectable()
export class VinculosService {
  constructor(@Inject(BANCO) private readonly banco: Conexao) {}

  /** Empresas em que o usuário é membro ativo, com o papel, o perfil e a regra de 2FA de cada uma. */
  async vinculosDo(usuarioId: string): Promise<Vinculo[]> {
    return vinculosComPerfil(this.banco, usuarioId)
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

/** Os vínculos do usuário pela função SECURITY DEFINER da migração 0027 (com o perfil e o 2FA dele). */
export async function vinculosComPerfil(banco: Conexao, usuarioId: string): Promise<Vinculo[]> {
  const linhas = await banco.cliente<
    {
      tenant_id: string
      papel: PapelMembro
      dois_fatores_exigido: PoliticaDoisFatores
      perfil_exige_2fa: boolean | null
    }[]
  >`SELECT tenant_id, papel, dois_fatores_exigido, perfil_exige_2fa FROM app_vinculos_com_perfil(${usuarioId})`
  return linhas.map((l) => ({
    tenantId: l.tenant_id,
    papel: l.papel,
    doisFatoresExigido: l.dois_fatores_exigido,
    perfilExige2fa: l.perfil_exige_2fa,
  }))
}
