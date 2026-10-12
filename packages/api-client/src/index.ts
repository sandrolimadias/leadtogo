import createClient from 'openapi-fetch'

import type { components, paths } from './gerado/schema.js'

export type { paths, components } from './gerado/schema.js'

/** Tipos das respostas e entradas da API, pelos nomes do OpenAPI (`components.schemas`). */
type Esquemas = components['schemas']
export type Me = Esquemas['MeResposta']
export type EmpresaDoUsuario = Esquemas['EmpresaDoUsuario']
export type Preferencias = Esquemas['Preferencias']
export type PreferenciasPatch = Esquemas['PreferenciasPatch']
export type MembroDaEquipe = Esquemas['MembroDaEquipe']
export type ConviteResumo = Esquemas['ConviteResumo']
export type ConviteCriado = Esquemas['ConviteCriado']
export type EmpresaCriada = Esquemas['EmpresaCriada']
export type ErroDaApi = Esquemas['Erro']
export type ConviteConsulta = Esquemas['ConviteConsulta']
export type ConviteAceito = Esquemas['ConviteAceito']
export type PrimeiroAcessoResultado = Esquemas['PrimeiroAcessoResultado']
export type Seguranca = Esquemas['ConfiguracaoDeSeguranca']
export type OpcoesDeAcesso = Esquemas['OpcoesDeAcesso']
export type TagGrupo = Esquemas['TagGrupo']
export type Tag = Esquemas['Tag']
export type Vertical = Esquemas['Vertical']
export type Solucao = Esquemas['Solucao']
export type Origem = Esquemas['Origem']
export type Motivo = Esquemas['Motivo']
export type TipoAtividade = Esquemas['TipoAtividade']
export type Funil = Esquemas['Funil']
export type FunilFase = Esquemas['FunilFase']

/**
 * Cliente tipado da API, gerado do OpenAPI (`pnpm --filter @leadtogo/api-client generate`).
 * Envia o cookie de sessão (`credentials: 'include'`). As rotas de login, 2FA e recuperação de senha
 * (`/v1/auth/*`) são do Better Auth: use o cliente dele para essas.
 */
export function criarApiClient(baseUrl: string, opcoes: { fetch?: typeof fetch } = {}) {
  return createClient<paths>({ baseUrl, credentials: 'include', ...opcoes })
}

export type ApiClient = ReturnType<typeof criarApiClient>
