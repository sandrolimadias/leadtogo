/** Tira a máscara do CPF (só dígitos). */
export const normalizarCpf = (valor: string): string => valor.replace(/\D/g, '')

function digito(base: string, pesoInicial: number): number {
  let soma = 0
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i)
  const resto = (soma * 10) % 11
  return resto === 10 ? 0 : resto
}

/** CPF válido (11 dígitos e os dois verificadores), com ou sem máscara. */
export function cpfValido(valor: string): boolean {
  const cpf = normalizarCpf(valor)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const dv1 = digito(cpf.slice(0, 9), 10)
  const dv2 = digito(cpf.slice(0, 10), 11)
  return cpf.endsWith(`${dv1}${dv2}`)
}

/** 000.000.000-00 */
export function formatarCpf(valor: string): string {
  const c = normalizarCpf(valor)
  return c.length === 11
    ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
    : valor
}

/** 00.000.000/0000-00 (aceita o CNPJ alfanumérico) */
export function formatarCnpj(valor: string): string {
  const c = valor.replace(/[.\-/\s]/g, '').toUpperCase()
  return /^[0-9A-Z]{12}[0-9]{2}$/.test(c)
    ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
    : valor
}
