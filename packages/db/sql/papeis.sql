-- Papéis do Leadtogo no PostgreSQL. Idempotente e SEM senhas no arquivo.
--   leadtogo_owner: dono do banco e das tabelas; roda as migrações.
--   leadtogo_app:   usado pela API e pelo worker; sem BYPASSRLS e sem ser dono de nada,
--                   para que o RLS valha (docs/modelagem_banco.md e configuracao_tecnologia.md).
--
-- As senhas entram por variável de ambiente, na hora de executar. Como superusuário, uma
-- vez por banco (os privilégios padrão valem só para o banco em que o arquivo roda):
--   LEADTOGO_OWNER_PASSWORD=... LEADTOGO_APP_PASSWORD=... \
--     psql -v ON_ERROR_STOP=1 -d leadtogo -f packages/db/sql/papeis.sql
-- Pode ser repetido: recria o que faltar e reaplica senhas e permissões.

\set ON_ERROR_STOP on
\set owner_senha `printenv LEADTOGO_OWNER_PASSWORD`
\set app_senha `printenv LEADTOGO_APP_PASSWORD`

SELECT (:'owner_senha' = '' OR :'app_senha' = '') AS senha_vazia \gset
\if :senha_vazia
  DO $$ BEGIN
    RAISE EXCEPTION 'Defina LEADTOGO_OWNER_PASSWORD e LEADTOGO_APP_PASSWORD (não vazias).';
  END $$;
\endif

-- Papéis: criados só se ainda não existirem; atributos e senha sempre reaplicados
SELECT 'CREATE ROLE leadtogo_owner'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'leadtogo_owner') \gexec
SELECT 'CREATE ROLE leadtogo_app'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'leadtogo_app') \gexec

ALTER ROLE leadtogo_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD :'owner_senha';
ALTER ROLE leadtogo_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD :'app_senha';

-- Banco atual: dono e acesso
SELECT format('ALTER DATABASE %I OWNER TO leadtogo_owner', current_database()) \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO leadtogo_app', current_database()) \gexec

-- Extensão que exige superusuário (as demais são "trusted" e entram pela migração)
CREATE EXTENSION IF NOT EXISTS postgis;

GRANT USAGE ON SCHEMA public TO leadtogo_app;

-- Privilégio mínimo: nada é concedido automaticamente sobre tabelas e funções criadas
-- pelo owner. Cada migração concede o que o app precisa (falha fechada se esquecer).
-- Sequências (ex.: auditoria.id) são a exceção.
ALTER DEFAULT PRIVILEGES FOR ROLE leadtogo_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM leadtogo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE leadtogo_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE leadtogo_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO leadtogo_app;
