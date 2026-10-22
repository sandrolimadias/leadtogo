import { usePermissoes } from '@/auth/permissoes'

/** O que a pessoa pode fazer na geolocalização (pelo perfil de acesso na empresa ativa). */
export function useQuemGeocodifica(): {
  /** Roda lotes e vê o resumo: `geolocalizacao.lotes` */
  lotes: boolean
  /** Cria, altera e exclui regiões: `geolocalizacao.regioes` */
  regioes: boolean
  carregando: boolean
} {
  const { pode, carregando } = usePermissoes()
  return {
    lotes: pode('geolocalizacao.lotes'),
    regioes: pode('geolocalizacao.regioes'),
    carregando,
  }
}
