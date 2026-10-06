CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"papel" "papel_membro" NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aceito_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"convidado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_convidado_por_membros_id_fk" FOREIGN KEY ("convidado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "convites_pendente_uq" ON "convites" USING btree ("tenant_id","email") WHERE "convites"."aceito_em" IS NULL AND "convites"."revogado_em" IS NULL;--> statement-breakpoint
CREATE INDEX "convites_tenant_idx" ON "convites" USING btree ("tenant_id","criado_em");--> statement-breakpoint
-- RLS padrão: cada empresa lê e grava só os convites dela.
SELECT aplicar_rls_tenant('convites');
--> statement-breakpoint
-- Aceite do convite: quem aceita ainda não tem sessão nem tenant ativo, só o token. Achar o convite
-- pelo hash exige ler `convites` fora de qualquer tenant, que o RLS forçado impede. Mesmo padrão da
-- migração 0006: função SECURITY DEFINER mínima do leadtogo_owner e uma política FOR SELECT só para
-- o leadtogo_owner, travada no hash que a função recebe. Devolve APENAS os ids; o resto do convite
-- (e-mail, papel, validade, situação) a API lê depois, já com o tenant ativo e sob RLS.
CREATE POLICY convite_por_token ON convites FOR SELECT TO leadtogo_owner
  USING (token_hash = nullif(current_setting('app.convite_hash', true), ''));
--> statement-breakpoint
CREATE FUNCTION app_convite_por_token(p_token_hash text)
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.convite_hash', coalesce(p_token_hash, ''), true);
  RETURN QUERY
    SELECT c.id, c.tenant_id FROM public.convites c WHERE c.token_hash = p_token_hash;
  PERFORM pg_catalog.set_config('app.convite_hash', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_convite_por_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_convite_por_token(text) TO leadtogo_app;
