/** Os ids na ordem nova, depois de mover o item `indice` uma posição. */
export function moverNaLista(ids: string[], indice: number, deslocamento: -1 | 1): string[] {
  const destino = indice + deslocamento
  if (destino < 0 || destino >= ids.length) return ids
  const novo = [...ids]
  const [item] = novo.splice(indice, 1)
  novo.splice(destino, 0, item as string)
  return novo
}
