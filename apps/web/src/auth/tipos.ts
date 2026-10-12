import type {
  ConviteAceito,
  ConviteConsulta,
  ConviteCriado,
  ConviteResumo,
  EmpresaCriada,
  Me,
  MembroDaEquipe,
  Preferencias,
  PreferenciasPatch,
  Seguranca,
  TagGrupo,
} from '@leadtogo/api-client'
import type {
  AlterarMembroEntrada,
  AlterarTagEntrada,
  AlterarTagGrupoEntrada,
  CriarConviteEntrada,
  CriarEmpresaEntrada,
  CriarTagEntrada,
  CriarTagGrupoEntrada,
  PoliticaDoisFatores,
  PrimeiroAcessoEntrada,
  PrimeiroAcessoResultado,
  Tag,
} from '@leadtogo/shared'

/** Erro de uma chamada de acesso, já em pt-BR e com o código estável para o front decidir o que fazer. */
export interface ErroDeAcesso {
  codigo: string
  mensagem: string
  status: number
}

export type Resultado<T = void> = { ok: true; dados: T } | { ok: false; erro: ErroDeAcesso }

export interface ConfiguracaoDoDoisFatores {
  /** otpauth://totp/... para o QR code */
  totpUri: string
  /** Chave para digitar à mão, extraída do URI */
  chave: string
  codigosDeBackup: string[]
}

/** Cadastro de grupos de tags e tags (Configurações → Tags). Só o administrador escreve. */
export interface ServicosDeTags {
  /** Grupos com as tags, inclusive as inativas (a tela as mostra com a palavra "Inativa") */
  listar: () => Promise<Resultado<TagGrupo[]>>
  criarGrupo: (dados: CriarTagGrupoEntrada) => Promise<Resultado<TagGrupo>>
  alterarGrupo: (id: string, dados: AlterarTagGrupoEntrada) => Promise<Resultado<TagGrupo>>
  excluirGrupo: (id: string) => Promise<Resultado>
  /** Os ids de TODOS os grupos, na ordem nova */
  reordenarGrupos: (ids: string[]) => Promise<Resultado<TagGrupo[]>>
  criarTag: (dados: CriarTagEntrada) => Promise<Resultado<Tag>>
  alterarTag: (id: string, dados: AlterarTagEntrada) => Promise<Resultado<Tag>>
  excluirTag: (id: string) => Promise<Resultado>
  /** Os ids de TODAS as tags do grupo, na ordem nova */
  reordenarTags: (grupoId: string, ids: string[]) => Promise<Resultado<TagGrupo>>
}

/**
 * Tudo o que as telas de acesso pedem ao servidor (Better Auth em /v1/auth + a API). As telas só
 * conhecem esta interface: o app usa a implementação real (`servicos.ts`) e os testes uma de mentira.
 */
export interface ServicosDeAcesso {
  /** Sessão atual, ou null sem login */
  me: () => Promise<Me | null>
  opcoes: () => Promise<{ loginGoogle: boolean }>
  primeiroAcessoAberto: () => Promise<boolean>

  /** Preferências do membro na empresa ativa (tema, menu recolhido...); null sem empresa ativa */
  preferencias: () => Promise<Preferencias | null>
  alterarPreferencias: (patch: PreferenciasPatch) => Promise<Resultado<Preferencias>>
  /** Troca a empresa ativa DESTA sessão (e a API lembra a escolha para o próximo login) */
  trocarEmpresa: (empresaId: string) => Promise<Resultado>

  entrar: (email: string, senha: string) => Promise<Resultado<{ doisFatores: boolean }>>
  entrarComGoogle: () => Promise<void>
  verificarCodigo: (codigo: string, confiarNoAparelho: boolean) => Promise<Resultado>
  verificarCodigoDeRecuperacao: (codigo: string, confiarNoAparelho: boolean) => Promise<Resultado>
  sair: () => Promise<void>

  /** Pede o link de nova senha. Responde igual exista ou não a conta (não revela cadastro). */
  pedirNovaSenha: (email: string) => Promise<Resultado>
  redefinirSenha: (token: string, senha: string) => Promise<Resultado>
  reenviarVerificacao: (email: string) => Promise<Resultado>

  prepararDoisFatores: (senha: string) => Promise<Resultado<ConfiguracaoDoDoisFatores>>
  confirmarDoisFatores: (codigo: string) => Promise<Resultado>
  /** Desativa o 2FA: senha + código atual do app. A API recusa (403) se alguma regra o exige do usuário. */
  desativarDoisFatores: (senha: string, codigo: string) => Promise<Resultado>
  /** Gera novos códigos de recuperação (pede a senha); os antigos deixam de valer. */
  gerarNovosCodigos: (senha: string) => Promise<Resultado<string[]>>

  consultarConvite: (token: string) => Promise<Resultado<ConviteConsulta>>
  aceitarConvite: (dados: {
    token: string
    nome?: string
    senha?: string
  }) => Promise<Resultado<ConviteAceito>>
  criarPrimeiroAcesso: (dados: PrimeiroAcessoEntrada) => Promise<Resultado<PrimeiroAcessoResultado>>

  // Gestão multiempresa (E16a): só o administrador da empresa ativa (criar empresa: da conta)
  criarEmpresa: (dados: CriarEmpresaEntrada) => Promise<Resultado<EmpresaCriada>>
  equipe: () => Promise<Resultado<MembroDaEquipe[]>>
  convitesPendentes: () => Promise<Resultado<ConviteResumo[]>>
  convidar: (dados: CriarConviteEntrada) => Promise<Resultado<ConviteCriado>>
  cancelarConvite: (id: string) => Promise<Resultado>
  alterarMembro: (id: string, dados: AlterarMembroEntrada) => Promise<Resultado<MembroDaEquipe>>
  seguranca: () => Promise<Resultado<Seguranca>>
  alterarPoliticaDeDoisFatores: (politica: PoliticaDoisFatores) => Promise<Resultado<Seguranca>>

  // Cadastros auxiliares (Módulo 1)
  tags: ServicosDeTags
}
