import { formatarTelefone } from '@leadtogo/shared'

/** "+5527998472210" → "(27) 99847-2210"; número de fora do Brasil volta como está. */
export const telefoneParaTela = (e164: string): string =>
  e164.startsWith('+55') ? formatarTelefone(e164.slice(3)) : e164
