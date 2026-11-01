ALTER TYPE "public"."alcance_publicacao" ADD VALUE 'tags';--> statement-breakpoint
ALTER TYPE "public"."alcance_documento" ADD VALUE 'tags';--> statement-breakpoint
ALTER TYPE "public"."alcance_evento" ADD VALUE 'tags';--> statement-breakpoint
ALTER TYPE "public"."alcance_aviso" ADD VALUE 'tags';--> statement-breakpoint
CREATE TABLE "aviso_tags" (
	"tenant_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"aplicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_por" uuid,
	"aviso_id" uuid NOT NULL,
	CONSTRAINT "aviso_tags_aviso_id_tag_id_pk" PRIMARY KEY("aviso_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "documento_tags" (
	"tenant_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"aplicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_por" uuid,
	"documento_id" uuid NOT NULL,
	CONSTRAINT "documento_tags_documento_id_tag_id_pk" PRIMARY KEY("documento_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "evento_tags" (
	"tenant_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"aplicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_por" uuid,
	"evento_id" uuid NOT NULL,
	CONSTRAINT "evento_tags_evento_id_tag_id_pk" PRIMARY KEY("evento_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "publicacao_tags" (
	"tenant_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"aplicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_por" uuid,
	"publicacao_id" uuid NOT NULL,
	CONSTRAINT "publicacao_tags_publicacao_id_tag_id_pk" PRIMARY KEY("publicacao_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "aviso_tags" ADD CONSTRAINT "aviso_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_tags" ADD CONSTRAINT "aviso_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_tags" ADD CONSTRAINT "aviso_tags_aplicada_por_membros_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_tags" ADD CONSTRAINT "aviso_tags_aviso_id_avisos_id_fk" FOREIGN KEY ("aviso_id") REFERENCES "public"."avisos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_tags" ADD CONSTRAINT "documento_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_tags" ADD CONSTRAINT "documento_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_tags" ADD CONSTRAINT "documento_tags_aplicada_por_membros_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_tags" ADD CONSTRAINT "documento_tags_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_tags" ADD CONSTRAINT "evento_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_tags" ADD CONSTRAINT "evento_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_tags" ADD CONSTRAINT "evento_tags_aplicada_por_membros_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_tags" ADD CONSTRAINT "evento_tags_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_tags" ADD CONSTRAINT "publicacao_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_tags" ADD CONSTRAINT "publicacao_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_tags" ADD CONSTRAINT "publicacao_tags_aplicada_por_membros_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_tags" ADD CONSTRAINT "publicacao_tags_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aviso_tags_tag_idx" ON "aviso_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint
CREATE INDEX "documento_tags_tag_idx" ON "documento_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint
CREATE INDEX "evento_tags_tag_idx" ON "evento_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint
CREATE INDEX "publicacao_tags_tag_idx" ON "publicacao_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint

-- Portal, Fase 4C (docs/plano_portal_formularios_e_eventos.md, B-9, B-12, B-22). Só expansão: valor novo nos
-- enums de alcance e tabelas novas. O valor 'tags' não é usado como literal do enum nesta migração (as políticas
-- comparam `alcance::text`), então pode entrar na mesma transação do ALTER TYPE.
SELECT aplicar_rls_tenant('publicacao_tags');--> statement-breakpoint
SELECT aplicar_rls_tenant('evento_tags');--> statement-breakpoint
SELECT aplicar_rls_tenant('documento_tags');--> statement-breakpoint
SELECT aplicar_rls_tenant('aviso_tags');--> statement-breakpoint

-- Só tags de grupos de CONTATO (a mesma garantia de contato_tags)
CREATE OR REPLACE FUNCTION app_conferir_alvo_da_tag() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  esperado public.alvo_de_tag := CASE TG_TABLE_NAME
    WHEN 'contato_tags' THEN 'contato'
    WHEN 'publicacao_tags' THEN 'contato'
    WHEN 'evento_tags' THEN 'contato'
    WHEN 'documento_tags' THEN 'contato'
    WHEN 'aviso_tags' THEN 'contato'
    WHEN 'oportunidade_tags' THEN 'oportunidade'
    ELSE 'empresa'
  END;
  encontrado public.alvo_de_tag;
BEGIN
  SELECT g.aplica_a INTO encontrado
    FROM public.tags t JOIN public.tag_grupos g ON g.id = t.tag_grupo_id
   WHERE t.id = NEW.tag_id;
  IF encontrado IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'A tag % não é de um grupo de tags de %', NEW.tag_id, esperado
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tag_do_alvo_certo';
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER publicacao_tags_alvo AFTER INSERT OR UPDATE OF tag_id ON publicacao_tags
  FOR EACH ROW EXECUTE FUNCTION app_conferir_alvo_da_tag();--> statement-breakpoint
CREATE TRIGGER evento_tags_alvo AFTER INSERT OR UPDATE OF tag_id ON evento_tags
  FOR EACH ROW EXECUTE FUNCTION app_conferir_alvo_da_tag();--> statement-breakpoint
CREATE TRIGGER documento_tags_alvo AFTER INSERT OR UPDATE OF tag_id ON documento_tags
  FOR EACH ROW EXECUTE FUNCTION app_conferir_alvo_da_tag();--> statement-breakpoint
CREATE TRIGGER aviso_tags_alvo AFTER INSERT OR UPDATE OF tag_id ON aviso_tags
  FOR EACH ROW EXECUTE FUNCTION app_conferir_alvo_da_tag();--> statement-breakpoint

-- A sessão do portal lê só as tags do PRÓPRIO contato (para as políticas abaixo); nunca grava. A API do portal
-- não devolve tags ao cliente (DTOs em lista de permissão).
DROP POLICY portal_negado ON contato_tags;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON contato_tags AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR contato_id = app_portal_contato());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON contato_tags AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON contato_tags AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON contato_tags AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- O contato da sessão tem alguma das tags? (só leitura do próprio contato; STABLE para o planejador)
CREATE FUNCTION app_portal_tem_tag(p_tags uuid[]) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  SELECT EXISTS (SELECT 1 FROM public.contato_tags ct
                 WHERE ct.contato_id = public.app_portal_contato() AND ct.tag_id = ANY (p_tags))
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_portal_tem_tag(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_tem_tag(uuid[]) TO leadtogo_app, leadtogo_owner;--> statement-breakpoint

-- Vínculos de tag dos itens: o portal lê só os das tags que ele tem; nunca grava
DO $$
DECLARE
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['publicacao_tags', 'evento_tags', 'documento_tags', 'aviso_tags']
  LOOP
    EXECUTE format('DROP POLICY portal_negado ON %I', nome);
    EXECUTE format('CREATE POLICY portal_escopo_sel ON %I AS RESTRICTIVE FOR SELECT USING (NOT app_portal_ativo() OR app_portal_tem_tag(ARRAY[tag_id]))', nome);
    EXECUTE format('CREATE POLICY portal_so_leitura_ins ON %I AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo())', nome);
    EXECUTE format('CREATE POLICY portal_so_leitura_upd ON %I AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo())', nome);
    EXECUTE format('CREATE POLICY portal_so_leitura_del ON %I AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo())', nome);
  END LOOP;
END
$$;--> statement-breakpoint

-- O que o cliente enxerga: além de "todos" e "empresas", o alcance "tags" (basta uma das tags)
DROP POLICY portal_escopo_sel ON publicacoes;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacoes AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR (
    situacao = 'publicada' AND excluido_em IS NULL
    AND (alcance = 'todos'
      OR (alcance = 'empresas' AND EXISTS (
        SELECT 1 FROM publicacao_empresas pe
        WHERE pe.publicacao_id = publicacoes.id AND pe.empresa_id = app_portal_empresa()))
      OR (alcance::text = 'tags' AND EXISTS (
        SELECT 1 FROM publicacao_tags pt WHERE pt.publicacao_id = publicacoes.id)))));--> statement-breakpoint
DROP POLICY portal_escopo_sel ON documentos;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON documentos AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR (
    visivel_no_portal AND estado = 'limpo' AND enviado_em IS NOT NULL AND excluido_em IS NULL
    AND (alcance = 'todos'
      OR (alcance = 'empresas' AND EXISTS (
        SELECT 1 FROM documento_empresas de
        WHERE de.documento_id = documentos.id AND de.empresa_id = app_portal_empresa()))
      OR (alcance::text = 'tags' AND EXISTS (
        SELECT 1 FROM documento_tags dt WHERE dt.documento_id = documentos.id)))));--> statement-breakpoint
DROP POLICY portal_escopo_sel ON eventos;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON eventos AS RESTRICTIVE FOR SELECT TO leadtogo_app
  USING (NOT app_portal_ativo() OR (
    situacao IN ('publicado', 'cancelado') AND publicado_em IS NOT NULL AND excluido_em IS NULL
    AND (alcance = 'todos'
      OR (alcance = 'empresas' AND EXISTS (
        SELECT 1 FROM evento_empresas ee
        WHERE ee.evento_id = eventos.id AND ee.empresa_id = app_portal_empresa()))
      OR (alcance::text = 'tags' AND EXISTS (
        SELECT 1 FROM evento_tags et WHERE et.evento_id = eventos.id)))));
