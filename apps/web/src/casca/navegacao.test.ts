import type { PapelMembro } from '@leadtogo/shared'
import { describe, expect, it } from 'vitest'

import { TELAS, TELAS_DA_BARRA_INFERIOR, telaVisivel, telasDoMais } from './navegacao'

interface Pessoa {
  administradorDeConta: boolean
  papelNaEmpresaAtiva: PapelMembro | null
}
const admin: Pessoa = { administradorDeConta: false, papelNaEmpresaAtiva: 'admin' }
const vendedor: Pessoa = { administradorDeConta: false, papelNaEmpresaAtiva: 'vendedor' }
const donoDaConta: Pessoa = { administradorDeConta: true, papelNaEmpresaAtiva: 'vendedor' }

describe('telasDoMais (folha "Mais" do celular)', () => {
  it('é a lista de TELAS sem a barra inferior, só as visíveis, na ordem do menu lateral', () => {
    for (const pessoa of [admin, vendedor, donoDaConta]) {
      const esperado = TELAS.filter(
        (t) => !TELAS_DA_BARRA_INFERIOR.includes(t.caminho) && telaVisivel(t, pessoa),
      ).map((t) => t.caminho)
      expect(telasDoMais(pessoa).map((t) => t.caminho)).toEqual(esperado)
    }
  })

  it('nenhuma tela da barra aparece e toda tela visível está na barra ou no "Mais"', () => {
    const noMais = telasDoMais(donoDaConta).map((t) => t.caminho)
    for (const caminho of TELAS_DA_BARRA_INFERIOR) expect(noMais).not.toContain(caminho)
    for (const t of TELAS.filter((x) => telaVisivel(x, donoDaConta))) {
      expect(TELAS_DA_BARRA_INFERIOR.includes(t.caminho) || noMais.includes(t.caminho)).toBe(true)
    }
  })

  it('respeita telaVisivel por papel', () => {
    const caminhos = (p: Pessoa) => telasDoMais(p).map((t) => t.caminho)
    expect(caminhos(vendedor)).not.toContain('/configuracoes')
    expect(caminhos(vendedor)).not.toContain('/consolidado')
    expect(caminhos(admin)).toContain('/configuracoes')
    expect(caminhos(admin)).not.toContain('/consolidado')
    expect(caminhos(donoDaConta)).toContain('/consolidado')
    expect(caminhos(vendedor)).toContain('/mapa')
  })
})
