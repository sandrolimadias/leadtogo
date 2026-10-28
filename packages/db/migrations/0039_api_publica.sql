CREATE TABLE "idempotencia_chaves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chave_api_id" uuid NOT NULL,
	"chave" varchar(100) NOT NULL,
	"hash_corpo" char(64) NOT NULL,
	"status_http" smallint,
	"resposta" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atividades" ADD COLUMN "id_externo" varchar(200);--> statement-breakpoint
ALTER TABLE "idempotencia_chaves" ADD CONSTRAINT "idempotencia_chaves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotencia_chaves" ADD CONSTRAINT "idempotencia_chaves_chave_api_id_api_chaves_id_fk" FOREIGN KEY ("chave_api_id") REFERENCES "public"."api_chaves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotencia_chaves_uq" ON "idempotencia_chaves" USING btree ("tenant_id","chave_api_id","chave");--> statement-breakpoint
CREATE INDEX "idempotencia_chaves_criado_idx" ON "idempotencia_chaves" USING btree ("criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "atividades_id_externo_uq" ON "atividades" USING btree ("tenant_id","origem","id_externo") WHERE "atividades"."id_externo" IS NOT NULL AND "atividades"."excluido_em" IS NULL;
--> statement-breakpoint

-- API aberta, fase I2 (docs/plano_api_aberta.md, seção 5): API pública. Só expansão.
-- `idempotencia_chaves` guarda a resposta do POST com Idempotency-Key por 24 h; `atividades.id_externo` deduplica
-- a atividade que a integração registra (repetir o mesmo id externo devolve a existente).
SELECT aplicar_rls_tenant('idempotencia_chaves');--> statement-breakpoint

-- Limpeza do worker (sem empresa): apaga as chaves de idempotência com mais de 24 h, em lotes. Mesmo padrão das
-- limpezas da 0009: política só para o dono, travada numa variável que só a função liga.
CREATE POLICY idempotencia_limpeza_le ON idempotencia_chaves FOR SELECT TO leadtogo_owner
  USING (current_setting('app.limpeza_idempotencia', true) = '1');--> statement-breakpoint
CREATE POLICY idempotencia_limpeza_apaga ON idempotencia_chaves FOR DELETE TO leadtogo_owner
  USING (current_setting('app.limpeza_idempotencia', true) = '1');--> statement-breakpoint
CREATE FUNCTION app_limpar_idempotencia(p_lote integer DEFAULT 500)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  apagados integer;
BEGIN
  PERFORM pg_catalog.set_config('app.limpeza_idempotencia', '1', true);
  WITH alvo AS (
    SELECT i.id FROM public.idempotencia_chaves i
    WHERE i.criado_em < pg_catalog.now() - interval '24 hours'
    ORDER BY i.criado_em
    LIMIT LEAST(GREATEST(coalesce(p_lote, 500), 1), 5000)
  ), feito AS (
    DELETE FROM public.idempotencia_chaves i USING alvo WHERE i.id = alvo.id RETURNING 1
  )
  SELECT pg_catalog.count(*) INTO apagados FROM feito;
  PERFORM pg_catalog.set_config('app.limpeza_idempotencia', '', true);
  RETURN apagados;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_limpar_idempotencia(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_limpar_idempotencia(integer) TO leadtogo_app;
