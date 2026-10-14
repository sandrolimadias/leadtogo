CREATE TYPE "public"."acao_fora_do_perfil" AS ENUM('pular', 'importar_com_tag');--> statement-breakpoint
CREATE TYPE "public"."estabelecimento_do_perfil" AS ENUM('ambas', 'matriz', 'filial');--> statement-breakpoint
CREATE TYPE "public"."fonte_dados_importacao" AS ENUM('planilha', 'receita', 'completar');--> statement-breakpoint
CREATE TYPE "public"."resultado_da_linha" AS ENUM('pendente', 'criada', 'criada_fora_do_perfil', 'fora_do_perfil', 'pulada_sem_cnpj', 'pulada_duplicada', 'pulada_nao_ativa', 'erro');--> statement-breakpoint
CREATE TYPE "public"."situacao_importacao" AS ENUM('rascunho', 'pronta', 'em_andamento', 'concluida', 'falhou', 'cancelada', 'desfeita');--> statement-breakpoint
CREATE TYPE "public"."tipo_importacao" AS ENUM('empresas', 'contatos');--> statement-breakpoint
CREATE TABLE "importacao_linhas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"importacao_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"dados" jsonb NOT NULL,
	"documento" varchar(14),
	"resultado" "resultado_da_linha" DEFAULT 'pendente' NOT NULL,
	"motivo" text,
	"empresa_id" uuid,
	"processada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacao_perfis" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"exige_situacao_ativa" boolean DEFAULT true NOT NULL,
	"estabelecimento" "estabelecimento_do_perfil" DEFAULT 'ambas' NOT NULL,
	"excluir_mei" boolean DEFAULT false NOT NULL,
	"cnaes" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"aceitar_cnae_secundario" boolean DEFAULT false NOT NULL,
	"acao_fora_do_perfil" "acao_fora_do_perfil" DEFAULT 'pular' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" "tipo_importacao" DEFAULT 'empresas' NOT NULL,
	"nome" text NOT NULL,
	"arquivo_id" uuid,
	"nome_arquivo" text NOT NULL,
	"fonte_dados" "fonte_dados_importacao" DEFAULT 'planilha' NOT NULL,
	"perfil_id" uuid,
	"regras" jsonb,
	"mapeamento" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"intervalo_ms" integer DEFAULT 3000 NOT NULL,
	"vendedor_id" uuid,
	"status_tag_id" uuid,
	"origem_id" uuid,
	"vertical_id" uuid,
	"situacao" "situacao_importacao" DEFAULT 'rascunho' NOT NULL,
	"total_linhas" integer DEFAULT 0 NOT NULL,
	"totais" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"desfeita_em" timestamp with time zone,
	"desfeita_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "importacoes_intervalo" CHECK ("importacoes"."intervalo_ms" BETWEEN 500 AND 60000)
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "importacao_id" uuid;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD CONSTRAINT "importacao_linhas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD CONSTRAINT "importacao_linhas_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_linhas" ADD CONSTRAINT "importacao_linhas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_perfis" ADD CONSTRAINT "importacao_perfis_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_perfis" ADD CONSTRAINT "importacao_perfis_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_perfis" ADD CONSTRAINT "importacao_perfis_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_perfil_id_importacao_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."importacao_perfis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_vendedor_id_membros_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_status_tag_id_tags_id_fk" FOREIGN KEY ("status_tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_origem_id_origens_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."origens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_vertical_id_verticais_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_desfeita_por_membros_id_fk" FOREIGN KEY ("desfeita_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "importacao_linhas_numero_uq" ON "importacao_linhas" USING btree ("importacao_id","numero");--> statement-breakpoint
CREATE INDEX "importacao_linhas_resultado_idx" ON "importacao_linhas" USING btree ("tenant_id","importacao_id","resultado");--> statement-breakpoint
CREATE INDEX "importacao_linhas_empresa_idx" ON "importacao_linhas" USING btree ("tenant_id","empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "importacao_perfis_nome_uq" ON "importacao_perfis" USING btree ("tenant_id",lower("nome")) WHERE "importacao_perfis"."excluido_em" IS NULL;--> statement-breakpoint
CREATE INDEX "importacoes_situacao_idx" ON "importacoes" USING btree ("tenant_id","situacao");--> statement-breakpoint
CREATE INDEX "importacoes_criado_idx" ON "importacoes" USING btree ("tenant_id","criado_em");--> statement-breakpoint
CREATE INDEX "empresas_importacao_idx" ON "empresas" USING btree ("tenant_id","importacao_id");--> statement-breakpoint
-- FK só no SQL: importar `importacoes` em carteira.ts faria ciclo de módulos (ver schema/importacao.ts).
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- RLS padrão: cada empresa (tenant) lê e grava só as próprias importações.
SELECT aplicar_rls_tenant('importacao_perfis');
--> statement-breakpoint
SELECT aplicar_rls_tenant('importacoes');
--> statement-breakpoint
SELECT aplicar_rls_tenant('importacao_linhas');
