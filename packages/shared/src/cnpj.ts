// CNPJ alfanumérico (Receita Federal, a partir de julho/2026): as 12 primeiras posições aceitam
// letras e números; os dois dígitos verificadores continuam numéricos. O valor de cada caractere
// é o código ASCII menos 48 ('0'..'9' = 0..9, 'A' = 17, 'B' = 18...). Ver docs/modelagem_banco.md, seção 12.

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

/** Tira a máscara (`.`, `/`, `-`, espaços) e põe em maiúsculas. Nunca remove letras. */
export function normalizarCnpj(valor: string): string {
  return valor.replace(/[.\-/\s]/g, '').toUpperCase()
}

function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0
  for (let i = 0; i < pesos.length; i++) soma += (base.charCodeAt(i) - 48) * (pesos[i] ?? 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** CNPJ (numérico ou alfanumérico) válido, com ou sem máscara. */
export function cnpjValido(valor: string): boolean {
  const cnpj = normalizarCnpj(valor)
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false
  if (/^(.)\1{13}$/.test(cnpj)) return false // 00000000000000, AAAAAAAAAAAAAA...
  const dv1 = digitoVerificador(cnpj.slice(0, 12), PESOS_DV1)
  const dv2 = digitoVerificador(cnpj.slice(0, 12) + String(dv1), PESOS_DV2)
  return cnpj.endsWith(`${dv1}${dv2}`)
}

/** Completa os 12 primeiros caracteres (números e letras) com os dois dígitos verificadores. */
export function completarCnpj(base: string): string {
  const doze = normalizarCnpj(base)
  if (!/^[0-9A-Z]{12}$/.test(doze))
    throw new Error('A base do CNPJ deve ter 12 caracteres (0-9 e A-Z)')
  const dv1 = digitoVerificador(doze, PESOS_DV1)
  const dv2 = digitoVerificador(doze + String(dv1), PESOS_DV2)
  return `${doze}${dv1}${dv2}`
}
