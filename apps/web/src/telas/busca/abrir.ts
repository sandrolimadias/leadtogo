import type { TipoDaBuscaGlobal } from '@leadtogo/shared'
import { useNavigate } from '@tanstack/react-router'
import { Building2, Handshake, type LucideIcon, Users } from 'lucide-react'

import type { ItemAchado } from './consultas'

export const ICONE_DO_TIPO: Record<TipoDaBuscaGlobal, LucideIcon> = {
  empresas: Building2,
  contatos: Users,
  oportunidades: Handshake,
}

/** Abre a ficha do item achado. */
export function useAbrirItem() {
  const navegar = useNavigate()
  return (item: ItemAchado) => {
    if (item.tipo === 'empresas') {
      void navegar({ to: '/empresas/$empresaId', params: { empresaId: item.id } })
    } else if (item.tipo === 'contatos') {
      void navegar({ to: '/contatos/$contatoId', params: { contatoId: item.id } })
    } else {
      void navegar({ to: '/oportunidades/$oportunidadeId', params: { oportunidadeId: item.id } })
    }
  }
}
