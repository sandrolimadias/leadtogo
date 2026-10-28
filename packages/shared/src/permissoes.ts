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
  visitas: 'Visitas',
  rotas: 'Rotas',
  chamados: 'Central de chamados',
  portal: 'Portal do cliente',
  cadastros: 'Cadastros auxiliares',
  equipe: 'Equipe e convites',
  perfis: 'Perfis de acesso',
  seguranca: 'Segurança',
  carteira: 'Regras da carteira',
  integracoes: 'Integrações',
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
  p('atividades', 'editar', 'Editar, concluir, cancelar e excluir atividades', true),
  p('atividades', 'atribuir_responsavel', 'Escolher outro responsável na atividade'),
  p('importacao', 'executar', 'Importar planilhas, ver prévias e relatórios'),
  p('geolocalizacao', 'lotes', 'Rodar geocodificação em lote e ver o resumo'),
  p('geolocalizacao', 'regioes', 'Criar, alterar e excluir regiões'),
  p('geolocalizacao', 'legenda', 'Configurar a legenda do mapa'),
  p('visitas', 'ver_localizacao', 'Ver a localização e a distância dos check-ins'),
  p('rotas', 'ver', 'Ver rotas', true),
  p('rotas', 'editar', 'Montar, alterar, executar e cancelar rotas', true),
  p('rotas', 'atribuir', 'Montar ou passar a rota para outro vendedor'),
  p('chamados', 'ver', 'Ver chamados', true),
  p('chamados', 'criar', 'Abrir chamados'),
  p('chamados', 'atender', 'Responder, anotar, assumir e mudar o estado dos chamados', true),
  p('chamados', 'triar', 'Triar chamados (definir a área na fila de triagem)'),
  p('chamados', 'atribuir', 'Atribuir chamados a outra pessoa'),
  p('chamados', 'gerir_areas', 'Gerir áreas, triagem, expediente e feriados'),
  p('chamados', 'ver_metricas', 'Ver as métricas dos chamados', true),
  p('chamados', 'exportar', 'Exportar os chamados em CSV'),
  p('portal', 'ver', 'Ver o hub do portal do cliente (indicadores e chamados vindos do portal)'),
  p('portal', 'acessos', 'Dar, suspender e revogar o acesso dos contatos ao portal'),
  p('portal', 'configurar', 'Configurar o portal (ligar, nome, logo e segurança)'),
  p('portal', 'publicar', 'Criar, agendar, fixar e excluir publicações do portal'),
  p('portal', 'moderar', 'Moderar os comentários e as denúncias das publicações do portal'),
  p('portal', 'documentos', 'Publicar, editar e excluir documentos para os clientes do portal'),
  p(
    'portal',
    'agenda',
    'Criar, publicar e cancelar eventos da agenda do portal e gerir os participantes',
  ),
  p(
    'portal',
    'avisos',
    'Enviar, agendar e cancelar avisos curtos (notificação e push) aos clientes do portal',
  ),
  p('cadastros', 'gerir', 'Gerir tags, funis, tipos, origens, motivos e demais cadastros'),
  p('equipe', 'ver_emails', 'Ver o e-mail dos membros da equipe'),
  p('equipe', 'gerir', 'Convidar, desativar e ver o acesso dos membros'),
  p('perfis', 'gerir', 'Gerir perfis de acesso e atribuí-los aos membros'),
  p('seguranca', 'gerir', 'Definir quem precisa de verificação em duas etapas'),
  p('carteira', 'configurar', 'Configurar as regras da carteira'),
  p(
    'integracoes',
    'gerir',
    'Criar e revogar chaves de API e webhooks, e ver o log das integrações',
  ),
]

/**
 * Versão do catálogo. A criação dos perfis grava a versão atual (`tenant_configuracoes.catalogo_perfis_versao`);
 * quem acrescenta permissão sobe a versão e lista as chaves novas em `NOVAS_POR_VERSAO`. Na partida da API,
 * os perfis de SISTEMA das empresas com versão menor recebem as chaves novas que o seu padrão tem (as
 * outras permissões não mudam). Perfis criados pela empresa nunca recebem permissão automaticamente.
 */
export const VERSAO_DO_CATALOGO = 10

/** As chaves que cada versão acrescentou (a versão 1 é o catálogo inicial). */
export const NOVAS_POR_VERSAO: Record<number, readonly string[]> = {
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
}

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
          'integracoes.gerir',
        ].includes(c) &&
        !c.startsWith('chamados.') &&
        !c.startsWith('portal.'),
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
    'rotas.ver': 'propria',
    'rotas.editar': 'propria',
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

/**
 * Permissões que uma chave de API pode receber (docs/plano_api_aberta.md, seção 4.3). Ficam de fora a gestão
 * de equipe, perfis, segurança, integrações e regras da carteira, o portal e a importação (tela própria).
 * Uma permissão nova do catálogo NÃO entra aqui sozinha: é uma decisão a cada fase.
 */
export const PERMISSOES_DE_INTEGRACAO: readonly string[] = [
  'empresas.ver',
  'empresas.criar',
  'empresas.editar',
  'empresas.transferir',
  'contatos.ver',
  'contatos.criar',
  'contatos.editar',
  'oportunidades.ver',
  'oportunidades.criar',
  'oportunidades.editar',
  'atividades.ver',
  'atividades.criar',
  'atividades.editar',
]

/** As permissões da chave como as de um perfil: alcance sempre "todas" (a integração age na empresa toda). */
export function permissoesDaChave(chaves: readonly string[]): PermissoesDoPerfil {
  const saida: PermissoesDoPerfil = {}
  for (const c of chaves) {
    if (!PERMISSOES_DE_INTEGRACAO.includes(c)) continue
    const def = definicaoDaPermissao(c)
    if (def) saida[c] = def.admiteAlcance ? 'todas' : true
  }
  return saida
}
