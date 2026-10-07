import { X } from 'lucide-react'
import { Dialog as DialogoDoRadix } from 'radix-ui'
import { type ReactNode, useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/cn'

import { IconButton } from './button'

/**
 * O Radix só devolve o foco sozinho quando o diálogo tem um `Trigger` dele; aqui o estado é controlado
 * por quem usa. Guardamos o elemento focado ANTES de abrir e o refocamos ao fechar (acessibilidade).
 */
function useDevolverFoco(aberto: boolean) {
  const anterior = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (aberto)
      anterior.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [aberto])
  return (evento: Event) => {
    evento.preventDefault()
    anterior.current?.focus()
  }
}

interface Comuns {
  open: boolean
  onOpenChange: (aberto: boolean) => void
  title: string
  description?: string
  /** Botões do rodapé */
  footer?: ReactNode
  children?: ReactNode
}

/** Cabeçalho, corpo e rodapé do diálogo. Com `radix`, título, descrição e fechar são os do Radix. */
function CorpoDoDialogo({
  title,
  description,
  footer,
  children,
  radix,
  onClose,
}: Omit<Comuns, 'open' | 'onOpenChange'> & { radix?: boolean; onClose?: () => void }) {
  return (
    <>
      <div className="flex items-start gap-3 px-6 pt-5 pb-2">
        <div className="min-w-0 flex-1">
          {radix ? (
            <DialogoDoRadix.Title className="m-0 text-lg leading-6 font-semibold">
              {title}
            </DialogoDoRadix.Title>
          ) : (
            <h2 className="m-0 text-lg leading-6 font-semibold">{title}</h2>
          )}
          {description ? (
            radix ? (
              <DialogoDoRadix.Description className="mt-1 mb-0 text-sm leading-5 text-ink-muted">
                {description}
              </DialogoDoRadix.Description>
            ) : (
              <p className="mt-1 mb-0 text-sm leading-5 text-ink-muted">{description}</p>
            )
          ) : null}
        </div>
        {radix ? (
          <DialogoDoRadix.Close asChild>
            <IconButton icon={X} label="Fechar" />
          </DialogoDoRadix.Close>
        ) : (
          <IconButton icon={X} label="Fechar" onClick={onClose} />
        )}
      </div>
      {children ? (
        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-3">{children}</div>
      ) : null}
      {footer ? (
        <div className="mt-2 flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>
      ) : null}
    </>
  )
}

const classeDoPainelDoDialogo = 'flex flex-col rounded-lg bg-surface text-ink shadow-lg max-w-full'

/** O diálogo desenhado direto na página, sem Radix nem fundo (catálogo e documentação). */
export function PainelDoDialogo({
  width = 480,
  onClose,
  ...conteudo
}: Omit<Comuns, 'open' | 'onOpenChange'> & { width?: number; onClose?: () => void }) {
  return (
    <div
      role="dialog"
      aria-label={conteudo.title}
      style={{ width }}
      className={classeDoPainelDoDialogo}
    >
      <CorpoDoDialogo {...conteudo} onClose={onClose} />
    </div>
  )
}

/** Diálogo centralizado (desktop). Prende o foco, fecha com Esc e devolve o foco a quem abriu. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  width = 480,
}: Comuns & { width?: number }) {
  const aoFechar = useDevolverFoco(open)
  return (
    <DialogoDoRadix.Root open={open} onOpenChange={onOpenChange}>
      <DialogoDoRadix.Portal>
        <DialogoDoRadix.Overlay className="fixed inset-0 z-[1300] bg-overlay" />
        <DialogoDoRadix.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          onCloseAutoFocus={aoFechar}
          style={{ width }}
          className={cn(
            classeDoPainelDoDialogo,
            'fixed top-1/2 left-1/2 z-[1400] max-h-[calc(100dvh-48px)] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2',
          )}
        >
          <CorpoDoDialogo
            title={title}
            {...(description ? { description } : {})}
            {...(footer ? { footer } : {})}
            radix
          >
            {children}
          </CorpoDoDialogo>
        </DialogoDoRadix.Content>
      </DialogoDoRadix.Portal>
    </DialogoDoRadix.Root>
  )
}

/**
 * Folha que sobe do rodapé (celular): raio de 16 px no topo, alça de 40×4 px, até 92% da altura.
 * Mesmo comportamento de foco e teclado do Dialog.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: Comuns & { className?: string }) {
  const aoFechar = useDevolverFoco(open)
  return (
    <DialogoDoRadix.Root open={open} onOpenChange={onOpenChange}>
      <DialogoDoRadix.Portal>
        <DialogoDoRadix.Overlay className="fixed inset-0 z-[1300] bg-overlay" />
        <DialogoDoRadix.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          onCloseAutoFocus={aoFechar}
          className={cn(
            'fixed inset-x-0 bottom-0 z-[1400] flex max-h-[92dvh] flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] text-ink shadow-lg',
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" />
          <div className="flex items-start gap-3 px-4 pt-3 pb-2">
            <div className="min-w-0 flex-1">
              <DialogoDoRadix.Title className="m-0 text-lg leading-6 font-semibold">
                {title}
              </DialogoDoRadix.Title>
              {description ? (
                <DialogoDoRadix.Description className="mt-1 mb-0 text-sm leading-5 text-ink-muted">
                  {description}
                </DialogoDoRadix.Description>
              ) : null}
            </div>
            <DialogoDoRadix.Close asChild>
              <IconButton icon={X} label="Fechar" />
            </DialogoDoRadix.Close>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-3">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>
          ) : null}
        </DialogoDoRadix.Content>
      </DialogoDoRadix.Portal>
    </DialogoDoRadix.Root>
  )
}
