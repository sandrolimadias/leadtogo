import { PERMISSOES_PADRAO } from '@leadtogo/shared'
import { describe, expect, it } from 'vitest'

import type { Permissoes } from '@/auth/permissoes'

import { TELAS, TELAS_DA_BARRA_INFERIOR, telaVisivel, telasDoMais } from './navegacao'

interface Pessoa {
  administradorDeConta: boolean
  permissoes: Permissoes
}
const admin: Pessoa = { administradorDeConta: false, permissoes: PERMISSOES_PADRAO.admin }
const gestor: Pessoa = { administradorDeConta: false, permissoes: PERMISSOES_PADRAO.gestor }
const vendedor: Pessoa = { administradorDeConta: false, permissoes: PERMISSOES_PADRAO.vendedor }
const donoDaConta: Pessoa = { administradorDeConta: true, permissoes: PERMISSOES_PADRAO.vendedor }

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

  it('respeita telaVisivel pelas permissões do perfil', () => {
    const caminhos = (p: Pessoa) => telasDoMais(p).map((t) => t.caminho)
    expect(caminhos(vendedor)).not.toContain('/configuracoes')
    expect(caminhos(vendedor)).not.toContain('/consolidado')
    expect(caminhos(admin)).toContain('/configuracoes')
    expect(caminhos(admin)).not.toContain('/consolidado')
    expect(caminhos(donoDaConta)).toContain('/consolidado')
    expect(caminhos(vendedor)).toContain('/mapa')
    // o Gestor padrão não tem nenhuma permissão de configuração: não vê o menu (como antes)
    expect(caminhos(gestor)).not.toContain('/configuracoes')
    // só com uma permissão de configuração (ex.: gerir os cadastros), o menu aparece
    expect(
      caminhos({ administradorDeConta: false, permissoes: { 'cadastros.gerir': true } }),
    ).toContain('/configuracoes')
    // sem ver contatos, o menu de Contatos some
    const semContatos = { ...vendedor, permissoes: { ...vendedor.permissoes } }
    delete semContatos.permissoes['contatos.ver']
    expect(caminhos(semContatos)).not.toContain('/contatos')
  })
})
