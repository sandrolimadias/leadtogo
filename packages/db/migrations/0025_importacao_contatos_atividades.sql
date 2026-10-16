ALTER TYPE "public"."origem_atividade" ADD VALUE 'importacao';--> statement-breakpoint
ALTER TYPE "public"."resultado_da_linha" ADD VALUE 'vinculada';--> statement-breakpoint
ALTER TYPE "public"."resultado_da_linha" ADD VALUE 'ja_vinculada';--> statement-breakpoint
ALTER TYPE "public"."resultado_da_linha" ADD VALUE 'pulada_empresa_inexistente';--> statement-breakpoint
ALTER TYPE "public"."resultado_da_linha" ADD VALUE 'pulada_tipo_inexistente';--> statement-breakpoint
ALTER TYPE "public"."resultado_da_linha" ADD VALUE 'pulada_no_futuro';--> statement-breakpoint
ALTER TYPE "public"."resultado_da_linha" ADD VALUE 'pulada_invalida';--> statement-breakpoint
ALTER TYPE "public"."tipo_importacao" ADD VALUE 'atividades';--> statement-breakpoint
ALTER TABLE "contatos" ADD COLUMN "importacao_id" uuid;--> statement-breakpoint
ALTER TABLE "empresa_contatos" ADD COLUMN "importacao_id" uuid;--> statement-breakpoint
ALTER TABLE "atividades" ADD COLUMN "importacao_id" uuid;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD COLUMN "contato_id" uuid;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD COLUMN "atividade_id" uuid;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD COLUMN "avisos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD CONSTRAINT "importacao_linhas_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD CONSTRAINT "importacao_linhas_atividade_id_atividades_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contatos_importacao_idx" ON "contatos" USING btree ("tenant_id","importacao_id");--> statement-breakpoint
CREATE INDEX "empresa_contatos_importacao_idx" ON "empresa_contatos" USING btree ("tenant_id","importacao_id");--> statement-breakpoint
CREATE INDEX "atividades_importacao_idx" ON "atividades" USING btree ("tenant_id","importacao_id");