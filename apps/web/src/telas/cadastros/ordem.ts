/** Os ids na ordem nova, depois de mover o item `indice` uma posição. */
export function moverNaLista(ids: string[], indice: number, deslocamento: -1 | 1): string[] {
  const destino = indice + deslocamento
  if (destino < 0 || destino >= ids.length) return ids
  const novo = [...ids]
  const [item] = novo.splice(indice, 1)
  novo.splice(destino, 0, item as string)
  return novo
}

/**
 * A ordem nova de TODOS os grupos (a API pede a lista completa) quando um bloco da aba sobe ou desce:
 * troca de lugar com o vizinho da mesma aba, e os grupos da outra aba ficam onde estão.
 */
export function moverGrupoNaAba(todos: string[], daAba: string[], indice: number, d: -1 | 1) {
  const a = daAba[indice]
  const b = daAba[indice + d]
  if (a === undefined || b === undefined) return todos
  return todos.map((id) => (id === a ? b : id === b ? a : id))
}
