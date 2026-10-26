import { createContext, type ReactNode, useContext } from 'react'

import { servicosReais } from './reais'
import type { ServicosDoPortal } from './tipos'

const ServicosContext = createContext<ServicosDoPortal>(servicosReais)

/** Entrega os serviços às telas. Os testes passam uma implementação de mentira. */
export function ServicosProvider({
  servicos,
  children,
}: {
  servicos: ServicosDoPortal
  children: ReactNode
}) {
  return <ServicosContext value={servicos}>{children}</ServicosContext>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook ao lado do provedor, como em qualquer contexto
export const useServicos = () => useContext(ServicosContext)
