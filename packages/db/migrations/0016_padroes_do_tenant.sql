ALTER TABLE "tenant_configuracoes" ADD COLUMN "padroes_criados_em" timestamp with time zone;
--> statement-breakpoint
-- Backfill dos cadastros padrão (feito no start da API, com o leadtogo_owner): o RLS forçado impede o
-- dono de listar os tenants. Mesmo padrão das migrações 0006–0009: função SECURITY DEFINER mínima e
-- política só para o leadtogo_owner, travada numa variável que só a função define e limpa.
-- Devolve APENAS os ids dos tenants que ainda não tiveram os padrões criados.
CREATE POLICY configuracoes_padroes_pendentes ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.padroes_pendentes', true) = '1' AND padroes_criados_em IS NULL);
--> statement-breakpoint
CREATE FUNCTION app_tenants_sem_padroes()
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.padroes_pendentes', '1', true);
  RETURN QUERY
    SELECT c.tenant_id FROM public.tenant_configuracoes c WHERE c.padroes_criados_em IS NULL ORDER BY c.criado_em;
  PERFORM pg_catalog.set_config('app.padroes_pendentes', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_sem_padroes() FROM PUBLIC;
