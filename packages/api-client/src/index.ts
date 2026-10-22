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
export type PerfilDeAcesso = Esquemas['PerfilDeAcesso']
export type MembroDoPerfil = Esquemas['MembroDoPerfil']
export type PerfilDoMembro = Esquemas['PerfilDoMembro']
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
export type PapelDecisao = Esquemas['PapelNaDecisao']
export type PerfilDeImportacao = Esquemas['PerfilDeImportacao']
export type CnaesConferidos = Esquemas['CnaesConferidos']
export type LoteDeImportacao = Esquemas['LoteDeImportacao']
export type AlterarLoteEntrada = Esquemas['AlterarLoteEntrada']
export type PreviaDaImportacao = Esquemas['PreviaDaImportacao']
export type AndamentoDaImportacao = Esquemas['AndamentoDaImportacao']
export type ListaDeLotesDeImportacao = Esquemas['ListaDeLotesDeImportacao']
export type LinhasDaImportacao = Esquemas['LinhasDaImportacao']
export type ValoresDoTipoDaImportacao = Esquemas['ValoresDoTipoDaImportacao']
export type Motivo = Esquemas['Motivo']
export type TipoAtividade = Esquemas['TipoAtividade']
export type ResultadoDeVisita = Esquemas['ResultadoDeVisita']
export type ModeloDeVisita = Esquemas['ModeloDeVisita']
export type VersaoDoModeloDeVisita = Esquemas['VersaoDoModeloDeVisita']
export type ConfiguracaoDeVisitas = Esquemas['ConfiguracaoDeVisitas']
export type Funil = Esquemas['Funil']
export type FunilFase = Esquemas['FunilFase']
export type EmpresaCarteira = Esquemas['EmpresaDaCarteira']
export type Contato = Esquemas['Contato']
export type ListaDeContatos = Esquemas['ListaDeContatos']
export type ItemDaListaDeContatos = Esquemas['ItemDaListaDeContatos']
export type OpcoesDaListaDeContatos = Esquemas['OpcoesDaListaDeContatos']
export type ContatoDaEmpresa = Esquemas['ContatoDaEmpresa']
export type Dashboard = Esquemas['Dashboard']
export type Oportunidade = Esquemas['Oportunidade']
export type OportunidadeDetalhada = Esquemas['OportunidadeDetalhada']
export type ListaDeOportunidades = Esquemas['ListaDeOportunidades']
export type KanbanDeOportunidades = Esquemas['KanbanDeOportunidades']
export type ResultadoDoMovimento = Esquemas['ResultadoDoMovimento']
export type Atividade = Esquemas['Atividade']
export type ListaDeAtividades = Esquemas['ListaDeAtividades']
export type ListaDeEmpresas = Esquemas['ListaDeEmpresas']
export type ItemDaLista = Esquemas['ItemDaListaDeEmpresas']
export type ContagensDaLista = Esquemas['ContagensDaLista']
export type OpcoesDaLista = Esquemas['OpcoesDaLista']
export type HistoricoDaEmpresa = Esquemas['HistoricoDaEmpresa']
export type EntradaDoHistorico = Esquemas['EntradaDoHistoricoDaEmpresa']
export type ConsultaReceita = Esquemas['ConsultaReceita']
export type DadosDaReceita = Esquemas['DadosDaReceita']
export type ConsultaDaReceitaDaEmpresa = Esquemas['ConsultaDaReceitaDaEmpresa']
export type ConfiguracaoDaCarteira = Esquemas['ConfiguracaoDaCarteira']
export type ResultadoDaTagEmMassa = Esquemas['ResultadoDaTagEmMassa']

/**
 * Cliente tipado da API, gerado do OpenAPI (`pnpm --filter @leadtogo/api-client generate`).
 * Envia o cookie de sessão (`credentials: 'include'`). As rotas de login, 2FA e recuperação de senha
 * (`/v1/auth/*`) são do Better Auth: use o cliente dele para essas.
 */
export function criarApiClient(baseUrl: string, opcoes: { fetch?: typeof fetch } = {}) {
  return createClient<paths>({ baseUrl, credentials: 'include', ...opcoes })
}

export type ApiClient = ReturnType<typeof criarApiClient>

// Geolocalização (G1)
export type PosicaoDaEmpresa = Esquemas['PosicaoDaEmpresa']
export type LoteGeo = Esquemas['LoteGeo']
export type ListaDeLotesGeo = Esquemas['ListaDeLotesGeo']
export type PreviaDoLoteGeo = Esquemas['PreviaDoLoteGeo']
export type RegiaoGeo = Esquemas['RegiaoGeo']
export type ResumoDaGeolocalizacao = Esquemas['ResumoDaGeolocalizacao']
export type FilaConfirmarEndereco = Esquemas['FilaConfirmarEndereco']

// Mapa (G2)
export type OpcoesDoMapa = Esquemas['OpcoesDoMapa']
export type LegendaDoMapa = Esquemas['LegendaDoMapa']
export type PontosDoMapa = Esquemas['PontosDoMapa']
export type SelecaoDoMapaResposta = Esquemas['SelecaoDoMapa']
export type CoberturaDoMapa = Esquemas['CoberturaDoMapa']
