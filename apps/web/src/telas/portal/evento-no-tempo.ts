import type { Evento } from '@leadtogo/api-client'

/** O evento já começou (ou está para começar: o check-in abre 1 hora antes). */
export const jaComecou = (e: Pick<Evento, 'inicioEm'>, agora: number) =>
  new Date(e.inicioEm).getTime() <= agora
