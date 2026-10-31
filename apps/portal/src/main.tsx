import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/globals.css'
import { App } from './App'
import { registrarServiceWorker } from './casca/push'
import { aplicarTema, temaGuardado } from './casca/tema'

// O tema do aparelho vale antes do primeiro desenho (sem piscar); a preferência da pessoa chega depois
aplicarTema(temaGuardado())

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registrarServiceWorker()
