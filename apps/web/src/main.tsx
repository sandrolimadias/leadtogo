import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/globals.css'
import { App } from './App'
import { iniciarObservabilidade } from './observabilidade/erros'
import { LimiteDeErros } from './observabilidade/limite-de-erros'
import { registrarServiceWorker } from './pwa/registro'

iniciarObservabilidade({
  dsn: import.meta.env['VITE_SENTRY_DSN'] as string | undefined,
  release: (import.meta.env['VITE_APP_VERSION'] as string | undefined) ?? 'dev',
  environment: import.meta.env.PROD ? 'production' : 'development',
})

registrarServiceWorker()

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado')

createRoot(raiz).render(
  <StrictMode>
    <LimiteDeErros>
      <App />
    </LimiteDeErros>
  </StrictMode>,
)
