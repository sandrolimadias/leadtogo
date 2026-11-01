CREATE TYPE "public"."acesso_formulario" AS ENUM('publico', 'logado');--> statement-breakpoint
CREATE TYPE "public"."finalidade_formulario" AS ENUM('livre', 'inscricao_evento', 'avaliacao_evento', 'satisfacao_chamado', 'associacao');--> statement-breakpoint
CREATE TYPE "public"."origem_resposta_formulario" AS ENUM('portal', 'publico', 'crm');--> statement-breakpoint
CREATE TYPE "public"."situacao_acao_formulario" AS ENUM('pendente', 'ok', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."situacao_formulario" AS ENUM('rascunho', 'publicado', 'arquivado');--> statement-breakpoint
CREATE TABLE "formulario_acoes_execucoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resposta_id" uuid NOT NULL,
	"indice" smallint NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"situacao" "situacao_acao_formulario" DEFAULT 'pendente' NOT NULL,
	"tentativas" smallint DEFAULT 0 NOT NULL,
	"status_http" integer,
	"detalhe" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formulario_respostas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"origem" "origem_resposta_formulario" NOT NULL,
	"botao" varchar(40) NOT NULL,
	"respostas" jsonb NOT NULL,
	"acesso_id" uuid,
	"contato_id" uuid,
	"empresa_id" uuid,
	"contexto_tipo" varchar(40),
	"contexto_id" uuid,
	"ip" text,
	"agente" text,
	"consentimento_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "formulario_respostas_contexto_chk" CHECK (("formulario_respostas"."contexto_tipo" IS NULL) = ("formulario_respostas"."contexto_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "formulario_versoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"definicao" jsonb NOT NULL,
	"publicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"publicada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formularios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" varchar(120) NOT NULL,
	"finalidade" "finalidade_formulario" DEFAULT 'livre' NOT NULL,
	"acesso" "acesso_formulario" DEFAULT 'logado' NOT NULL,
	"situacao" "situacao_formulario" DEFAULT 'rascunho' NOT NULL,
	"slug" varchar(40) NOT NULL,
	"captcha" boolean DEFAULT true NOT NULL,
	"definicao" jsonb NOT NULL,
	"versao_publicada" integer,
	"tem_mudancas" boolean DEFAULT true NOT NULL,
	"segredo_webhook" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "formularios_publicado_chk" CHECK ("formularios"."situacao" <> 'publicado' OR "formularios"."versao_publicada" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "formulario_acoes_execucoes" ADD CONSTRAINT "formulario_acoes_execucoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_acoes_execucoes" ADD CONSTRAINT "formulario_acoes_execucoes_resposta_id_formulario_respostas_id_fk" FOREIGN KEY ("resposta_id") REFERENCES "public"."formulario_respostas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_respostas" ADD CONSTRAINT "formulario_respostas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_respostas" ADD CONSTRAINT "formulario_respostas_formulario_id_formularios_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formularios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_respostas" ADD CONSTRAINT "formulario_respostas_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_respostas" ADD CONSTRAINT "formulario_respostas_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_respostas" ADD CONSTRAINT "formulario_respostas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_versoes" ADD CONSTRAINT "formulario_versoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_versoes" ADD CONSTRAINT "formulario_versoes_formulario_id_formularios_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formularios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_versoes" ADD CONSTRAINT "formulario_versoes_publicada_por_membros_id_fk" FOREIGN KEY ("publicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formularios" ADD CONSTRAINT "formularios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formularios" ADD CONSTRAINT "formularios_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formularios" ADD CONSTRAINT "formularios_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "formulario_acoes_execucoes_uq" ON "formulario_acoes_execucoes" USING btree ("resposta_id","indice");--> statement-breakpoint
CREATE INDEX "formulario_respostas_form_idx" ON "formulario_respostas" USING btree ("formulario_id","criado_em");--> statement-breakpoint
CREATE INDEX "formulario_respostas_contexto_idx" ON "formulario_respostas" USING btree ("tenant_id","contexto_tipo","contexto_id");--> statement-breakpoint
CREATE INDEX "formulario_respostas_acesso_idx" ON "formulario_respostas" USING btree ("acesso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formulario_versoes_uq" ON "formulario_versoes" USING btree ("formulario_id","versao");--> statement-breakpoint
CREATE UNIQUE INDEX "formularios_slug_uq" ON "formularios" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "formularios_tenant_idx" ON "formularios" USING btree ("tenant_id","situacao");--> statement-breakpoint

-- Portal, Fase 4E (docs/plano_portal_formularios_e_eventos.md, seção 7). Só expansão.
SELECT aplicar_rls_tenant('formularios');--> statement-breakpoint
SELECT aplicar_rls_tenant('formulario_versoes');--> statement-breakpoint
SELECT aplicar_rls_tenant('formulario_respostas');--> statement-breakpoint
SELECT aplicar_rls_tenant('formulario_acoes_execucoes');--> statement-breakpoint

-- O cliente do portal: lê formulário PUBLICADO e as versões dele; grava e lê só as PRÓPRIAS respostas
-- (nunca altera nem apaga). As execuções das ações continuam fechadas (`portal_negado`).
DROP POLICY portal_negado ON formularios;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON formularios AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR (situacao = 'publicado' AND excluido_em IS NULL));--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON formularios AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON formularios AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON formularios AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
DROP POLICY portal_negado ON formulario_versoes;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON formulario_versoes AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR EXISTS (
    SELECT 1 FROM formularios f WHERE f.id = formulario_versoes.formulario_id));--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON formulario_versoes AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON formulario_versoes AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON formulario_versoes AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
DROP POLICY portal_negado ON formulario_respostas;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON formulario_respostas AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON formulario_respostas AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (acesso_id = app_portal_acesso() AND origem = 'portal'));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON formulario_respostas AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON formulario_respostas AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- Formulário público (/f/<slug>): o endereço chega sem o tenant. A função do dono acha o tenant de um formulário
-- PUBLICADO e PÚBLICO pelo slug (políticas só do dono, travadas em app.formulario_slug).
CREATE POLICY formulario_por_slug ON formularios FOR SELECT TO leadtogo_owner
  USING (current_setting('app.formulario_slug', true) <> '' AND slug = current_setting('app.formulario_slug', true)
    AND situacao = 'publicado' AND acesso = 'publico' AND excluido_em IS NULL);--> statement-breakpoint
CREATE FUNCTION app_formulario_publico(p_slug text)
  RETURNS TABLE (tenant_id uuid, formulario_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.formulario_slug', coalesce(p_slug, ''), true);
  RETURN QUERY SELECT f.tenant_id, f.id FROM public.formularios f
    WHERE f.slug = p_slug AND f.situacao = 'publicado' AND f.acesso = 'publico' AND f.excluido_em IS NULL;
  PERFORM pg_catalog.set_config('app.formulario_slug', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_formulario_publico(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_formulario_publico(text) TO leadtogo_app;
