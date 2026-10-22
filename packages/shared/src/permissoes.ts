import { z } from 'zod'

/**
 * Catálogo de permissões dos perfis de acesso (docs/funcionalidades.md, "Perfis de acesso").
 * Chaves `modulo.acao`. É versionado no código: a API o sincroniza na partida, e cada fase futura
 * (chamados, portal) acrescenta as suas. Só entram módulos que existem.
 */

export const ALCANCES = ['propria', 'equipe', 'todas'] as const
export const alcanceSchema = z.enum(ALCANCES)
export type Alcance = z.infer<typeof alcanceSchema>

/** Do menor para o maior: `todas` inclui `equipe`, que inclui `propria`. */
export const ORDEM_DO_ALCANCE: Record<Alcance, number> = { propria: 0, equipe: 1, todas: 2 }

export const alcanceMaisAmplo = (a: Alcance, b: Alcance): Alcance =>
  ORDEM_DO_ALCANCE[a] >= ORDEM_DO_ALCANCE[b] ? a : b

export const ROTULO_DO_ALCANCE: Record<Alcance, string> = {
  propria: 'Só a própria carteira',
  equipe: 'A própria e a da equipe',
  todas: 'Todas',
}

export interface DefinicaoDePermissao {
  chave: string
  modulo: string
  acao: string
  rotulo: string
  /** Admite alcance (propria, equipe, todas); senão a permissão é só concedida ou não */
  admiteAlcance: boolean
}

const p = (
  modulo: string,
  acao: string,
  rotulo: string,
  admiteAlcance = false,
): DefinicaoDePermissao => ({ chave: `${modulo}.${acao}`, modulo, acao, rotulo, admiteAlcance })

export const ROTULO_DO_MODULO: Record<string, string> = {
  empresas: 'Empresas',
  contatos: 'Contatos',
  oportunidades: 'Oportunidades',
  atividades: 'Atividades',
  importacao: 'Importação',
  geolocalizacao: 'Geolocalização e mapa',
  cadastros: 'Cadastros auxiliares',
  equipe: 'Equipe e convites',
  perfis: 'Perfis de acesso',
  seguranca: 'Segurança',
  carteira: 'Regras da carteira',
}

export const CATALOGO_DE_PERMISSOES: readonly DefinicaoDePermissao[] = [
  p('empresas', 'ver', 'Ver empresas', true),
  p('empresas', 'criar', 'Cadastrar empresas'),
  p('empresas', 'editar', 'Editar empresas', true),
  p('empresas', 'excluir', 'Excluir empresas', true),
  p('empresas', 'transferir', 'Transferir a carteira para outro responsável'),
  p('contatos', 'ver', 'Ver contatos', true),
  p('contatos', 'criar', 'Cadastrar contatos'),
  p('contatos', 'criar_sem_empresa', 'Cadastrar contato sem empresa vinculada'),
  p('contatos', 'editar', 'Editar contatos', true),
  p('contatos', 'excluir', 'Excluir contatos', true),
  p('oportunidades', 'ver', 'Ver oportunidades', true),
  p('oportunidades', 'criar', 'Criar oportunidades'),
  p('oportunidades', 'editar', 'Editar oportunidades', true),
  p('oportunidades', 'excluir', 'Excluir oportunidades', true),
  p('oportunidades', 'atribuir_responsavel', 'Escolher outro responsável na oportunidade'),
  p('atividades', 'ver', 'Ver atividades', true),
  p('atividades', 'criar', 'Registrar atividades'),
  p('atividades', 'editar', 'Editar atividades', true),
  p('atividades', 'excluir', 'Excluir atividades', true),
  p('atividades', 'atribuir_responsavel', 'Escolher outro responsável na atividade'),
  p('importacao', 'executar', 'Importar planilhas, ver prévias e relatórios'),
  p('geolocalizacao', 'lotes', 'Rodar geocodificação em lote e ver o resumo'),
  p('geolocalizacao', 'regioes', 'Criar, alterar e excluir regiões'),
  p('geolocalizacao', 'legenda', 'Configurar a legenda do mapa'),
  p('cadastros', 'gerir', 'Gerir tags, funis, tipos, origens, motivos e demais cadastros'),
  p('equipe', 'ver_emails', 'Ver o e-mail dos membros da equipe'),
  p('equipe', 'gerir', 'Convidar, desativar e ver o acesso dos membros'),
  p('perfis', 'gerir', 'Gerir perfis de acesso e atribuí-los aos membros'),
  p('seguranca', 'gerir', 'Definir quem precisa de verificação em duas etapas'),
  p('carteira', 'configurar', 'Configurar as regras da carteira'),
]

export const CHAVES_DE_PERMISSAO: readonly string[] = CATALOGO_DE_PERMISSOES.map((d) => d.chave)

const PORCHAVE = new Map(CATALOGO_DE_PERMISSOES.map((d) => [d.chave, d]))

export const definicaoDaPermissao = (chave: string): DefinicaoDePermissao | undefined =>
  PORCHAVE.get(chave)

/**
 * Permissões que o perfil Admin de sistema nunca perde: sem elas a empresa fica sem quem
 * administre a equipe e os perfis (a API também exige um membro ativo com `perfis.gerir`).
 */
export const PERMISSOES_PROTEGIDAS_DO_ADMIN: readonly string[] = ['perfis.gerir', 'equipe.gerir']

/** Chaves dos perfis de sistema (`perfis_acesso.chave_sistema`). */
export const chaveDeSistemaSchema = z.enum(['admin', 'gestor', 'vendedor'])
export type ChaveDeSistema = z.infer<typeof chaveDeSistemaSchema>

/** Permissões de um perfil: `chave → alcance` (admite alcance) ou `true`. Ausente = sem permissão. */
export type PermissoesDoPerfil = Record<string, Alcance | true>

/** Linha do perfil como gravada em `perfil_permissoes`. */
export interface PermissaoGravada {
  permissao: string
  alcance: Alcance | null
}

/** Valida uma matriz: chave existe, alcance só onde se admite e sempre onde se admite. */
export function validarPermissoes(permissoes: PermissoesDoPerfil): string[] {
  const erros: string[] = []
  for (const [chave, valor] of Object.entries(permissoes)) {
    const def = definicaoDaPermissao(chave)
    if (!def) erros.push(`Permissão desconhecida: ${chave}`)
    else if (def.admiteAlcance && valor === true) erros.push(`${chave} exige um alcance`)
    else if (!def.admiteAlcance && valor !== true) erros.push(`${chave} não admite alcance`)
  }
  return erros
}

export function permissoesDasLinhas(linhas: readonly PermissaoGravada[]): PermissoesDoPerfil {
  const saida: PermissoesDoPerfil = {}
  for (const l of linhas) saida[l.permissao] = l.alcance ?? true
  return saida
}

export function linhasDasPermissoes(permissoes: PermissoesDoPerfil): PermissaoGravada[] {
  return Object.entries(permissoes).map(([permissao, valor]) => ({
    permissao,
    alcance: valor === true ? null : valor,
  }))
}

const todas = (chaves: readonly string[], alcance: Alcance): PermissoesDoPerfil =>
  Object.fromEntries(
    chaves.map((c) => [c, definicaoDaPermissao(c)?.admiteAlcance ? alcance : true]),
  )

/**
 * Permissões padrão dos perfis de sistema: reproduzem o comportamento dos papéis antigos
 * (docs/funcionalidades.md, seção 10). Para o Vendedor, `ver` vale `propria`; a migração das
 * empresas que tinham "Vendedores podem ver todas as empresas" liga `todas` nas ações de ver.
 */
export const PERMISSOES_PADRAO: Record<ChaveDeSistema, PermissoesDoPerfil> = {
  admin: todas(CHAVES_DE_PERMISSAO, 'todas'),
  gestor: todas(
    CHAVES_DE_PERMISSAO.filter(
      (c) =>
        ![
          'geolocalizacao.regioes',
          'geolocalizacao.legenda',
          'cadastros.gerir',
          'equipe.gerir',
          'perfis.gerir',
          'seguranca.gerir',
          'carteira.configurar',
        ].includes(c),
    ),
    'todas',
  ),
  vendedor: {
    'empresas.ver': 'propria',
    'empresas.criar': true,
    'empresas.editar': 'propria',
    'contatos.ver': 'propria',
    'contatos.criar': true,
    'contatos.editar': 'propria',
    'oportunidades.ver': 'propria',
    'oportunidades.criar': true,
    'oportunidades.editar': 'propria',
    'atividades.ver': 'propria',
    'atividades.criar': true,
    'atividades.editar': 'propria',
  },
}

/** Ações de "ver" que o interruptor antigo "Vendedores podem ver todas as empresas" ampliava. */
export const PERMISSOES_DE_VER: readonly string[] = [
  'empresas.ver',
  'contatos.ver',
  'oportunidades.ver',
  'atividades.ver',
]

/** 2FA exigido por padrão nos perfis de sistema (a política antiga `admin` é o padrão). */
export const EXIGE_2FA_PADRAO: Record<ChaveDeSistema, boolean> = {
  admin: true,
  gestor: false,
  vendedor: false,
}

/** Como a política antiga de 2FA vira o flag `exige_2fa` de cada perfil de sistema. */
export function exige2faDaPoliticaAntiga(
  politica: 'admin' | 'admin_gestor' | 'todos',
): Record<ChaveDeSistema, boolean> {
  return {
    admin: true,
    gestor: politica !== 'admin',
    vendedor: politica === 'todos',
  }
}

export const nomeDoPerfilDeSistema: Record<ChaveDeSistema, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
}
