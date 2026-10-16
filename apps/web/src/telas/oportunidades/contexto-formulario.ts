import type { Oportunidade } from '@leadtogo/api-client'
import { createContext, useContext } from 'react'

/** O que o formulário "Nova oportunidade" já traz preenchido ao abrir. */
export interface InicioDoFormularioDeOportunidade {
  /** A empresa já escolhida ("Nova oportunidade" da ficha da empresa) */
  empresa?: { id: string; nome: string }
  /** Funil e fase já escolhidos (ex.: "+" da coluna do Kanban) */
  funilId?: string
  faseId?: string
  /** Editar uma oportunidade que já existe */
  oportunidade?: Oportunidade
}

interface Controle {
  abrir: (inicio?: InicioDoFormularioDeOportunidade) => void
}
export const ContextoDoFormularioDeOportunidade = createContext<Controle | null>(null)

/** Abre o formulário de oportunidade de qualquer tela (Kanban, lista, fichas). */
export function useFormularioDeOportunidade(): Controle {
  const c = useContext(ContextoDoFormularioDeOportunidade)
  if (!c) throw new Error('useFormularioDeOportunidade fora do FormularioDeOportunidadeProvider')
  return c
}
