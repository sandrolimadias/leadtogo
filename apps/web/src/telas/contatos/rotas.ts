/** Para onde "Abrir contato" leva. Muda para a ficha quando ela existir. */
export const rotaDoContato = (id: string) =>
  ({ to: '/contatos/$contatoId/editar', params: { contatoId: id } }) as const
