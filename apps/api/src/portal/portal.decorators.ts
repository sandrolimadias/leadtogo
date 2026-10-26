import { SetMetadata } from '@nestjs/common'

/**
 * Rotas do portal do cliente (`/v1/portal/*`). O PADRÃO É PROTEGIDO: sem marca, a rota exige a sessão do
 * portal (cookie próprio), o 2FA quando a regra pede e abre a transação com as duas camadas de isolamento
 * (tenant e empresa-cliente). As rotas do portal NÃO passam pelo controle de acesso do CRM, e a sessão do CRM
 * não vale aqui (cookies, guardas e interceptadores são separados).
 */
export const CHAVE_PORTAL = Symbol('portal:rota')
export const CHAVE_PORTAL_PUBLICA = Symbol('portal:publica')
export const CHAVE_PORTAL_SEM_2FA = Symbol('portal:permite-sem-2fa')
export const CHAVE_PORTAL_SOB_DEMANDA = Symbol('portal:transacao-sob-demanda')

/** Marca o controller como do portal (guarda, interceptador e CORS do portal valem; os do CRM não). */
export const RotaDoPortal = () => SetMetadata(CHAVE_PORTAL, true)

/** Sem sessão: pedir o link de entrada, consultar e consumir um link. */
export const PortalPublica = () => SetMetadata(CHAVE_PORTAL_PUBLICA, true)

/** Deixa passar a sessão cujo 2FA ainda não foi conferido (ver a sessão, ativar/conferir o 2FA, sair). */
export const PortalPermiteSem2fa = () => SetMetadata(CHAVE_PORTAL_SEM_2FA, true)

/**
 * A rota faz chamada externa lenta (Garage) ou fica aberta por muito tempo (SSE): o interceptador só confere a
 * sessão numa transação curta e o código abre a dele, com as mesmas variáveis de isolamento, em
 * `ctx.transacao(() => ...)`. Sem chamar `transacao()`, a rota não usa o banco (ex.: o fluxo SSE).
 */
export const PortalTransacaoSobDemanda = () => SetMetadata(CHAVE_PORTAL_SOB_DEMANDA, true)
