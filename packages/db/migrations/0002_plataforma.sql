CREATE TYPE "public"."modo_importacao_whatsapp" AS ENUM('automatico', 'manual', 'desligado');--> statement-breakpoint
CREATE TYPE "public"."papel_conta" AS ENUM('dono', 'administrador', 'financeiro');--> statement-breakpoint
CREATE TYPE "public"."papel_membro" AS ENUM('admin', 'gestor', 'vendedor');--> statement-breakpoint
CREATE TYPE "public"."situacao_conta" AS ENUM('teste', 'ativa', 'suspensa', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."situacao_tenant" AS ENUM('teste', 'ativo', 'suspenso', 'cancelado');--> statement-breakpoint
CREATE TABLE "conta_administradores" (
	"conta_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" "papel_conta" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conta_administradores_conta_id_usuario_id_pk" PRIMARY KEY("conta_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"documento" varchar(14),
	"email_cobranca" "citext",
	"plano" text,
	"situacao" "situacao_conta" DEFAULT 'teste' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid,
	"nome" text NOT NULL,
	"cargo" text,
	"telefone" varchar(20),
	"telefone_e164" varchar(20),
	"email" "citext",
	"papel" "papel_membro" DEFAULT 'vendedor' NOT NULL,
	"gestor_id" uuid,
	"cor" char(7),
	"foto_arquivo_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"preferencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_configuracoes" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"vendedor_ve_todas_empresas" boolean DEFAULT false NOT NULL,
	"dias_sem_contato_alerta" integer DEFAULT 60 NOT NULL,
	"dias_validade_tag_visita" integer,
	"status_cliente_ao_conquistar" boolean DEFAULT true NOT NULL,
	"rastreio_email_padrao" boolean DEFAULT false NOT NULL,
	"whatsapp_modo_importacao" "modo_importacao_whatsapp" DEFAULT 'desligado' NOT NULL,
	"preferencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text,
	"cnpj" varchar(14),
	"email" text,
	"telefone" text,
	"website" text,
	"cep" text,
	"tipo_logradouro" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio_codigo" integer,
	"pais_codigo" char(2) DEFAULT 'BR',
	"logo_arquivo_id" uuid,
	"conta_id" uuid NOT NULL,
	"situacao" "situacao_tenant" DEFAULT 'teste' NOT NULL,
	"plano" text,
	"fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"moeda" char(3) DEFAULT 'BRL' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_cnpj_key" UNIQUE("cnpj")
);
--> statement-breakpoint
ALTER TABLE "conta_administradores" ADD CONSTRAINT "conta_administradores_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_gestor_id_membros_id_fk" FOREIGN KEY ("gestor_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD CONSTRAINT "tenant_configuracoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_municipio_codigo_municipios_codigo_ibge_fk" FOREIGN KEY ("municipio_codigo") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membros_tenant_email_uq" ON "membros" USING btree ("tenant_id","email") WHERE "membros"."excluido_em" IS NULL AND "membros"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "membros_tenant_usuario_uq" ON "membros" USING btree ("tenant_id","usuario_id") WHERE "membros"."excluido_em" IS NULL AND "membros"."usuario_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "membros_tenant_gestor_idx" ON "membros" USING btree ("tenant_id","gestor_id");--> statement-breakpoint
CREATE INDEX "membros_usuario_idx" ON "membros" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tenants_conta_idx" ON "tenants" USING btree ("conta_id");--> statement-breakpoint
-- RLS (FORCE incluído) e permissões do app. tenants isola pela própria linha (id).
SELECT aplicar_rls_tenant('tenants', 'id');--> statement-breakpoint
SELECT aplicar_rls_tenant('tenant_configuracoes');--> statement-breakpoint
SELECT aplicar_rls_tenant('membros');--> statement-breakpoint
-- contas e conta_administradores não têm RLS por tenant (docs/modelagem_banco.md, 3.0.2):
-- o acesso é controlado pela API (só usuários da própria conta).
GRANT SELECT, INSERT, UPDATE, DELETE ON "contas", "conta_administradores" TO leadtogo_app;
