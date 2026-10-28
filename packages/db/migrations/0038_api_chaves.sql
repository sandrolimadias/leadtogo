CREATE TYPE "public"."tipo_membro" AS ENUM('pessoa', 'integracao');--> statement-breakpoint
CREATE TABLE "api_chaves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" varchar(80) NOT NULL,
	"prefixo" char(8) NOT NULL,
	"hash" char(64) NOT NULL,
	"ambiente" varchar(4) NOT NULL,
	"membro_id" uuid NOT NULL,
	"permissoes" text[] DEFAULT '{}'::text[] NOT NULL,
	"responsavel_padrao_id" uuid,
	"ips_permitidos" text[] DEFAULT '{}'::text[] NOT NULL,
	"expira_em" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	"revogada_por" uuid,
	"substituida_por" uuid,
	"ultimo_uso_em" timestamp with time zone,
	"ultimo_ip" "inet",
	"aviso_vencimento_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "api_chaves_nome_chk" CHECK (char_length(btrim("api_chaves"."nome")) BETWEEN 1 AND 80),
	CONSTRAINT "api_chaves_ambiente_chk" CHECK ("api_chaves"."ambiente" IN ('live', 'test')),
	CONSTRAINT "api_chaves_hash_chk" CHECK ("api_chaves"."hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_chaves_revogada_chk" CHECK (("api_chaves"."revogada_em" IS NULL) = ("api_chaves"."revogada_por" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "membros" ADD COLUMN "tipo" "tipo_membro" DEFAULT 'pessoa' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_membro_id_membros_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_responsavel_padrao_id_membros_id_fk" FOREIGN KEY ("responsavel_padrao_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_revogada_por_membros_id_fk" FOREIGN KEY ("revogada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_substituida_por_api_chaves_id_fk" FOREIGN KEY ("substituida_por") REFERENCES "public"."api_chaves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_chaves_hash_uq" ON "api_chaves" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "api_chaves_lista_idx" ON "api_chaves" USING btree ("tenant_id","criado_em");--> statement-breakpoint
CREATE INDEX "api_chaves_vencimento_idx" ON "api_chaves" USING btree ("expira_em") WHERE "api_chaves"."expira_em" IS NOT NULL AND "api_chaves"."revogada_em" IS NULL AND "api_chaves"."excluido_em" IS NULL;--> statement-breakpoint

-- API aberta, fase I1 (docs/plano_api_aberta.md, seção 4): chaves de API por empresa. Só expansão.
-- RLS por empresa (tenant) e negado ao portal, como toda tabela de negócio.
SELECT aplicar_rls_tenant('api_chaves');--> statement-breakpoint

-- A requisição com chave chega SEM empresa: a função acha a chave pelo hash e devolve só (chave, empresa) de uma
-- chave válida (não revogada, não excluída, no prazo). Daí em diante tudo roda sob RLS, com o tenant da chave.
-- Mesmo padrão das varreduras (0037): política só para o dono, travada numa variável que só a função liga.
CREATE POLICY api_chaves_localizar_le ON api_chaves FOR SELECT TO leadtogo_owner
  USING (current_setting('app.localizando_chave', true) = '1');--> statement-breakpoint
CREATE FUNCTION app_localizar_chave(p_hash text)
  RETURNS TABLE (chave_id uuid, tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.localizando_chave', '1', true);
  RETURN QUERY
    SELECT c.id, c.tenant_id FROM public.api_chaves c
    WHERE c.hash = p_hash AND c.revogada_em IS NULL AND c.excluido_em IS NULL
      AND (c.expira_em IS NULL OR c.expira_em > pg_catalog.now())
    LIMIT 1;
  PERFORM pg_catalog.set_config('app.localizando_chave', '', true);
END
$$;--> statement-breakpoint

-- O worker (sem empresa) acha as chaves que vencem em até 15 dias e ainda não tiveram o aviso da vez.
CREATE FUNCTION app_chaves_a_vencer()
  RETURNS TABLE (chave_id uuid, tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.localizando_chave', '1', true);
  RETURN QUERY
    SELECT c.id, c.tenant_id FROM public.api_chaves c
    WHERE c.expira_em IS NOT NULL AND c.revogada_em IS NULL AND c.excluido_em IS NULL
      AND c.expira_em > pg_catalog.now() AND c.expira_em <= pg_catalog.now() + interval '15 days'
      AND (c.aviso_vencimento_em IS NULL
        OR (c.expira_em <= pg_catalog.now() + interval '1 day' AND c.aviso_vencimento_em < c.expira_em - interval '1 day'))
    ORDER BY c.expira_em LIMIT 200;
  PERFORM pg_catalog.set_config('app.localizando_chave', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_localizar_chave(text), app_chaves_a_vencer() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_localizar_chave(text), app_chaves_a_vencer() TO leadtogo_app;
