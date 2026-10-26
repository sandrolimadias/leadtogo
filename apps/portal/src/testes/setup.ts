import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

import { aguardarRoteadores } from './roteadores'

// Antes de desmontar, cada teste espera a navegação pendente do roteador terminar
afterEach(async () => {
  await aguardarRoteadores()
  cleanup()
})

// O app inteiro (roteador, guardas, telas) monta a cada teste; com a máquina ocupada (CI de 2 vCPUs,
// vários testes em paralelo) o 1 s padrão de `findBy*`/`waitFor` estoura sem haver erro nenhum.
// Prazo único de 15 s (as esperas terminam assim que o resultado chega); cabe no testTimeout de 20 s do vite.config.ts.
configure({ asyncUtilTimeout: 15_000 })

// jsdom não tem estas APIs; os componentes (Radix) as usam
globalThis.ResizeObserver ??= class {
  observe = () => {}
  unobserve = () => {}
  disconnect = () => {}
}
const proto = Element.prototype as unknown as Record<string, unknown>
proto['scrollIntoView'] ??= () => {}
proto['hasPointerCapture'] ??= () => false
proto['setPointerCapture'] ??= () => {}
proto['releasePointerCapture'] ??= () => {}
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})
window.scrollTo = () => {}
