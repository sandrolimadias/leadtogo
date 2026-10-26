CREATE TYPE "public"."alcance_aviso" AS ENUM('todos', 'empresas');--> statement-breakpoint
CREATE TYPE "public"."situacao_aviso" AS ENUM('agendado', 'enviado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."urgencia_aviso" AS ENUM('normal', 'urgente');--> statement-breakpoint
CREATE TABLE "aviso_empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aviso_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aviso_entregas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aviso_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"notificacao_id" uuid,
	"push_enviar_em" timestamp with time zone,
	"push_enviado_em" timestamp with time zone,
	"push_aceitos" smallint DEFAULT 0 NOT NULL,
	"email_enfileirado_em" timestamp with time zone,
	"lido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avisos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mensagem" varchar(140) NOT NULL,
	"link" text,
	"urgencia" "urgencia_aviso" DEFAULT 'normal' NOT NULL,
	"alcance" "alcance_aviso" DEFAULT 'todos' NOT NULL,
	"situacao" "situacao_aviso" DEFAULT 'agendado' NOT NULL,
	"enviar_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"destinatarios" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "avisos_mensagem_chk" CHECK (char_length(btrim("avisos"."mensagem")) BETWEEN 1 AND 140),
	CONSTRAINT "avisos_link_chk" CHECK ("avisos"."link" IS NULL OR "avisos"."link" ~ '^(/[^/\s]|https?://\S+)'),
	CONSTRAINT "avisos_enviado_chk" CHECK (("avisos"."situacao" = 'enviado') = ("avisos"."enviado_em" IS NOT NULL)),
	CONSTRAINT "avisos_cancelado_chk" CHECK (("avisos"."situacao" = 'cancelado') = ("avisos"."cancelado_em" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "portal_preferencias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"silencio_inicio" time,
	"silencio_fim" time,
	"email_chamados" boolean DEFAULT true NOT NULL,
	"email_eventos" boolean DEFAULT true NOT NULL,
	"email_avisos" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_preferencias_silencio_chk" CHECK (("portal_preferencias"."silencio_inicio" IS NULL) = ("portal_preferencias"."silencio_fim" IS NULL) AND ("portal_preferencias"."silencio_inicio" IS NULL OR "portal_preferencias"."silencio_inicio" <> "portal_preferencias"."silencio_fim"))
);
--> statement-breakpoint
CREATE TABLE "portal_push_inscricoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"chave_p256dh" text NOT NULL,
	"chave_auth" text NOT NULL,
	"agente" text,
	"ultimo_envio_em" timestamp with time zone,
	"falhas" smallint DEFAULT 0 NOT NULL,
	"revogada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_avisos_limite_semanal" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "aviso_empresas" ADD CONSTRAINT "aviso_empresas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_empresas" ADD CONSTRAINT "aviso_empresas_aviso_id_avisos_id_fk" FOREIGN KEY ("aviso_id") REFERENCES "public"."avisos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_empresas" ADD CONSTRAINT "aviso_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_entregas" ADD CONSTRAINT "aviso_entregas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_entregas" ADD CONSTRAINT "aviso_entregas_aviso_id_avisos_id_fk" FOREIGN KEY ("aviso_id") REFERENCES "public"."avisos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_entregas" ADD CONSTRAINT "aviso_entregas_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_entregas" ADD CONSTRAINT "aviso_entregas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_preferencias" ADD CONSTRAINT "portal_preferencias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_preferencias" ADD CONSTRAINT "portal_preferencias_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_inscricoes" ADD CONSTRAINT "portal_push_inscricoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_push_inscricoes" ADD CONSTRAINT "portal_push_inscricoes_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aviso_empresas_uq" ON "aviso_empresas" USING btree ("aviso_id","empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aviso_entregas_uq" ON "aviso_entregas" USING btree ("aviso_id","acesso_id");--> statement-breakpoint
CREATE INDEX "aviso_entregas_push_idx" ON "aviso_entregas" USING btree ("push_enviar_em") WHERE "aviso_entregas"."push_enviar_em" IS NOT NULL AND "aviso_entregas"."push_enviado_em" IS NULL;--> statement-breakpoint
CREATE INDEX "aviso_entregas_notificacao_idx" ON "aviso_entregas" USING btree ("notificacao_id") WHERE "aviso_entregas"."notificacao_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "avisos_lista_idx" ON "avisos" USING btree ("tenant_id","enviar_em");--> statement-breakpoint
CREATE INDEX "avisos_a_enviar_idx" ON "avisos" USING btree ("enviar_em") WHERE "avisos"."situacao" = 'agendado';--> statement-breakpoint
CREATE UNIQUE INDEX "portal_preferencias_acesso_uq" ON "portal_preferencias" USING btree ("acesso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_push_endpoint_uq" ON "portal_push_inscricoes" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "portal_push_acesso_idx" ON "portal_push_inscricoes" USING btree ("acesso_id") WHERE "portal_push_inscricoes"."revogada_em" IS NULL;--> statement-breakpoint

-- Portal do Cliente, Fase 3E: avisos, preferências e push. Só expansão. RLS por empresa (tenant) e, para a sessão do
-- portal, políticas restritivas (mesmo desenho das 0032 e seguintes). `avisos` e `aviso_empresas` ficam negadas ao
-- portal (só a equipe e o worker); o cliente lê e marca como lida a PRÓPRIA entrega, cuida das próprias preferências e
-- das próprias inscrições de push.
SELECT aplicar_rls_tenant('avisos');--> statement-breakpoint
SELECT aplicar_rls_tenant('aviso_empresas');--> statement-breakpoint
SELECT aplicar_rls_tenant('aviso_entregas');--> statement-breakpoint
SELECT aplicar_rls_tenant('portal_preferencias');--> statement-breakpoint
SELECT aplicar_rls_tenant('portal_push_inscricoes');--> statement-breakpoint

DROP POLICY portal_negado ON aviso_entregas;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON aviso_entregas AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_upd ON aviso_entregas AS RESTRICTIVE FOR UPDATE
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON aviso_entregas AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON aviso_entregas AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

DROP POLICY portal_negado ON portal_preferencias;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON portal_preferencias AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON portal_preferencias AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_upd ON portal_preferencias AS RESTRICTIVE FOR UPDATE
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON portal_preferencias AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

DROP POLICY portal_negado ON portal_push_inscricoes;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON portal_push_inscricoes AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON portal_push_inscricoes AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_upd ON portal_push_inscricoes AS RESTRICTIVE FOR UPDATE
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_del ON portal_push_inscricoes AS RESTRICTIVE FOR DELETE
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint

-- O worker (sem empresa na sessão) descobre, em todas as empresas, os avisos que chegaram na hora e os pushes que
-- já podem sair. Mesmo padrão das limpezas (0009): política só para o dono, travada numa variável que só a função
-- liga e desliga. Só LÊ; quem muda é o worker, dentro da empresa do registro.
CREATE POLICY avisos_varredura_le ON avisos FOR SELECT TO leadtogo_owner
  USING (current_setting('app.varrendo_avisos', true) = '1');--> statement-breakpoint
CREATE POLICY aviso_entregas_varredura_le ON aviso_entregas FOR SELECT TO leadtogo_owner
  USING (current_setting('app.varrendo_avisos', true) = '1');--> statement-breakpoint
CREATE FUNCTION app_avisos_a_enviar()
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.varrendo_avisos', '1', true);
  RETURN QUERY
    SELECT a.id, a.tenant_id FROM public.avisos a
    WHERE a.situacao = 'agendado' AND a.excluido_em IS NULL AND a.enviar_em <= pg_catalog.now()
    ORDER BY a.enviar_em LIMIT 200;
  PERFORM pg_catalog.set_config('app.varrendo_avisos', '', true);
END
$$;--> statement-breakpoint
CREATE FUNCTION app_pushes_pendentes()
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.varrendo_avisos', '1', true);
  RETURN QUERY
    SELECT e.id, e.tenant_id FROM public.aviso_entregas e
    WHERE e.push_enviar_em IS NOT NULL AND e.push_enviar_em <= pg_catalog.now() AND e.push_enviado_em IS NULL
    ORDER BY e.push_enviar_em LIMIT 200;
  PERFORM pg_catalog.set_config('app.varrendo_avisos', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_avisos_a_enviar(), app_pushes_pendentes() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_avisos_a_enviar(), app_pushes_pendentes() TO leadtogo_app;
