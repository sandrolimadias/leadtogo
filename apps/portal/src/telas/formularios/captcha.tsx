import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opcoes: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback': () => void
        },
      ) => string
      remove: (id: string) => void
    }
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function carregarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  const existente = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`)
  return new Promise((resolver, rejeitar) => {
    const s = existente ?? document.createElement('script')
    s.addEventListener('load', () => resolver(), { once: true })
    s.addEventListener('error', () => rejeitar(new Error('captcha indisponível')), { once: true })
    if (!existente) {
      s.src = SCRIPT
      s.async = true
      document.head.appendChild(s)
    }
  })
}

/** O captcha do Cloudflare Turnstile (só quando o formulário pede e a chave está configurada). */
export function Captcha({
  chave,
  aoResolver,
}: {
  chave: string
  aoResolver: (token: string | null) => void
}) {
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id: string | null = null
    let ativo = true
    void carregarScript()
      .then(() => {
        if (!ativo || !caixa.current || !window.turnstile) return
        id = window.turnstile.render(caixa.current, {
          sitekey: chave,
          callback: (token) => aoResolver(token),
          'expired-callback': () => aoResolver(null),
        })
      })
      .catch(() => aoResolver(null))
    return () => {
      ativo = false
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [chave, aoResolver])
  return <div ref={caixa} aria-label="Verificação contra robôs" />
}
