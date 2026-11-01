import type { DefinicaoDeFormulario, Respostas } from '@leadtogo/shared'

/** Nome, e-mail, telefone e CNPJ da inscrição, achados pelos tipos dos campos do formulário. */
export function dadosDaPessoa(
  definicao: DefinicaoDeFormulario,
  valores: Respostas,
): { nome: string | null; email: string | null; telefone: string | null; cnpj: string | null } {
  const primeiro = (filtro: (c: DefinicaoDeFormulario['campos'][number]) => boolean) => {
    const c = definicao.campos.find((x) => filtro(x) && typeof valores[x.id] === 'string')
    return c ? (valores[c.id] as string) : null
  }
  return {
    nome:
      primeiro((c) => c.preenchimento?.fonte === 'contato.nome') ??
      primeiro((c) => c.tipo === 'texto' && /nome/.test(c.id)),
    email: primeiro((c) => c.tipo === 'email'),
    telefone: primeiro((c) => c.tipo === 'telefone'),
    cnpj: primeiro((c) => c.tipo === 'cnpj'),
  }
}
