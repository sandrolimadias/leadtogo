import type { Conexao } from '@leadtogo/db'
import { sql } from '@leadtogo/db'

/**
 * Empresa ativa de uma sessão NOVA (login): a última que a pessoa usou, se ainda for dela e estiver em
 * teste ou ativa; senão, a única empresa utilizável que ela tem; senão (várias e nenhuma usada antes, ou
 * nenhuma), nenhuma: o `GET /v1/me` indica `precisaEscolherEmpresa` e o front mostra o seletor.
 */
export async function escolherEmpresaAtiva(
  banco: Conexao,
  usuarioId: string,
): Promise<string | null> {
  const vinculos = await banco.cliente<{ tenant_id: string }[]>`
    SELECT tenant_id FROM app_vinculos_com_perfil(${usuarioId})`
  if (vinculos.length === 0) return null
  const ids = vinculos.map((v) => v.tenant_id)

  // `tenants` tem RLS: lê-se com `app.tenant_ids` = as empresas em que a pessoa já é membro (como no /me)
  const linhas = await banco.db.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_ids', ${`{${ids.join(',')}}`}, true)`)
      return tx.execute<{ id: string }>(
        sql`SELECT id FROM tenants WHERE situacao IN ('teste', 'ativo')`,
      )
    },
    { accessMode: 'read only' },
  )
  const utilizaveis = new Set([...linhas].map((l) => l.id))
  if (utilizaveis.size === 0) return null

  const [usuario] = await banco.cliente<{ ultima_empresa_id: string | null }[]>`
    SELECT ultima_empresa_id FROM auth."user" WHERE id = ${usuarioId}`
  const ultima = usuario?.ultima_empresa_id
  if (ultima && utilizaveis.has(ultima)) return ultima
  if (utilizaveis.size === 1) return [...utilizaveis][0] ?? null
  return null
}
