import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'
import type { ServicosDeAcesso } from '@/auth/tipos'
import { relatoriosLocais } from '@/lib/offline/visitas'

export interface Pendente {
  id: string
  empresaNome: string
  quando: string
  /** No aparelho, ainda sem subir (sem sinal) */
  noAparelho: boolean
  erro?: string | undefined
}

export const chaveDosPendentes = ['visitas', 'pendentes'] as const

/** Os relatórios por fazer: os rascunhos do servidor e os que estão no aparelho (sem repetir). */
async function lerPendentes(servicos: ServicosDeAcesso): Promise<Pendente[]> {
  const locais = await relatoriosLocais().catch(() => [])
  const r = await servicos.visitas.campo.listar({ so: 'pendentes' })
  const doServidor = r.ok ? r.dados : []
  const porId = new Map<string, Pendente>()
  for (const p of doServidor) {
    porId.set(p.id, {
      id: p.id,
      empresaNome: p.empresa.nome,
      quando: p.checkinEm ?? p.criadoEm,
      noAparelho: false,
    })
  }
  for (const l of locais) {
    porId.set(l.id, {
      id: l.id,
      empresaNome: l.empresaNome,
      quando: l.dados.checkin?.em ?? l.atualizadoEm,
      noAparelho: true,
      erro: l.erro,
    })
  }
  return [...porId.values()].sort((a, b) => b.quando.localeCompare(a.quando))
}

export function usePendentes() {
  const servicos = useServicos()
  return useQuery({
    queryKey: chaveDosPendentes,
    retry: false,
    networkMode: 'always',
    queryFn: () => lerPendentes(servicos),
  })
}
