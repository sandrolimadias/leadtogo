import type { CampoComValores } from '@leadtogo/shared'

// Importação de oportunidades: as escolhas do mapeamento de valores (Fase, Motivo, Origem e Solução).

export const PULAR = 'pular'

/** Escolhas da pessoa por campo: valor da coluna (chave) → id do cadastro | `PULAR` | '' (não escolheu). */
export type EscolhasDeValores = Partial<Record<CampoComValores, Record<string, string>>>

/** O que mandar no PATCH: só o que a pessoa escolheu (o servidor já casa os valores de mesmo nome). */
export function valoresParaEnviar(
  escolhas: EscolhasDeValores,
): Partial<Record<CampoComValores, Record<string, string | null>>> {
  const saida: Partial<Record<CampoComValores, Record<string, string | null>>> = {}
  for (const [campo, doCampo] of Object.entries(escolhas) as [
    CampoComValores,
    Record<string, string>,
  ][]) {
    const valores = Object.fromEntries(
      Object.entries(doCampo)
        .filter(([, v]) => v !== '')
        .map(([chave, v]) => [chave, v === PULAR ? null : v]),
    )
    if (Object.keys(valores).length > 0) saida[campo] = valores
  }
  return saida
}
