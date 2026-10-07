import { createContext, type ReactNode, useContext } from 'react'

import { servicosReais } from './servicos'
import type { ServicosDeAcesso } from './tipos'

const ServicosContext = createContext<ServicosDeAcesso>(servicosReais)

/** Entrega os serviços de acesso às telas. Os testes passam uma implementação de mentira. */
export function ServicosProvider({
  servicos,
  children,
}: {
  servicos: ServicosDeAcesso
  children: ReactNode
}) {
  return <ServicosContext value={servicos}>{children}</ServicosContext>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook ao lado do provedor, como em qualquer contexto
export const useServicos = () => useContext(ServicosContext)
