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
