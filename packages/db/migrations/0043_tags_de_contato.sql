CREATE TYPE "public"."alvo_de_tag" AS ENUM('empresa', 'contato');--> statement-breakpoint
CREATE TABLE "contato_tags" (
	"tenant_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"aplicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_por" uuid,
	CONSTRAINT "contato_tags_contato_id_tag_id_pk" PRIMARY KEY("contato_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "tag_grupos" ADD COLUMN "aplica_a" "alvo_de_tag" DEFAULT 'empresa' NOT NULL;--> statement-breakpoint
ALTER TABLE "contato_tags" ADD CONSTRAINT "contato_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_tags" ADD CONSTRAINT "contato_tags_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_tags" ADD CONSTRAINT "contato_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_tags" ADD CONSTRAINT "contato_tags_aplicada_por_membros_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contato_tags_tag_idx" ON "contato_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint

-- Tags do contato (docs/plano_contatos_filtros_e_tags.md). Só expansão: os grupos que já existem ficam como 'empresa'.
SELECT aplicar_rls_tenant('contato_tags');--> statement-breakpoint

-- A garantia final de que tag de contato não vai para empresa (nem a de empresa para contato), venha de onde vier.
-- Roda com a credencial de quem grava: o RLS esconde a tag de outra empresa, que também é recusada.
-- AFTER: a linha de outro tenant já cai antes, na política de RLS (com a mensagem dela).
CREATE FUNCTION app_conferir_alvo_da_tag() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  esperado public.alvo_de_tag := CASE TG_TABLE_NAME WHEN 'contato_tags' THEN 'contato' ELSE 'empresa' END;
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
CREATE TRIGGER empresa_tags_alvo AFTER INSERT OR UPDATE OF tag_id ON empresa_tags
  FOR EACH ROW EXECUTE FUNCTION app_conferir_alvo_da_tag();--> statement-breakpoint
CREATE TRIGGER contato_tags_alvo AFTER INSERT OR UPDATE OF tag_id ON contato_tags
  FOR EACH ROW EXECUTE FUNCTION app_conferir_alvo_da_tag();
