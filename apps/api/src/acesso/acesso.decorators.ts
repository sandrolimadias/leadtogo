import { SetMetadata } from '@nestjs/common'

/**
 * Controle de acesso das rotas. O PADRÃO É PROTEGIDO: sem nenhuma marca, a rota exige sessão, uma
 * empresa ativa válida e, para administradores, o 2FA ativo. As marcas abaixo afrouxam só o que
 * está escrito nelas.
 */
export const CHAVE_PUBLICA = Symbol('acesso:publica')
export const CHAVE_SEM_EMPRESA = Symbol('acesso:sem-empresa')
export const CHAVE_CONSOLIDADO = Symbol('acesso:consolidado')
export const CHAVE_SEM_2FA = Symbol('acesso:permite-sem-2fa')
export const CHAVE_SEM_TRANSACAO = Symbol('acesso:sem-transacao')
export const CHAVE_TRANSACAO_SOB_DEMANDA = Symbol('acesso:transacao-sob-demanda')

/** Sem login: health, rotas do Better Auth (que checam a sessão sozinhas), primeiro acesso, aceite de convite. */
export const Publica = () => SetMetadata(CHAVE_PUBLICA, true)

/** Exige login, mas não uma empresa ativa (ex.: GET /v1/me e a troca de empresa). */
export const SemEmpresa = () => SetMetadata(CHAVE_SEM_EMPRESA, true)

/**
 * Painel consolidado: só para administradores da conta (dono ou administrador), só leitura, com
 * `app.tenant_ids` = todas as empresas da conta. Não usa a empresa ativa.
 */
export const Consolidado = () => SetMetadata(CHAVE_CONSOLIDADO, true)

/** Deixa passar o administrador que ainda não ativou o 2FA (ex.: GET /v1/me, para ele ver o que falta). */
export const PermiteSem2fa = () => SetMetadata(CHAVE_SEM_2FA, true)

/**
 * A rota não abre a transação da requisição (TenantInterceptor): para rotas que só repassam bytes de outro
 * serviço (o mapa base do Garage) e não tocam em tabela de negócio. Sem isso, cada pedido lento segura uma
 * conexão do pool do banco durante toda a espera (a trava de 19/10/2026). A sessão e a empresa ativa
 * continuam conferidas pelo guard.
 */
export const SemTransacao = () => SetMetadata(CHAVE_SEM_TRANSACAO, true)

/**
 * A rota faz chamada externa lenta (Receita, Garage...) e também usa o banco: o TenantInterceptor NÃO deixa a
 * transação aberta durante o handler (só confere acesso e empresa, numa transação curta) e o código abre a
 * transação onde precisa, com `ctx.transacao(() => ...)`, antes e depois da chamada externa.
 */
export const TransacaoSobDemanda = () => SetMetadata(CHAVE_TRANSACAO_SOB_DEMANDA, true)
