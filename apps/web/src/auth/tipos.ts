import type { ConviteAceito, ConviteConsulta, Me } from '@leadtogo/api-client'
import type { PrimeiroAcessoEntrada, PrimeiroAcessoResultado } from '@leadtogo/shared'

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

/**
 * Tudo o que as telas de acesso pedem ao servidor (Better Auth em /v1/auth + a API). As telas só
 * conhecem esta interface: o app usa a implementação real (`servicos.ts`) e os testes uma de mentira.
 */
export interface ServicosDeAcesso {
  /** Sessão atual, ou null sem login */
  me: () => Promise<Me | null>
  opcoes: () => Promise<{ loginGoogle: boolean }>
  primeiroAcessoAberto: () => Promise<boolean>

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
}
