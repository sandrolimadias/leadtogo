-- Extensões, schema auth e infraestrutura de RLS (docs/modelagem_banco.md seção 1 e
-- docs/configuracao_tecnologia.md, Multiempresa). Roda como leadtogo_owner.
-- O PostGIS (que exige superusuário) é instalado por packages/db/sql/papeis.sql.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- Reservado ao Better Auth (E8). Nenhum privilégio é dado ao app aqui.
CREATE SCHEMA IF NOT EXISTS auth;
--> statement-breakpoint
-- Tenant ativo da requisição (SET LOCAL app.tenant_id). Sem a variável, NULL: nada casa
-- com tenant_id = NULL, então a consulta não lê nem grava nada (falha fechada).
CREATE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
-- Empresas liberadas para a leitura consolidada (SET LOCAL app.tenant_ids = '{uuid,uuid}').
CREATE FUNCTION app_tenant_ids() RETURNS uuid[]
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(nullif(current_setting('app.tenant_ids', true), '')::uuid[], '{}'::uuid[]) $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant_id(), app_tenant_ids() TO leadtogo_app;
--> statement-breakpoint
-- Liga o RLS numa tabela de tenant e cria as quatro políticas padrão. Toda migração que
-- cria tabela com tenant_id chama esta função (a coluna é tenant_id; `tenants` usa id).
--   SELECT: tenant ativo OU empresa do consolidado (somente leitura)
--   INSERT/UPDATE/DELETE: somente o tenant ativo
-- Também concede ao leadtogo_app o DML da tabela (o padrão do banco é não conceder nada).
CREATE FUNCTION aplicar_rls_tenant(tabela regclass, coluna name DEFAULT 'tenant_id') RETURNS void
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabela);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabela);

  EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_select ON %s FOR SELECT USING (%I = app_tenant_id() OR %I = ANY (app_tenant_ids()))',
    tabela, coluna, coluna);

  EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK (%I = app_tenant_id())',
    tabela, coluna);

  EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_update ON %s FOR UPDATE USING (%I = app_tenant_id()) WITH CHECK (%I = app_tenant_id())',
    tabela, coluna, coluna);

  EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_delete ON %s FOR DELETE USING (%I = app_tenant_id())',
    tabela, coluna);

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO leadtogo_app', tabela);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION aplicar_rls_tenant(regclass, name) FROM PUBLIC;
