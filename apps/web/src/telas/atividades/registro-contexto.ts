import type { Atividade } from '@leadtogo/api-client'
import { createContext, useContext } from 'react'

/** O que o formulário já traz preenchido ao abrir. */
export interface InicioDoRegistro {
  /** A empresa já escolhida ("Nova atividade" da ficha, ou "Registrar e agendar próxima") */
  empresa?: { id: string; nome: string }
  contatoId?: string
  tipoId?: string
  /** Padrão Realizada; "agendar próxima" abre em Pendente */
  situacao?: 'realizada' | 'pendente'
  /** Editar uma atividade que já existe (o formulário vira "Editar atividade") */
  atividade?: Atividade
}

interface Controle {
  abrir: (inicio?: InicioDoRegistro) => void
}
export const Contexto = createContext<Controle | null>(null)

/** Abre o formulário "Registrar atividade" de qualquer tela (barra do topo, "+" do celular, fichas, listas). */
export function useRegistrarAtividade(): Controle {
  const c = useContext(Contexto)
  if (!c) throw new Error('useRegistrarAtividade fora do RegistrarAtividadeProvider')
  return c
}
