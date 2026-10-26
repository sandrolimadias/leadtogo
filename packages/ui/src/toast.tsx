import type { ReactNode } from 'react'
import { toast as sonner } from 'sonner'

import { Toast, type TomDoToast } from './feedback'

interface Opcoes {
  description?: string
  /** Ação do aviso, ex.: `<Button size="sm" variant="ghost">Agendar próxima</Button>` */
  action?: ReactNode
  /** Em milissegundos (padrão do <Toaster />) */
  duration?: number
}

function mostrar(tom: TomDoToast, titulo: string, opcoes: Opcoes = {}) {
  return sonner.custom(
    (id) => (
      <Toast
        tone={tom}
        title={titulo}
        {...(opcoes.description ? { description: opcoes.description } : {})}
        {...(opcoes.action ? { action: opcoes.action } : {})}
        onClose={() => sonner.dismiss(id)}
      />
    ),
    opcoes.duration ? { duration: opcoes.duration } : {},
  )
}

/** Avisos temporários: `toast.success('Empresa ativa trocada')`. O visual é o `Toast` do design system. */
export const toast = {
  success: (titulo: string, opcoes?: Opcoes) => mostrar('success', titulo, opcoes),
  error: (titulo: string, opcoes?: Opcoes) => mostrar('danger', titulo, opcoes),
  info: (titulo: string, opcoes?: Opcoes) => mostrar('info', titulo, opcoes),
  warning: (titulo: string, opcoes?: Opcoes) => mostrar('warning', titulo, opcoes),
  dismiss: (id?: string | number) => sonner.dismiss(id),
}
