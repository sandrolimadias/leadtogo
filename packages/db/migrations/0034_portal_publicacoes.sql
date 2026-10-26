CREATE TYPE "public"."alcance_publicacao" AS ENUM('todos', 'empresas');--> statement-breakpoint
CREATE TYPE "public"."motivo_denuncia_publicacao" AS ENUM('spam', 'ofensivo', 'outro');--> statement-breakpoint
CREATE TYPE "public"."situacao_comentario_publicacao" AS ENUM('visivel', 'oculto');--> statement-breakpoint
CREATE TYPE "public"."situacao_publicacao" AS ENUM('rascunho', 'agendada', 'publicada');--> statement-breakpoint
CREATE TYPE "public"."tipo_reacao_publicacao" AS ENUM('curtir', 'apoiar', 'parabens');--> statement-breakpoint
CREATE TABLE "publicacao_comentarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"autor_nome" varchar(80) NOT NULL,
	"corpo" text NOT NULL,
	"situacao" "situacao_comentario_publicacao" DEFAULT 'visivel' NOT NULL,
	"oculto_motivo" text,
	"oculto_por" uuid,
	"oculto_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publicacao_comentarios_corpo_chk" CHECK (char_length("publicacao_comentarios"."corpo") BETWEEN 1 AND 1000),
	CONSTRAINT "publicacao_comentarios_oculto_chk" CHECK (("publicacao_comentarios"."situacao" = 'oculto') = ("publicacao_comentarios"."oculto_em" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "publicacao_denuncias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"comentario_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"motivo" "motivo_denuncia_publicacao" NOT NULL,
	"tratada_por" uuid,
	"tratada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publicacao_empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publicacao_leituras" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"lida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publicacao_reacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" "tipo_reacao_publicacao" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publicacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"corpo" text NOT NULL,
	"situacao" "situacao_publicacao" DEFAULT 'rascunho' NOT NULL,
	"alcance" "alcance_publicacao" DEFAULT 'todos' NOT NULL,
	"fixada" boolean DEFAULT false NOT NULL,
	"agendada_para" timestamp with time zone,
	"publicada_em" timestamp with time zone,
	"comentarios_bloqueados" boolean DEFAULT false NOT NULL,
	"total_curtir" integer DEFAULT 0 NOT NULL,
	"total_apoiar" integer DEFAULT 0 NOT NULL,
	"total_parabens" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "publicacoes_situacao_chk" CHECK (("publicacoes"."situacao" <> 'agendada' OR "publicacoes"."agendada_para" IS NOT NULL) AND ("publicacoes"."situacao" <> 'publicada' OR "publicacoes"."publicada_em" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_comentarios_ativos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publicacao_comentarios" ADD CONSTRAINT "publicacao_comentarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_comentarios" ADD CONSTRAINT "publicacao_comentarios_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_comentarios" ADD CONSTRAINT "publicacao_comentarios_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_comentarios" ADD CONSTRAINT "publicacao_comentarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_comentarios" ADD CONSTRAINT "publicacao_comentarios_oculto_por_membros_id_fk" FOREIGN KEY ("oculto_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_denuncias" ADD CONSTRAINT "publicacao_denuncias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_denuncias" ADD CONSTRAINT "publicacao_denuncias_comentario_id_publicacao_comentarios_id_fk" FOREIGN KEY ("comentario_id") REFERENCES "public"."publicacao_comentarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_denuncias" ADD CONSTRAINT "publicacao_denuncias_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_denuncias" ADD CONSTRAINT "publicacao_denuncias_tratada_por_membros_id_fk" FOREIGN KEY ("tratada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_empresas" ADD CONSTRAINT "publicacao_empresas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_empresas" ADD CONSTRAINT "publicacao_empresas_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_empresas" ADD CONSTRAINT "publicacao_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_leituras" ADD CONSTRAINT "publicacao_leituras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_leituras" ADD CONSTRAINT "publicacao_leituras_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_leituras" ADD CONSTRAINT "publicacao_leituras_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_leituras" ADD CONSTRAINT "publicacao_leituras_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_reacoes" ADD CONSTRAINT "publicacao_reacoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_reacoes" ADD CONSTRAINT "publicacao_reacoes_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_reacoes" ADD CONSTRAINT "publicacao_reacoes_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_reacoes" ADD CONSTRAINT "publicacao_reacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publicacao_comentarios_pub_idx" ON "publicacao_comentarios" USING btree ("publicacao_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "publicacao_denuncias_uq" ON "publicacao_denuncias" USING btree ("comentario_id","acesso_id");--> statement-breakpoint
CREATE INDEX "publicacao_denuncias_abertas_idx" ON "publicacao_denuncias" USING btree ("tenant_id") WHERE "publicacao_denuncias"."tratada_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "publicacao_empresas_uq" ON "publicacao_empresas" USING btree ("publicacao_id","empresa_id");--> statement-breakpoint
CREATE INDEX "publicacao_empresas_empresa_idx" ON "publicacao_empresas" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publicacao_leituras_uq" ON "publicacao_leituras" USING btree ("publicacao_id","acesso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publicacao_reacoes_uq" ON "publicacao_reacoes" USING btree ("publicacao_id","acesso_id","tipo");--> statement-breakpoint
CREATE INDEX "publicacoes_feed_idx" ON "publicacoes" USING btree ("tenant_id","situacao","publicada_em");--> statement-breakpoint
CREATE UNIQUE INDEX "publicacoes_fixada_uq" ON "publicacoes" USING btree ("tenant_id") WHERE "publicacoes"."fixada" AND "publicacoes"."excluido_em" IS NULL;--> statement-breakpoint

-- Portal do Cliente, Fase 3B: publicações. Só expansão. RLS por empresa (tenant) e, para o portal, políticas
-- restritivas por empresa-cliente (mesmo desenho da 0032). O cliente só lê publicação PUBLICADA do alcance dele e
-- nunca grava nas tabelas da equipe; as próprias reações, comentários, denúncias e leituras ele grava.
SELECT aplicar_rls_tenant('publicacoes');--> statement-breakpoint
SELECT aplicar_rls_tenant('publicacao_empresas');--> statement-breakpoint
SELECT aplicar_rls_tenant('publicacao_reacoes');--> statement-breakpoint
SELECT aplicar_rls_tenant('publicacao_comentarios');--> statement-breakpoint
SELECT aplicar_rls_tenant('publicacao_denuncias');--> statement-breakpoint
SELECT aplicar_rls_tenant('publicacao_leituras');--> statement-breakpoint

-- Publicações e alcance: leitura escopada; a escrita é da equipe. A restrição de escrita vale só para o papel da
-- API (`TO leadtogo_app`), porque o gatilho dos totais de reação roda como dono da tabela.
DROP POLICY portal_negado ON publicacoes;--> statement-breakpoint
DROP POLICY portal_negado ON publicacao_empresas;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacao_empresas AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON publicacao_empresas AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON publicacao_empresas AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON publicacao_empresas AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacoes AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR (
    situacao = 'publicada' AND excluido_em IS NULL
    AND (alcance = 'todos' OR EXISTS (
      SELECT 1 FROM publicacao_empresas pe
      WHERE pe.publicacao_id = publicacoes.id AND pe.empresa_id = app_portal_empresa()))));--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON publicacoes AS RESTRICTIVE FOR INSERT TO leadtogo_app WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON publicacoes AS RESTRICTIVE FOR UPDATE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON publicacoes AS RESTRICTIVE FOR DELETE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint

-- Reações: o cliente enxerga e desfaz só as da empresa dele; cria só em nome do próprio acesso
DROP POLICY portal_negado ON publicacao_reacoes;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacao_reacoes AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON publicacao_reacoes AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (
    acesso_id = app_portal_acesso() AND empresa_id = app_portal_empresa()
    AND EXISTS (SELECT 1 FROM publicacoes p WHERE p.id = publicacao_id)));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON publicacao_reacoes AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_escopo_del ON publicacao_reacoes AS RESTRICTIVE FOR DELETE
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint

-- Comentários: todos os visíveis da publicação (o autor vê também o que foi ocultado, com o motivo); grava só em
-- nome próprio, em publicação aberta a comentários e com a chave geral ligada. O cliente não edita nem apaga.
DROP POLICY portal_negado ON publicacao_comentarios;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacao_comentarios AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR (
    (situacao = 'visivel' OR acesso_id = app_portal_acesso())
    AND EXISTS (SELECT 1 FROM publicacoes p WHERE p.id = publicacao_id)));--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON publicacao_comentarios AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (
    acesso_id = app_portal_acesso() AND empresa_id = app_portal_empresa() AND situacao = 'visivel'
    AND EXISTS (SELECT 1 FROM publicacoes p WHERE p.id = publicacao_id AND NOT p.comentarios_bloqueados)
    AND coalesce((SELECT tc.portal_comentarios_ativos FROM tenant_configuracoes tc
                  WHERE tc.tenant_id = publicacao_comentarios.tenant_id), true)));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON publicacao_comentarios AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON publicacao_comentarios AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- Denúncias: o cliente vê só as próprias e denuncia comentário que ele enxerga, em nome próprio
DROP POLICY portal_negado ON publicacao_denuncias;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacao_denuncias AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON publicacao_denuncias AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (
    acesso_id = app_portal_acesso()
    AND EXISTS (SELECT 1 FROM publicacao_comentarios c WHERE c.id = comentario_id)));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON publicacao_denuncias AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON publicacao_denuncias AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- Leituras: o cliente registra e vê só as próprias
DROP POLICY portal_negado ON publicacao_leituras;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacao_leituras AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON publicacao_leituras AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (
    acesso_id = app_portal_acesso() AND empresa_id = app_portal_empresa()
    AND EXISTS (SELECT 1 FROM publicacoes p WHERE p.id = publicacao_id)));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON publicacao_leituras AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON publicacao_leituras AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- Totais de reação por publicação: o cliente vê o total (de todas as empresas), nunca quem reagiu. O gatilho roda
-- como dono da tabela (a sessão do portal não atualiza `publicacoes`).
CREATE FUNCTION app_publicacao_reacao_total() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  alvo uuid;
  tipo_alvo public.tipo_reacao_publicacao;
  passo integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    alvo := NEW.publicacao_id; tipo_alvo := NEW.tipo; passo := 1;
  ELSE
    alvo := OLD.publicacao_id; tipo_alvo := OLD.tipo; passo := -1;
  END IF;
  UPDATE public.publicacoes SET
    total_curtir = greatest(total_curtir + CASE WHEN tipo_alvo = 'curtir' THEN passo ELSE 0 END, 0),
    total_apoiar = greatest(total_apoiar + CASE WHEN tipo_alvo = 'apoiar' THEN passo ELSE 0 END, 0),
    total_parabens = greatest(total_parabens + CASE WHEN tipo_alvo = 'parabens' THEN passo ELSE 0 END, 0)
  WHERE id = alvo;
  RETURN NULL;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_publicacao_reacao_total() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER publicacao_reacoes_total AFTER INSERT OR DELETE ON publicacao_reacoes
  FOR EACH ROW EXECUTE FUNCTION app_publicacao_reacao_total();--> statement-breakpoint

-- Publicação agendada: o worker (sem empresa na sessão) publica as que venceram, em todas as empresas. Mesmo
-- padrão das limpezas (0009): política só para o dono, travada numa variável que só a função liga e desliga.
CREATE POLICY publicacoes_agendadas_le ON publicacoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.publicando_agendadas', true) = '1');--> statement-breakpoint
CREATE POLICY publicacoes_agendadas_publica ON publicacoes FOR UPDATE TO leadtogo_owner
  USING (current_setting('app.publicando_agendadas', true) = '1' AND situacao = 'agendada')
  WITH CHECK (situacao = 'publicada');--> statement-breakpoint
CREATE FUNCTION app_publicar_agendadas()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_catalog.set_config('app.publicando_agendadas', '1', true);
  UPDATE public.publicacoes SET situacao = 'publicada', publicada_em = agendada_para, atualizado_em = pg_catalog.now()
  WHERE situacao = 'agendada' AND agendada_para <= pg_catalog.now() AND excluido_em IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.publicando_agendadas', '', true);
  RETURN n;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_publicar_agendadas() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_publicar_agendadas() TO leadtogo_app;
