import type { AnyRouter } from '@tanstack/react-router'

/** Roteadores montados pelos testes (`renderizar`), para o fim de cada teste esperar a navegação pendente. */
const montados = new Set<AnyRouter>()

export const registrarRoteador = (roteador: AnyRouter) => {
  montados.add(roteador)
}

const ocupado = (r: AnyRouter): boolean => r.state.status === 'pending' || r.state.isLoading

/**
 * Espera cada roteador terminar a navegação ou transição em andamento (um redirecionamento ou
 * carregamento ainda pendente quando o teste acaba atualizaria o estado do React depois que o jsdom já
 * foi desmontado: "window is not defined"). Depois solta os roteadores.
 */
export async function aguardarRoteadores(prazoMs = 10_000) {
  const limite = Date.now() + prazoMs
  while ([...montados].some(ocupado) && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 10))
  }
  // Uma volta a mais para os efeitos que a última transição ainda agenda
  await new Promise((r) => setTimeout(r, 0))
  montados.clear()
}
