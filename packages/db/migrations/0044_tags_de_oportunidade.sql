ALTER TYPE "public"."alvo_de_tag" ADD VALUE 'oportunidade';--> statement-breakpoint
CREATE TABLE "oportunidade_tags" (
	"tenant_id" uuid NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"aplicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_por" uuid,
	CONSTRAINT "oportunidade_tags_oportunidade_id_tag_id_pk" PRIMARY KEY("oportunidade_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "oportunidade_tags" ADD CONSTRAINT "oportunidade_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_tags" ADD CONSTRAINT "oportunidade_tags_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_tags" ADD CONSTRAINT "oportunidade_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_tags" ADD CONSTRAINT "oportunidade_tags_aplicada_por_membros_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oportunidade_tags_tag_idx" ON "oportunidade_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint

-- Tags da oportunidade (docs/plano_oportunidades_kanban_e_tags.md). Só expansão: valor novo no enum e tabela nova.
-- O valor 'oportunidade' não é usado por nenhum comando desta migração (o corpo da função só o lê ao rodar),
-- então pode entrar na mesma transação do ALTER TYPE.
SELECT aplicar_rls_tenant('oportunidade_tags');--> statement-breakpoint

-- A mesma garantia final de 0043, agora com o terceiro destino.
CREATE OR REPLACE FUNCTION app_conferir_alvo_da_tag() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  esperado public.alvo_de_tag := CASE TG_TABLE_NAME
    WHEN 'contato_tags' THEN 'contato'
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
CREATE TRIGGER oportunidade_tags_alvo AFTER INSERT OR UPDATE OF tag_id ON oportunidade_tags
  FOR EACH ROW EXECUTE FUNCTION app_conferir_alvo_da_tag();
