import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

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
