CREATE TYPE "public"."alcance_documento" AS ENUM('todos', 'empresas');--> statement-breakpoint
CREATE TABLE "documento_acessos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"baixado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documento_empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"descricao" text,
	"alcance" "alcance_documento" DEFAULT 'todos' NOT NULL,
	"visivel_no_portal" boolean DEFAULT true NOT NULL,
	"chave_arquivo" text NOT NULL,
	"nome" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho" bigint NOT NULL,
	"estado" "estado_anexo" DEFAULT 'pendente_varredura' NOT NULL,
	"enviado_em" timestamp with time zone,
	"varrido_em" timestamp with time zone,
	"assinatura" text,
	"tentativas_varredura" smallint DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"total_downloads" bigint DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "documentos_tamanho_chk" CHECK ("documentos"."tamanho" BETWEEN 1 AND 26214400),
	CONSTRAINT "documentos_infectado_chk" CHECK ("documentos"."estado" <> 'infectado' OR "documentos"."assinatura" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "documento_acessos" ADD CONSTRAINT "documento_acessos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_acessos" ADD CONSTRAINT "documento_acessos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_acessos" ADD CONSTRAINT "documento_acessos_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_acessos" ADD CONSTRAINT "documento_acessos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_empresas" ADD CONSTRAINT "documento_empresas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_empresas" ADD CONSTRAINT "documento_empresas_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_empresas" ADD CONSTRAINT "documento_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documento_acessos_documento_idx" ON "documento_acessos" USING btree ("documento_id","baixado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "documento_empresas_uq" ON "documento_empresas" USING btree ("documento_id","empresa_id");--> statement-breakpoint
CREATE INDEX "documento_empresas_empresa_idx" ON "documento_empresas" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_chave_uq" ON "documentos" USING btree ("chave_arquivo");--> statement-breakpoint
CREATE INDEX "documentos_lista_idx" ON "documentos" USING btree ("tenant_id","criado_em");--> statement-breakpoint
CREATE INDEX "documentos_pendentes_idx" ON "documentos" USING btree ("criado_em") WHERE "documentos"."estado" = 'pendente_varredura' AND "documentos"."enviado_em" IS NOT NULL;--> statement-breakpoint

-- Portal do Cliente, Fase 3C: documentos. Só expansão. RLS por empresa (tenant) e, para a sessão do portal,
-- políticas restritivas por empresa-cliente (mesmo desenho das 0032 e 0034). O cliente só lê documento com o
-- arquivo "limpo", visível no portal e do alcance dele; nunca grava nas tabelas da equipe; só registra o
-- próprio download.
SELECT aplicar_rls_tenant('documentos');--> statement-breakpoint
SELECT aplicar_rls_tenant('documento_empresas');--> statement-breakpoint
SELECT aplicar_rls_tenant('documento_acessos');--> statement-breakpoint

DROP POLICY portal_negado ON documento_empresas;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON documento_empresas AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON documento_empresas AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON documento_empresas AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON documento_empresas AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- A restrição de escrita vale só para o papel da API (`TO leadtogo_app`): o gatilho do total de downloads roda
-- como dono da tabela
DROP POLICY portal_negado ON documentos;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON documentos AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR (
    visivel_no_portal AND estado = 'limpo' AND enviado_em IS NOT NULL AND excluido_em IS NULL
    AND (alcance = 'todos' OR EXISTS (
      SELECT 1 FROM documento_empresas de
      WHERE de.documento_id = documentos.id AND de.empresa_id = app_portal_empresa()))));--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON documentos AS RESTRICTIVE FOR INSERT TO leadtogo_app WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON documentos AS RESTRICTIVE FOR UPDATE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON documentos AS RESTRICTIVE FOR DELETE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint

DROP POLICY portal_negado ON documento_acessos;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON documento_acessos AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON documento_acessos AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (
    acesso_id = app_portal_acesso() AND empresa_id = app_portal_empresa()
    AND EXISTS (SELECT 1 FROM documentos d WHERE d.id = documento_id)));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON documento_acessos AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON documento_acessos AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- Total de downloads por documento (a sessão do portal não atualiza `documentos`)
CREATE FUNCTION app_documento_download_total() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  UPDATE public.documentos SET total_downloads = total_downloads + 1 WHERE id = NEW.documento_id;
  RETURN NULL;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_documento_download_total() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER documento_acessos_total AFTER INSERT ON documento_acessos
  FOR EACH ROW EXECUTE FUNCTION app_documento_download_total();
