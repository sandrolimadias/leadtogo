import { SetMetadata } from '@nestjs/common'

/**
 * Rotas da API pública (`/v1/publica/*`, docs/plano_api_aberta.md). Só a CHAVE DE API entra: a guarda e o
 * interceptador são os desta pasta, e o controle de acesso do CRM (sessão, empresa ativa) ignora estas rotas.
 * A sessão do app nunca chama uma rota pública, e a chave nunca chama uma rota interna.
 * Toda rota pública declara `@Permissao` (as permissões da chave) como qualquer rota de negócio.
 */
export const CHAVE_API_PUBLICA = Symbol('api:publica')

/** Marca o controller (ou a rota) como da API pública. */
export const ApiPublica = () => SetMetadata(CHAVE_API_PUBLICA, true)
