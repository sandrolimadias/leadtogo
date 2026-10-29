CREATE TABLE "buscas_recentes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"termo" varchar(100) NOT NULL,
	"termo_comparavel" varchar(100) NOT NULL,
	"buscado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	CONSTRAINT "buscas_recentes_termo_chk" CHECK (char_length("buscas_recentes"."termo") BETWEEN 2 AND 100)
);
--> statement-breakpoint
ALTER TABLE "buscas_recentes" ADD CONSTRAINT "buscas_recentes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buscas_recentes" ADD CONSTRAINT "buscas_recentes_membro_id_membros_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."membros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buscas_recentes" ADD CONSTRAINT "buscas_recentes_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buscas_recentes" ADD CONSTRAINT "buscas_recentes_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buscas_recentes_termo_uq" ON "buscas_recentes" USING btree ("tenant_id","membro_id","termo_comparavel");--> statement-breakpoint
CREATE INDEX "buscas_recentes_lista_idx" ON "buscas_recentes" USING btree ("tenant_id","membro_id","buscado_em" DESC NULLS LAST);--> statement-breakpoint

-- Busca global (docs/plano_busca_global.md). Só expansão.
-- Busca das oportunidades pelo título, sem acento e sem diferença de caixa (empresas e contatos já têm, 0017 e 0018)
CREATE INDEX "oportunidades_titulo_trgm_idx" ON "oportunidades" USING gin (lower(f_unaccent("titulo")) gin_trgm_ops);--> statement-breakpoint

-- Buscas recentes: RLS padrão (o tenant); a restrição ao próprio membro fica na API
SELECT aplicar_rls_tenant('buscas_recentes');
