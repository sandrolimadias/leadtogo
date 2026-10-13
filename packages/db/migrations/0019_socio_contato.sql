ALTER TABLE "empresa_socios" ADD COLUMN "contato_id" uuid;--> statement-breakpoint
CREATE INDEX "empresa_socios_contato_idx" ON "empresa_socios" USING btree ("tenant_id","contato_id");--> statement-breakpoint
-- Expandir: coluna nula, sem tocar nos dados existentes. A FK fica aqui (e não no schema Drizzle) porque
-- importar `contatos` em carteira.ts faria um ciclo de módulos.
ALTER TABLE "empresa_socios" ADD CONSTRAINT "empresa_socios_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;
