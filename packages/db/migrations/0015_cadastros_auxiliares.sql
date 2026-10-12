CREATE TYPE "public"."conta_como" AS ENUM('visita', 'contato', 'nenhum');--> statement-breakpoint
CREATE TYPE "public"."cor_de_tag" AS ENUM('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink');--> statement-breakpoint
CREATE TYPE "public"."selecao_tag" AS ENUM('unica', 'multipla');--> statement-breakpoint
CREATE TYPE "public"."status_oportunidade" AS ENUM('ativo', 'conquistado', 'perdido', 'cancelado', 'suspenso');--> statement-breakpoint
CREATE TABLE "funil_fases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"funil_id" uuid NOT NULL,
	"cor" "cor_de_tag" DEFAULT 'gray' NOT NULL,
	"probabilidade_padrao" smallint DEFAULT 0 NOT NULL,
	"dias_alerta_parada" integer,
	CONSTRAINT "funil_fases_probabilidade" CHECK ("funil_fases"."probabilidade_padrao" BETWEEN 0 AND 100),
	CONSTRAINT "funil_fases_dias_alerta" CHECK ("funil_fases"."dias_alerta_parada" IS NULL OR "funil_fases"."dias_alerta_parada" > 0)
);
--> statement-breakpoint
CREATE TABLE "funis" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"padrao" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"aplica_a" "status_oportunidade"[] NOT NULL,
	CONSTRAINT "motivos_aplica_a_nao_vazio" CHECK (cardinality("motivos"."aplica_a") > 0)
);
--> statement-breakpoint
CREATE TABLE "origens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"chave_sistema" text
);
--> statement-breakpoint
CREATE TABLE "solucoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"cor" "cor_de_tag" DEFAULT 'gray' NOT NULL,
	"descricao" text
);
--> statement-breakpoint
CREATE TABLE "tag_grupos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"selecao" "selecao_tag" DEFAULT 'multipla' NOT NULL,
	"obrigatorio" boolean DEFAULT false NOT NULL,
	"sistema" boolean DEFAULT false NOT NULL,
	"automatico" boolean DEFAULT false NOT NULL,
	"chave_sistema" text
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"tag_grupo_id" uuid NOT NULL,
	"cor" "cor_de_tag" DEFAULT 'gray' NOT NULL,
	"chave_sistema" text
);
--> statement-breakpoint
CREATE TABLE "tipos_atividade" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"icone" varchar(40) NOT NULL,
	"cor" "cor_de_tag" DEFAULT 'gray' NOT NULL,
	"conta_como" "conta_como" DEFAULT 'nenhum' NOT NULL,
	"exige_empresa" boolean DEFAULT true NOT NULL,
	"sincroniza_agenda" boolean DEFAULT false NOT NULL,
	"chave_sistema" text
);
--> statement-breakpoint
CREATE TABLE "verticais" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	"cor" "cor_de_tag" DEFAULT 'gray' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funil_fases" ADD CONSTRAINT "funil_fases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funil_fases" ADD CONSTRAINT "funil_fases_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funil_fases" ADD CONSTRAINT "funil_fases_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funil_fases" ADD CONSTRAINT "funil_fases_funil_id_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."funis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funis" ADD CONSTRAINT "funis_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funis" ADD CONSTRAINT "funis_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funis" ADD CONSTRAINT "funis_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motivos" ADD CONSTRAINT "motivos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motivos" ADD CONSTRAINT "motivos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motivos" ADD CONSTRAINT "motivos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origens" ADD CONSTRAINT "origens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origens" ADD CONSTRAINT "origens_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origens" ADD CONSTRAINT "origens_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solucoes" ADD CONSTRAINT "solucoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solucoes" ADD CONSTRAINT "solucoes_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solucoes" ADD CONSTRAINT "solucoes_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_grupos" ADD CONSTRAINT "tag_grupos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_grupos" ADD CONSTRAINT "tag_grupos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_grupos" ADD CONSTRAINT "tag_grupos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tag_grupo_id_tag_grupos_id_fk" FOREIGN KEY ("tag_grupo_id") REFERENCES "public"."tag_grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_atividade" ADD CONSTRAINT "tipos_atividade_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_atividade" ADD CONSTRAINT "tipos_atividade_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_atividade" ADD CONSTRAINT "tipos_atividade_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verticais" ADD CONSTRAINT "verticais_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verticais" ADD CONSTRAINT "verticais_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verticais" ADD CONSTRAINT "verticais_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "funil_fases_nome_uq" ON "funil_fases" USING btree ("tenant_id","funil_id",lower("nome")) WHERE "funil_fases"."excluido_em" IS NULL;--> statement-breakpoint
CREATE INDEX "funil_fases_funil_idx" ON "funil_fases" USING btree ("tenant_id","funil_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "funis_nome_uq" ON "funis" USING btree ("tenant_id",lower("nome")) WHERE "funis"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "funis_padrao_uq" ON "funis" USING btree ("tenant_id") WHERE "funis"."padrao" AND "funis"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "motivos_nome_uq" ON "motivos" USING btree ("tenant_id",lower("nome")) WHERE "motivos"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "origens_nome_uq" ON "origens" USING btree ("tenant_id",lower("nome")) WHERE "origens"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "origens_chave_sistema_uq" ON "origens" USING btree ("tenant_id","chave_sistema") WHERE "origens"."chave_sistema" IS NOT NULL AND "origens"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "solucoes_nome_uq" ON "solucoes" USING btree ("tenant_id",lower("nome")) WHERE "solucoes"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_grupos_nome_uq" ON "tag_grupos" USING btree ("tenant_id",lower("nome")) WHERE "tag_grupos"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_grupos_chave_sistema_uq" ON "tag_grupos" USING btree ("tenant_id","chave_sistema") WHERE "tag_grupos"."chave_sistema" IS NOT NULL AND "tag_grupos"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_nome_uq" ON "tags" USING btree ("tenant_id","tag_grupo_id",lower("nome")) WHERE "tags"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_chave_sistema_uq" ON "tags" USING btree ("tenant_id","chave_sistema") WHERE "tags"."chave_sistema" IS NOT NULL AND "tags"."excluido_em" IS NULL;--> statement-breakpoint
CREATE INDEX "tags_grupo_idx" ON "tags" USING btree ("tenant_id","tag_grupo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_atividade_nome_uq" ON "tipos_atividade" USING btree ("tenant_id",lower("nome")) WHERE "tipos_atividade"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_atividade_chave_sistema_uq" ON "tipos_atividade" USING btree ("tenant_id","chave_sistema") WHERE "tipos_atividade"."chave_sistema" IS NOT NULL AND "tipos_atividade"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "verticais_nome_uq" ON "verticais" USING btree ("tenant_id",lower("nome")) WHERE "verticais"."excluido_em" IS NULL;--> statement-breakpoint
-- RLS padrão: cada empresa lê e grava só os cadastros dela.
SELECT aplicar_rls_tenant('verticais');
--> statement-breakpoint
SELECT aplicar_rls_tenant('solucoes');
--> statement-breakpoint
SELECT aplicar_rls_tenant('origens');
--> statement-breakpoint
SELECT aplicar_rls_tenant('motivos');
--> statement-breakpoint
SELECT aplicar_rls_tenant('tag_grupos');
--> statement-breakpoint
SELECT aplicar_rls_tenant('tags');
--> statement-breakpoint
SELECT aplicar_rls_tenant('tipos_atividade');
--> statement-breakpoint
SELECT aplicar_rls_tenant('funis');
--> statement-breakpoint
SELECT aplicar_rls_tenant('funil_fases');
