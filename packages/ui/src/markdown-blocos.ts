// Blocos do Markdown restrito das publicações (ver markdown.tsx)

export type Bloco =
  | { tipo: 'paragrafo'; linhas: string[] }
  | { tipo: 'lista'; ordenada: boolean; itens: string[] }
  | { tipo: 'subtitulo'; texto: string }

const ITEM_NAO_ORDENADO = /^\s*[-*•]\s+(.*)$/
const ITEM_ORDENADO = /^\s*\d{1,3}[.)]\s+(.*)$/
const SUBTITULO = /^#{1,3}\s+(.*)$/

/** Separa o texto em blocos: parágrafos (linha em branco separa), listas e subtítulos. */
export function blocosDoMarkdown(texto: string): Bloco[] {
  const blocos: Bloco[] = []
  let paragrafo: string[] = []
  const fecharParagrafo = () => {
    if (paragrafo.length > 0) blocos.push({ tipo: 'paragrafo', linhas: paragrafo })
    paragrafo = []
  }
  for (const linha of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const item = ITEM_NAO_ORDENADO.exec(linha) ?? ITEM_ORDENADO.exec(linha)
    const ordenada = ITEM_ORDENADO.test(linha) && !ITEM_NAO_ORDENADO.test(linha)
    const subtitulo = SUBTITULO.exec(linha)
    if (linha.trim() === '') {
      fecharParagrafo()
    } else if (subtitulo) {
      fecharParagrafo()
      blocos.push({ tipo: 'subtitulo', texto: subtitulo[1] ?? '' })
    } else if (item) {
      fecharParagrafo()
      const ultimo = blocos[blocos.length - 1]
      if (ultimo?.tipo === 'lista' && ultimo.ordenada === ordenada) ultimo.itens.push(item[1] ?? '')
      else blocos.push({ tipo: 'lista', ordenada, itens: [item[1] ?? ''] })
    } else {
      paragrafo.push(linha.trim())
    }
  }
  fecharParagrafo()
  return blocos
}
