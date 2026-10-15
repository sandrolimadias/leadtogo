CREATE TYPE "public"."origem_atividade" AS ENUM('manual', 'whatsapp', 'email', 'agenda', 'api', 'recorrencia');--> statement-breakpoint
CREATE TYPE "public"."situacao_atividade" AS ENUM('pendente', 'em_execucao', 'realizada', 'cancelada');--> statement-breakpoint
CREATE TABLE "atividades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo_atividade_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"empresa_id" uuid,
	"contato_id" uuid,
	"responsavel_id" uuid NOT NULL,
	"data_inicio" timestamp with time zone NOT NULL,
	"data_fim" timestamp with time zone,
	"dia_inteiro" boolean DEFAULT false NOT NULL,
	"situacao" "situacao_atividade" DEFAULT 'pendente' NOT NULL,
	"realizada_em" timestamp with time zone,
	"resultado" text,
	"importante" boolean DEFAULT false NOT NULL,
	"urgente" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"origem" "origem_atividade" DEFAULT 'manual' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "atividades_realizada_em" CHECK (("atividades"."situacao" = 'realizada') = ("atividades"."realizada_em" IS NOT NULL)),
	CONSTRAINT "atividades_realizada_resultado" CHECK ("atividades"."situacao" <> 'realizada' OR length(btrim(coalesce("atividades"."resultado", ''))) > 0),
	CONSTRAINT "atividades_fim" CHECK ("atividades"."data_fim" IS NULL OR "atividades"."data_fim" >= "atividades"."data_inicio")
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_tipo_atividade_id_tipos_atividade_id_fk" FOREIGN KEY ("tipo_atividade_id") REFERENCES "public"."tipos_atividade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_responsavel_id_membros_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atividades_responsavel_idx" ON "atividades" USING btree ("tenant_id","responsavel_id","situacao","data_inicio");--> statement-breakpoint
CREATE INDEX "atividades_empresa_idx" ON "atividades" USING btree ("tenant_id","empresa_id","data_inicio" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "atividades_contato_idx" ON "atividades" USING btree ("tenant_id","contato_id","data_inicio" DESC NULLS LAST);--> statement-breakpoint
-- A empresa guarda a próxima atividade (calculada). A FK só existe agora que `atividades` existe; fica só
-- no SQL (importar `atividades` no schema de `empresas` faria um ciclo), como `importacao_id`.
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_proxima_atividade_id_atividades_id_fk" FOREIGN KEY ("proxima_atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD CONSTRAINT "tenant_configuracoes_fuso_horario_nao_vazio" CHECK (length(btrim("fuso_horario")) > 0);--> statement-breakpoint
-- RLS padrão: cada empresa (tenant) lê e grava só as próprias atividades.
SELECT aplicar_rls_tenant('atividades');
