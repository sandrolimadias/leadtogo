import { describe, expect, it } from 'vitest'

import {
  CATALOGO_DE_PERMISSOES,
  CHAVES_DE_PERMISSAO,
  EXIGE_2FA_PADRAO,
  PERMISSOES_PADRAO,
  PERMISSOES_PROTEGIDAS_DO_ADMIN,
  VERSAO_DO_CATALOGO,
  alcanceMaisAmplo,
  exige2faDaPoliticaAntiga,
  linhasDasPermissoes,
  permissoesDasLinhas,
  validarPermissoes,
} from './permissoes.js'

describe('catálogo de permissões', () => {
  it('as chaves são modulo.acao, únicas e sem espaço', () => {
    expect(new Set(CHAVES_DE_PERMISSAO).size).toBe(CATALOGO_DE_PERMISSOES.length)
    for (const d of CATALOGO_DE_PERMISSOES) {
      expect(d.chave).toBe(`${d.modulo}.${d.acao}`)
      expect(d.chave).toMatch(/^[a-z]+\.[a-z_]+$/)
    }
  })

  it('não registra módulos que ainda não existem', () => {
    const modulos = new Set(CATALOGO_DE_PERMISSOES.map((d) => d.modulo))
    expect(modulos.has('chamados')).toBe(false)
    expect(modulos.has('portal')).toBe(false)
  })

  it('os perfis de sistema padrão são válidos', () => {
    for (const permissoes of Object.values(PERMISSOES_PADRAO)) {
      expect(validarPermissoes(permissoes)).toEqual([])
    }
  })

  it('o Admin tem tudo, com alcance todas, e as protegidas', () => {
    expect(Object.keys(PERMISSOES_PADRAO.admin).sort()).toEqual([...CHAVES_DE_PERMISSAO].sort())
    for (const c of PERMISSOES_PROTEGIDAS_DO_ADMIN) expect(PERMISSOES_PADRAO.admin[c]).toBe(true)
    expect(PERMISSOES_PADRAO.admin['empresas.ver']).toBe('todas')
  })

  it('o Gestor não configura nada, mas vê e edita tudo', () => {
    const g = PERMISSOES_PADRAO.gestor
    expect(g['empresas.editar']).toBe('todas')
    expect(g['empresas.transferir']).toBe(true)
    expect(g['importacao.executar']).toBe(true)
    expect(g['geolocalizacao.lotes']).toBe(true)
    expect(g['equipe.ver_emails']).toBe(true)
    for (const c of ['cadastros.gerir', 'equipe.gerir', 'perfis.gerir', 'seguranca.gerir']) {
      expect(g[c]).toBeUndefined()
    }
  })

  it('o Vendedor edita só a própria carteira e não exclui nem transfere', () => {
    const v = PERMISSOES_PADRAO.vendedor
    expect(v['empresas.editar']).toBe('propria')
    expect(v['empresas.excluir']).toBeUndefined()
    expect(v['empresas.transferir']).toBeUndefined()
    expect(v['contatos.criar_sem_empresa']).toBeUndefined()
    expect(v['atividades.atribuir_responsavel']).toBeUndefined()
  })
})

describe('versão do catálogo', () => {
  it('a versão 1 tem exatamente estas permissões: acrescentar exige subir a versão e sincronizar', () => {
    expect(VERSAO_DO_CATALOGO).toBe(1)
    expect(CHAVES_DE_PERMISSAO).toHaveLength(30)
  })
})

describe('validação e conversão', () => {
  it('recusa chave desconhecida, alcance faltando e alcance indevido', () => {
    expect(validarPermissoes({ 'x.y': true })).toHaveLength(1)
    expect(validarPermissoes({ 'empresas.ver': true })).toHaveLength(1)
    expect(validarPermissoes({ 'empresas.criar': 'todas' })).toHaveLength(1)
    expect(validarPermissoes({ 'empresas.ver': 'equipe', 'empresas.criar': true })).toEqual([])
  })

  it('ida e volta com as linhas de perfil_permissoes', () => {
    const linhas = linhasDasPermissoes(PERMISSOES_PADRAO.vendedor)
    expect(permissoesDasLinhas(linhas)).toEqual(PERMISSOES_PADRAO.vendedor)
    expect(linhas.find((l) => l.permissao === 'empresas.criar')?.alcance).toBeNull()
  })

  it('o alcance mais amplo vence', () => {
    expect(alcanceMaisAmplo('propria', 'equipe')).toBe('equipe')
    expect(alcanceMaisAmplo('todas', 'propria')).toBe('todas')
  })
})

describe('2FA por perfil', () => {
  it('a política antiga mapeia para os perfis de sistema', () => {
    expect(exige2faDaPoliticaAntiga('admin')).toEqual(EXIGE_2FA_PADRAO)
    expect(exige2faDaPoliticaAntiga('admin_gestor')).toEqual({
      admin: true,
      gestor: true,
      vendedor: false,
    })
    expect(exige2faDaPoliticaAntiga('todos')).toEqual({ admin: true, gestor: true, vendedor: true })
  })
})
