CREATE TABLE "portal_codigos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"codigo_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"tentativas" smallint DEFAULT 0 NOT NULL,
	"usado_em" timestamp with time zone,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_codigos_tentativas_chk" CHECK ("portal_codigos"."tentativas" BETWEEN 0 AND 5)
);
--> statement-breakpoint
ALTER TABLE "portal_codigos" ADD CONSTRAINT "portal_codigos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_codigos_email_idx" ON "portal_codigos" USING btree ("email","expira_em");--> statement-breakpoint

-- Portal, Fase 4B (docs/plano_portal_formularios_e_eventos.md, B-23). Só expansão.
-- O código chega com o e-mail, sem o tenant: como no pedido de entrada (app_portal_acessos_por_email), uma
-- função SECURITY DEFINER do dono confere o código e devolve o tenant. A sessão do portal nunca enxerga a tabela.
SELECT aplicar_rls_tenant('portal_codigos');--> statement-breakpoint
CREATE POLICY portal_codigo_sel ON portal_codigos FOR SELECT TO leadtogo_owner
  USING (current_setting('app.portal_codigo', true) = '1' AND email = current_setting('app.portal_email', true)::citext);--> statement-breakpoint
CREATE POLICY portal_codigo_upd ON portal_codigos FOR UPDATE TO leadtogo_owner
  USING (current_setting('app.portal_codigo', true) = '1' AND email = current_setting('app.portal_email', true)::citext)
  WITH CHECK (current_setting('app.portal_codigo', true) = '1' AND email = current_setting('app.portal_email', true)::citext);--> statement-breakpoint

-- Confere o código: acertou, devolve o tenant e o código (quem chama o consome na transação do tenant, depois de
-- conferir o aceite de privacidade); errou, conta uma tentativa em todos os códigos vivos do e-mail (5 erros
-- queimam o código). Sem código que bata, não devolve linha.
CREATE FUNCTION app_portal_conferir_codigo(p_email citext, p_hash text)
  RETURNS TABLE (tenant_id uuid, codigo_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  achado uuid;
  codigo uuid;
BEGIN
  PERFORM pg_catalog.set_config('app.portal_codigo', '1', true);
  PERFORM pg_catalog.set_config('app.portal_email', p_email::text, true);
  SELECT c.id, c.tenant_id INTO codigo, achado FROM public.portal_codigos c
    WHERE c.email = p_email AND c.usado_em IS NULL AND c.expira_em > now() AND c.tentativas < 5
      AND c.codigo_hash = p_hash
    ORDER BY c.criado_em DESC LIMIT 1;
  IF codigo IS NULL THEN
    UPDATE public.portal_codigos SET tentativas = tentativas + 1, atualizado_em = now()
      WHERE email = p_email AND usado_em IS NULL AND expira_em > now() AND tentativas < 5;
  END IF;
  PERFORM pg_catalog.set_config('app.portal_codigo', '', true);
  PERFORM pg_catalog.set_config('app.portal_email', '', true);
  IF codigo IS NOT NULL THEN
    RETURN QUERY SELECT achado, codigo;
  END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_portal_conferir_codigo(citext, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_conferir_codigo(citext, text) TO leadtogo_app;
