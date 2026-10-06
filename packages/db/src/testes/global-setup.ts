import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { conectarOwner } from './conexoes.js'

// Apaga tudo o que o owner criou e aplica as migrações do zero em leadtogo_test.
// O banco, os papéis e o PostGIS vêm de `pnpm dev:up` (ou do passo equivalente do CI).
const LIMPAR = `
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT format('DROP TABLE IF EXISTS %I.%I CASCADE', schemaname, tablename) AS cmd
           FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user LOOP
    EXECUTE r.cmd;
  END LOOP;
  FOR r IN SELECT format('DROP FUNCTION IF EXISTS %s CASCADE', p.oid::regprocedure) AS cmd
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE r.cmd;
  END LOOP;
  FOR r IN SELECT format('DROP TYPE IF EXISTS public.%I CASCADE', t.typname) AS cmd
           FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
             AND t.typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) LOOP
    EXECUTE r.cmd;
  END LOOP;
  DROP SCHEMA IF EXISTS drizzle CASCADE;
  DROP SCHEMA IF EXISTS auth CASCADE;
END $$;
`

export default async function setup(): Promise<void> {
  const owner = conectarOwner()
  try {
    await owner.unsafe(LIMPAR)
    await migrate(drizzle(owner), {
      migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)),
    })
  } finally {
    await owner.end()
  }
}
