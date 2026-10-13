/** Para onde "Abrir contato" leva: a ficha. */
export const rotaDoContato = (id: string) =>
  ({ to: '/contatos/$contatoId', params: { contatoId: id } }) as const

/** A edição da pessoa (telefones, e-mails, papel, aniversário e consentimento). */
export const rotaDeEdicaoDoContato = (id: string) =>
  ({ to: '/contatos/$contatoId/editar', params: { contatoId: id } }) as const
