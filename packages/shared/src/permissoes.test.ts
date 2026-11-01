import { describe, expect, it } from 'vitest'

import {
  CATALOGO_DE_PERMISSOES,
  CHAVES_DE_PERMISSAO,
  EXIGE_2FA_PADRAO,
  PERMISSOES_PADRAO,
  PERMISSOES_PROTEGIDAS_DO_ADMIN,
  NOVAS_POR_VERSAO,
  PERMISSOES_DE_INTEGRACAO,
  permissoesDaChave,
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
    // Chamados entrou na v4, o portal na v5, as publicações na v6 e os documentos na v7 e a agenda na v8 e os avisos na v9
    expect(modulos.has('chamados')).toBe(true)
    expect(modulos.has('portal')).toBe(true)
    expect([...CHAVES_DE_PERMISSAO].filter((c) => c.startsWith('portal.'))).toEqual([
      ...(NOVAS_POR_VERSAO[5] ?? []),
      ...(NOVAS_POR_VERSAO[6] ?? []),
      ...(NOVAS_POR_VERSAO[7] ?? []),
      ...(NOVAS_POR_VERSAO[8] ?? []),
      ...(NOVAS_POR_VERSAO[9] ?? []),
      ...(NOVAS_POR_VERSAO[12] ?? []),
    ])
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
  it('a versão 12 tem exatamente estas permissões: acrescentar exige subir a versão e listar as novas', () => {
    expect(VERSAO_DO_CATALOGO).toBe(12)
    // `atividades.excluir` saiu (6d): excluir a atividade é parte de editá-la, como antes dos perfis
    expect(CHAVES_DE_PERMISSAO).toHaveLength(53)
    expect(NOVAS_POR_VERSAO).toEqual({
      2: ['visitas.ver_localizacao'],
      3: ['rotas.ver', 'rotas.editar', 'rotas.atribuir'],
      4: [
        'chamados.ver',
        'chamados.criar',
        'chamados.atender',
        'chamados.triar',
        'chamados.atribuir',
        'chamados.gerir_areas',
        'chamados.ver_metricas',
        'chamados.exportar',
      ],
      5: ['portal.ver', 'portal.acessos', 'portal.configurar'],
      6: ['portal.publicar', 'portal.moderar'],
      7: ['portal.documentos'],
      8: ['portal.agenda'],
      9: ['portal.avisos'],
      10: ['integracoes.gerir'],
      11: ['oportunidades.data_fechamento', 'oportunidades.data_criacao'],
      12: ['portal.formularios'],
    })
  })

  it('v11: Administrador e Gestor escolhem a data de fechamento; só o Administrador altera a de criação', () => {
    expect(PERMISSOES_PADRAO.admin['oportunidades.data_fechamento']).toBe(true)
    expect(PERMISSOES_PADRAO.gestor['oportunidades.data_fechamento']).toBe(true)
    expect(PERMISSOES_PADRAO.vendedor['oportunidades.data_fechamento']).toBeUndefined()
    expect(PERMISSOES_PADRAO.admin['oportunidades.data_criacao']).toBe(true)
    expect(PERMISSOES_PADRAO.gestor['oportunidades.data_criacao']).toBeUndefined()
    expect(PERMISSOES_PADRAO.vendedor['oportunidades.data_criacao']).toBeUndefined()
  })

  it('v10: só o Administrador recebe integracoes.gerir; Gestor e Vendedor não ganham nada', () => {
    expect(PERMISSOES_PADRAO.admin['integracoes.gerir']).toBe(true)
    expect(PERMISSOES_PADRAO.gestor['integracoes.gerir']).toBeUndefined()
    expect(PERMISSOES_PADRAO.vendedor['integracoes.gerir']).toBeUndefined()
  })

  it('v4: só o Administrador recebe as permissões dos chamados; Gestor e Vendedor não ganham nada novo', () => {
    const chamados = NOVAS_POR_VERSAO[4] ?? []
    for (const c of chamados) expect(PERMISSOES_PADRAO.admin[c]).toBeDefined()
    expect(PERMISSOES_PADRAO.admin['chamados.ver']).toBe('todas')
    expect(PERMISSOES_PADRAO.admin['chamados.atender']).toBe('todas')
    expect(PERMISSOES_PADRAO.admin['chamados.criar']).toBe(true)
    expect(PERMISSOES_PADRAO.admin['chamados.ver_metricas']).toBe('todas')
    for (const perfil of [PERMISSOES_PADRAO.gestor, PERMISSOES_PADRAO.vendedor]) {
      expect(Object.keys(perfil).filter((c) => c.startsWith('chamados.'))).toEqual([])
    }
  })

  it('v5 a v9: só o Administrador recebe as permissões do portal; Gestor e Vendedor não ganham nada', () => {
    for (const c of [
      ...(NOVAS_POR_VERSAO[5] ?? []),
      ...(NOVAS_POR_VERSAO[6] ?? []),
      ...(NOVAS_POR_VERSAO[7] ?? []),
      ...(NOVAS_POR_VERSAO[8] ?? []),
      ...(NOVAS_POR_VERSAO[9] ?? []),
    ])
      expect(PERMISSOES_PADRAO.admin[c]).toBe(true)
    for (const perfil of [PERMISSOES_PADRAO.gestor, PERMISSOES_PADRAO.vendedor]) {
      expect(Object.keys(perfil).filter((c) => c.startsWith('portal.'))).toEqual([])
    }
  })

  it('v3: Administrador e Gestor montam rotas de todos e atribuem; o Vendedor só as próprias', () => {
    expect(PERMISSOES_PADRAO.admin['rotas.ver']).toBe('todas')
    expect(PERMISSOES_PADRAO.gestor['rotas.editar']).toBe('todas')
    expect(PERMISSOES_PADRAO.gestor['rotas.atribuir']).toBe(true)
    expect(PERMISSOES_PADRAO.vendedor['rotas.ver']).toBe('propria')
    expect(PERMISSOES_PADRAO.vendedor['rotas.editar']).toBe('propria')
    expect(PERMISSOES_PADRAO.vendedor['rotas.atribuir']).toBeUndefined()
  })

  it('toda chave nova existe no catálogo; v2: Administrador e Gestor veem a localização, o Vendedor não', () => {
    for (const chaves of Object.values(NOVAS_POR_VERSAO)) {
      for (const c of chaves) expect(CHAVES_DE_PERMISSAO).toContain(c)
    }
    expect(PERMISSOES_PADRAO.admin['visitas.ver_localizacao']).toBe(true)
    expect(PERMISSOES_PADRAO.gestor['visitas.ver_localizacao']).toBe(true)
    expect(PERMISSOES_PADRAO.vendedor['visitas.ver_localizacao']).toBeUndefined()
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

describe('permissões de integração (chaves de API)', () => {
  it('só tem chaves do catálogo, e nenhuma de gestão', () => {
    for (const c of PERMISSOES_DE_INTEGRACAO) expect(CHAVES_DE_PERMISSAO).toContain(c)
    for (const proibida of [
      'perfis.gerir',
      'equipe.gerir',
      'equipe.ver_emails',
      'seguranca.gerir',
      'integracoes.gerir',
      'carteira.configurar',
      'importacao.executar',
    ])
      expect(PERMISSOES_DE_INTEGRACAO).not.toContain(proibida)
    expect(PERMISSOES_DE_INTEGRACAO.some((c) => c.startsWith('portal.'))).toBe(false)
  })

  it('a chave age com alcance "todas" e ignora o que não é liberado', () => {
    expect(
      permissoesDaChave(['empresas.ver', 'empresas.criar', 'perfis.gerir', 'inventada.x']),
    ).toEqual({ 'empresas.ver': 'todas', 'empresas.criar': true })
  })
})
