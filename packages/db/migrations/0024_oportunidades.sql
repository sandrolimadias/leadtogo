CREATE TYPE "public"."acao_historico_oportunidade" AS ENUM('criada', 'fase', 'status', 'reaberta');--> statement-breakpoint
CREATE TABLE "oportunidade_historico" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"acao" "acao_historico_oportunidade" NOT NULL,
	"fase_de_id" uuid,
	"fase_para_id" uuid,
	"status_de" "status_oportunidade",
	"status_para" "status_oportunidade",
	"motivo_id" uuid,
	"detalhe" text,
	"por" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oportunidades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	"contato_id" uuid,
	"solucao_id" uuid,
	"origem_id" uuid,
	"funil_id" uuid NOT NULL,
	"fase_id" uuid NOT NULL,
	"status" "status_oportunidade" DEFAULT 'ativo' NOT NULL,
	"fase_parou_em_id" uuid,
	"motivo_id" uuid,
	"motivo_detalhe" text,
	"suspensa_ate" date,
	"atividade_retomada_id" uuid,
	"responsavel_id" uuid NOT NULL,
	"valor_unico" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_mensal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"meses" integer DEFAULT 0 NOT NULL,
	"valor_total" numeric(15, 2) GENERATED ALWAYS AS (valor_unico + valor_mensal * meses) STORED NOT NULL,
	"probabilidade" smallint DEFAULT 0 NOT NULL,
	"probabilidade_manual" boolean DEFAULT false NOT NULL,
	"valor_ponderado" numeric(15, 2) GENERATED ALWAYS AS (round((valor_unico + valor_mensal * meses) * probabilidade / 100, 2)) STORED NOT NULL,
	"data_prevista_fechamento" date,
	"data_fechamento" timestamp with time zone,
	"fase_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_atividade_em" timestamp with time zone,
	"proxima_atividade_id" uuid,
	"proxima_atividade_em" timestamp with time zone,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "oportunidades_probabilidade" CHECK ("oportunidades"."probabilidade" BETWEEN 0 AND 100),
	CONSTRAINT "oportunidades_valores" CHECK ("oportunidades"."valor_unico" >= 0 AND "oportunidades"."valor_mensal" >= 0),
	CONSTRAINT "oportunidades_meses" CHECK ("oportunidades"."meses" >= 0),
	CONSTRAINT "oportunidades_fechamento" CHECK (("oportunidades"."status" = 'ativo') = ("oportunidades"."fase_parou_em_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "atividades" ADD COLUMN "oportunidade_id" uuid;--> statement-breakpoint
ALTER TABLE "oportunidade_historico" ADD CONSTRAINT "oportunidade_historico_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_historico" ADD CONSTRAINT "oportunidade_historico_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_historico" ADD CONSTRAINT "oportunidade_historico_fase_de_id_funil_fases_id_fk" FOREIGN KEY ("fase_de_id") REFERENCES "public"."funil_fases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_historico" ADD CONSTRAINT "oportunidade_historico_fase_para_id_funil_fases_id_fk" FOREIGN KEY ("fase_para_id") REFERENCES "public"."funil_fases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_historico" ADD CONSTRAINT "oportunidade_historico_motivo_id_motivos_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_historico" ADD CONSTRAINT "oportunidade_historico_por_membros_id_fk" FOREIGN KEY ("por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_solucao_id_solucoes_id_fk" FOREIGN KEY ("solucao_id") REFERENCES "public"."solucoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_origem_id_origens_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."origens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_funil_id_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."funis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_fase_id_funil_fases_id_fk" FOREIGN KEY ("fase_id") REFERENCES "public"."funil_fases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_fase_parou_em_id_funil_fases_id_fk" FOREIGN KEY ("fase_parou_em_id") REFERENCES "public"."funil_fases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_motivo_id_motivos_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsavel_id_membros_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oportunidade_historico_idx" ON "oportunidade_historico" USING btree ("tenant_id","oportunidade_id","em");--> statement-breakpoint
CREATE INDEX "oportunidades_status_idx" ON "oportunidades" USING btree ("tenant_id","status","funil_id","fase_id");--> statement-breakpoint
CREATE INDEX "oportunidades_responsavel_idx" ON "oportunidades" USING btree ("tenant_id","responsavel_id","status");--> statement-breakpoint
CREATE INDEX "oportunidades_empresa_idx" ON "oportunidades" USING btree ("tenant_id","empresa_id");--> statement-breakpoint
CREATE INDEX "oportunidades_previsao_idx" ON "oportunidades" USING btree ("tenant_id","data_prevista_fechamento");--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atividades_oportunidade_idx" ON "atividades" USING btree ("tenant_id","oportunidade_id");--> statement-breakpoint
-- A oportunidade aponta para a próxima atividade e para a de retomada. As FKs só existem no SQL
-- (importar `atividades` no schema de `oportunidades` faria um ciclo), como em `empresas`.
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_proxima_atividade_id_atividades_id_fk" FOREIGN KEY ("proxima_atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_atividade_retomada_id_atividades_id_fk" FOREIGN KEY ("atividade_retomada_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RLS padrão: cada empresa (tenant) lê e grava só as próprias oportunidades.
SELECT aplicar_rls_tenant('oportunidades');--> statement-breakpoint
SELECT aplicar_rls_tenant('oportunidade_historico');
