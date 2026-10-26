/** Cores das tags do design system e utilidades de nome (avatar). */

export const CORES_DE_TAG = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
] as const
export type CorDeTag = (typeof CORES_DE_TAG)[number]

/** Nome da cor em português (o seletor de cor diz a cor por escrito, não só pelo desenho). */
export const ROTULO_DA_COR: Record<CorDeTag, string> = {
  gray: 'Cinza',
  red: 'Vermelho',
  orange: 'Laranja',
  amber: 'Âmbar',
  green: 'Verde',
  teal: 'Azul-petróleo',
  blue: 'Azul',
  indigo: 'Índigo',
  purple: 'Roxo',
  pink: 'Rosa',
}

/** Classes completas (o Tailwind só gera o que aparece escrito por inteiro) */
export const classeDaCor: Record<CorDeTag, string> = {
  gray: 'bg-tag-gray-bg text-tag-gray-fg',
  red: 'bg-tag-red-bg text-tag-red-fg',
  orange: 'bg-tag-orange-bg text-tag-orange-fg',
  amber: 'bg-tag-amber-bg text-tag-amber-fg',
  green: 'bg-tag-green-bg text-tag-green-fg',
  teal: 'bg-tag-teal-bg text-tag-teal-fg',
  blue: 'bg-tag-blue-bg text-tag-blue-fg',
  indigo: 'bg-tag-indigo-bg text-tag-indigo-fg',
  purple: 'bg-tag-purple-bg text-tag-purple-fg',
  pink: 'bg-tag-pink-bg text-tag-pink-fg',
}

const CORES_DE_AVATAR: CorDeTag[] = [
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'orange',
  'amber',
  'green',
]

/** A mesma pessoa tem sempre a mesma cor (hash do nome). */
export function corDoNome(nome: string): CorDeTag {
  let soma = 0
  for (const c of nome) soma = (soma * 31 + c.charCodeAt(0)) >>> 0
  return CORES_DE_AVATAR[soma % CORES_DE_AVATAR.length] ?? 'teal'
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}
