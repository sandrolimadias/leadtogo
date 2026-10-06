/** Versão em execução (commit do deploy). Aparece em /health e no Sentry. */
export const VERSAO = process.env['APP_VERSION'] ?? 'dev'
