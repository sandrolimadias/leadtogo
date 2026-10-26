import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// Com a máquina ocupada o 1 s padrão de `findBy*`/`waitFor` estoura sem haver erro nenhum
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
