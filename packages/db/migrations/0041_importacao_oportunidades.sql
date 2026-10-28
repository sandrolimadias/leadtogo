ALTER TYPE "public"."tipo_importacao" ADD VALUE 'oportunidades';--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "importacao_id" uuid;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD COLUMN "oportunidade_id" uuid;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD CONSTRAINT "importacao_linhas_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oportunidades_importacao_idx" ON "oportunidades" USING btree ("tenant_id","importacao_id");