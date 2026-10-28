CREATE TABLE "webhook_entregas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"tipo" varchar(60) NOT NULL,
	"corpo" jsonb NOT NULL,
	"avulsa" boolean DEFAULT false NOT NULL,
	"situacao" varchar(10) DEFAULT 'pendente' NOT NULL,
	"tentativas" smallint DEFAULT 0 NOT NULL,
	"status_http" smallint,
	"duracao_ms" integer,
	"resposta" text,
	"erro" text,
	"proxima_tentativa_em" timestamp with time zone DEFAULT now(),
	"reservada_ate" timestamp with time zone,
	"entregue_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_entregas_situacao_chk" CHECK ("webhook_entregas"."situacao" IN ('pendente', 'sucesso', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"descricao" varchar(120) NOT NULL,
	"url" text NOT NULL,
	"eventos" text[] DEFAULT '{}'::text[] NOT NULL,
	"segredo" text NOT NULL,
	"segredo_anterior" text,
	"segredo_anterior_ate" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"desativado_motivo" varchar(20),
	"ultimo_sucesso_em" timestamp with time zone,
	"falhando_desde" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "webhooks_descricao_chk" CHECK (char_length(btrim("webhooks"."descricao")) BETWEEN 1 AND 120),
	CONSTRAINT "webhooks_url_chk" CHECK ("webhooks"."url" ~ '^https?://' AND char_length("webhooks"."url") <= 500)
);
--> statement-breakpoint
ALTER TABLE "webhook_entregas" ADD CONSTRAINT "webhook_entregas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_entregas" ADD CONSTRAINT "webhook_entregas_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_entregas_evento_uq" ON "webhook_entregas" USING btree ("webhook_id","evento_id");--> statement-breakpoint
CREATE INDEX "webhook_entregas_log_idx" ON "webhook_entregas" USING btree ("tenant_id","webhook_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_entregas_pendentes_idx" ON "webhook_entregas" USING btree ("proxima_tentativa_em") WHERE "webhook_entregas"."situacao" = 'pendente';--> statement-breakpoint
CREATE INDEX "webhooks_lista_idx" ON "webhooks" USING btree ("tenant_id","criado_em");--> statement-breakpoint

-- API aberta, fase I3 (docs/plano_api_aberta.md, seção 6): webhooks de saída. Só expansão.
SELECT aplicar_rls_tenant('webhooks');--> statement-breakpoint
SELECT aplicar_rls_tenant('webhook_entregas');--> statement-breakpoint

-- Rede de segurança do worker (sem empresa): entregas pendentes cuja vez passou há mais de 2 minutos (o job saiu
-- da fila) voltam a ela. Mesmo padrão das varreduras da 0037.
CREATE POLICY webhook_entregas_varredura_le ON webhook_entregas FOR SELECT TO leadtogo_owner
  USING (current_setting('app.varrendo_webhooks', true) = '1');--> statement-breakpoint
CREATE POLICY webhook_entregas_limpeza_apaga ON webhook_entregas FOR DELETE TO leadtogo_owner
  USING (current_setting('app.varrendo_webhooks', true) = '1');--> statement-breakpoint
CREATE FUNCTION app_entregas_atrasadas()
  RETURNS TABLE (id uuid, tenant_id uuid, tentativas smallint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.varrendo_webhooks', '1', true);
  RETURN QUERY
    SELECT e.id, e.tenant_id, e.tentativas FROM public.webhook_entregas e
    WHERE e.situacao = 'pendente' AND e.proxima_tentativa_em < pg_catalog.now() - interval '2 minutes'
      AND (e.reservada_ate IS NULL OR e.reservada_ate < pg_catalog.now())
    ORDER BY e.proxima_tentativa_em LIMIT 500;
  PERFORM pg_catalog.set_config('app.varrendo_webhooks', '', true);
END
$$;--> statement-breakpoint

-- Retenção do log: sucesso por 30 dias, falha por 90 (as pendentes nunca saem daqui).
CREATE FUNCTION app_limpar_webhook_entregas(p_lote integer DEFAULT 500)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  apagados integer;
BEGIN
  PERFORM pg_catalog.set_config('app.varrendo_webhooks', '1', true);
  WITH alvo AS (
    SELECT e.id FROM public.webhook_entregas e
    WHERE (e.situacao = 'sucesso' AND e.criado_em < pg_catalog.now() - interval '30 days')
       OR (e.situacao = 'falhou' AND e.criado_em < pg_catalog.now() - interval '90 days')
    LIMIT LEAST(GREATEST(coalesce(p_lote, 500), 1), 5000)
  ), feito AS (
    DELETE FROM public.webhook_entregas e USING alvo WHERE e.id = alvo.id RETURNING 1
  )
  SELECT pg_catalog.count(*) INTO apagados FROM feito;
  PERFORM pg_catalog.set_config('app.varrendo_webhooks', '', true);
  RETURN apagados;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_entregas_atrasadas(), app_limpar_webhook_entregas(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_entregas_atrasadas(), app_limpar_webhook_entregas(integer) TO leadtogo_app;
