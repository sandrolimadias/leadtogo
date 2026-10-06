import { SetMetadata } from '@nestjs/common'

export interface RegraDeLimite {
  /** Nome da regra: cada uma tem o seu contador (ex.: `primeiro-acesso`) */
  nome: string
  /** Requisições permitidas por IP na janela */
  max: number
  /** Duração da janela, em segundos */
  janelaS: number
  /**
   * O que fazer se o Valkey estiver fora: `false` (padrão) deixa passar e registra um aviso;
   * `true` recusa com 503. Use `true` em rotas sensíveis (criação de conta, recuperação de senha).
   */
  falhaFechada?: boolean
}

export const CHAVE_LIMITE = Symbol('regra-de-limite')
export const CHAVE_SEM_LIMITE = Symbol('sem-limite')

/** Regra mais dura que a global, só desta rota: `@Limite({ nome: 'x', max: 5, janelaS: 60 })`. */
export const Limite = (regra: RegraDeLimite) => SetMetadata(CHAVE_LIMITE, regra)

/** Isenta a rota do limite global (ex.: o /health, que o orquestrador consulta toda hora). */
export const SemLimite = () => SetMetadata(CHAVE_SEM_LIMITE, true)
