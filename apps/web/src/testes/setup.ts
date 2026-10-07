import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// findBy/waitFor esperam até 5 s (o padrão é 1 s): com o turbo rodando tudo junto a máquina fica lenta
configure({ asyncUtilTimeout: 5000 })

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
