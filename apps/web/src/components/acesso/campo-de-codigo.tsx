import { CircleAlert } from 'lucide-react'
import { type ClipboardEvent, type KeyboardEvent, useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/cn'

const DIGITOS = 6

/**
 * Código de 6 dígitos, um campo por dígito (Acesso.dc.html). O foco anda sozinho ao digitar; Backspace
 * volta; colar um código inteiro preenche todos; Enter envia o formulário em volta. O primeiro campo
 * recebe o foco ao abrir a tela.
 */
export function CampoDeCodigo({
  valor,
  onChange,
  erro,
  autoFocus = true,
}: {
  valor: string
  onChange: (codigo: string) => void
  erro?: string | undefined
  autoFocus?: boolean
}) {
  const campos = useRef<(HTMLInputElement | null)[]>([])
  // O valor mais recente, atualizado na hora: duas teclas seguidas, antes de o React redesenhar,
  // partem do valor certo (senão a segunda apagaria o dígito da primeira)
  const atual = useRef(valor)
  useLayoutEffect(() => {
    atual.current = valor
  }, [valor])
  const digitos = Array.from({ length: DIGITOS }, (_, i) => valor[i] ?? '')
  const focar = (i: number) => campos.current[Math.max(0, Math.min(DIGITOS - 1, i))]?.focus()

  const definir = (i: number, d: string) => {
    const novos = Array.from({ length: DIGITOS }, (_, k) => atual.current[k] ?? '')
    novos[i] = d
    atual.current = novos.join('').slice(0, DIGITOS)
    onChange(atual.current)
  }

  const aoTeclar = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Digitar o MESMO dígito que já está no campo não muda o valor: o React não dispara onChange e o
      // foco não andaria. Por isso o dígito é tratado aqui, na tecla (o onChange cobre colar e preencher
      // automático).
      e.preventDefault()
      definir(i, e.key)
      focar(i + 1)
    } else if (e.key === 'Backspace' && !digitos[i] && i > 0) {
      e.preventDefault()
      definir(i - 1, '')
      focar(i - 1)
    } else if (e.key === 'ArrowLeft') focar(i - 1)
    else if (e.key === 'ArrowRight') focar(i + 1)
  }

  const aoColar = (e: ClipboardEvent<HTMLInputElement>) => {
    const colado = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGITOS)
    if (!colado) return
    e.preventDefault()
    atual.current = colado
    onChange(colado)
    focar(colado.length)
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Código de verificação" className="grid grid-cols-6 gap-2">
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              campos.current[i] = el
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && i === 0}
            aria-label={`Dígito ${i + 1}`}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'codigo-erro' : undefined}
            onChange={(e) => {
              const digitado = e.target.value.replace(/\D/g, '')
              if (digitado.length > 2) {
                // o app de senhas ou o SMS preencheu o código inteiro de uma vez
                const todo = digitado.slice(0, DIGITOS)
                atual.current = todo
                onChange(todo)
                focar(todo.length)
                return
              }
              // sem maxLength: o campo já pode ter um dígito; vale o último digitado (a tecla nova)
              const novo = digitado.slice(-1)
              definir(i, novo)
              if (novo) focar(i + 1)
            }}
            onKeyDown={(e) => aoTeclar(i, e)}
            onPaste={aoColar}
            onFocus={(e) => e.target.select()}
            className={cn(
              'h-[52px] w-full rounded-sm border bg-surface text-center font-mono text-[22px] font-semibold text-ink hover:border-ink-muted focus-visible:border-brand focus-visible:outline-offset-0',
              erro ? 'border-danger' : 'border-border-strong',
            )}
          />
        ))}
      </div>
      {erro ? (
        <span
          id="codigo-erro"
          role="alert"
          className="flex items-center gap-1.5 text-[13px] font-semibold text-danger"
        >
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
          {erro}
        </span>
      ) : null}
    </div>
  )
}
