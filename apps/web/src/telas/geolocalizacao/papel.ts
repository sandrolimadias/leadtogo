import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'

/** O que a pessoa pode fazer na geolocalização (por papel na empresa ativa). */
export function useQuemGeocodifica(): {
  /** Roda lotes e vê o resumo: administrador e gestor */
  lotes: boolean
  /** Cria, altera e exclui regiões: só o administrador */
  regioes: boolean
  carregando: boolean
} {
  const servicos = useServicos()
  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me })
  const papel = me.data?.empresas.find((e) => e.ativa)?.papel
  return {
    lotes: papel === 'admin' || papel === 'gestor',
    regioes: papel === 'admin',
    carregando: me.isPending,
  }
}
