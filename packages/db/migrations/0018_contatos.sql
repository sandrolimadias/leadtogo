CREATE TYPE "public"."tipo_email" AS ENUM('pessoal', 'trabalho');--> statement-breakpoint
CREATE TABLE "papeis_decisao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contato_emails" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"tipo" "tipo_email" DEFAULT 'trabalho' NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contato_telefones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"numero" varchar(20) NOT NULL,
	"numero_e164" varchar(16) NOT NULL,
	"tipo" "tipo_telefone" DEFAULT 'outro' NOT NULL,
	"descricao" text,
	"principal" boolean DEFAULT false NOT NULL,
	"origem" "origem_telefone" DEFAULT 'manual' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contatos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"papel_decisao_id" uuid,
	"aniversario_dia" smallint,
	"aniversario_mes" smallint,
	"linkedin_url" text,
	"aceita_whatsapp" boolean DEFAULT true NOT NULL,
	"aceita_email" boolean DEFAULT true NOT NULL,
	"consentimento_em" timestamp with time zone,
	"consentimento_origem" text,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "contatos_aniversario_mes" CHECK ("contatos"."aniversario_mes" IS NULL OR "contatos"."aniversario_mes" BETWEEN 1 AND 12),
	CONSTRAINT "contatos_aniversario_dia" CHECK ("contatos"."aniversario_dia" IS NULL OR "contatos"."aniversario_dia" BETWEEN 1 AND 31),
	CONSTRAINT "contatos_aniversario_completo" CHECK (("contatos"."aniversario_dia" IS NULL) = ("contatos"."aniversario_mes" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "empresa_contatos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"cargo" text,
	"principal" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"desde" date,
	"ate" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_contatos_principal_ativo" CHECK (NOT "empresa_contatos"."principal" OR "empresa_contatos"."ativo")
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "papeis_decisao_criados_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "papeis_decisao" ADD CONSTRAINT "papeis_decisao_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papeis_decisao" ADD CONSTRAINT "papeis_decisao_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papeis_decisao" ADD CONSTRAINT "papeis_decisao_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_emails" ADD CONSTRAINT "contato_emails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_emails" ADD CONSTRAINT "contato_emails_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_telefones" ADD CONSTRAINT "contato_telefones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_telefones" ADD CONSTRAINT "contato_telefones_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_papel_decisao_id_papeis_decisao_id_fk" FOREIGN KEY ("papel_decisao_id") REFERENCES "public"."papeis_decisao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_contatos" ADD CONSTRAINT "empresa_contatos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_contatos" ADD CONSTRAINT "empresa_contatos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_contatos" ADD CONSTRAINT "empresa_contatos_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "papeis_decisao_nome_uq" ON "papeis_decisao" USING btree ("tenant_id",lower("nome")) WHERE "papeis_decisao"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contato_emails_uq" ON "contato_emails" USING btree ("contato_id","email");--> statement-breakpoint
CREATE INDEX "contato_emails_email_idx" ON "contato_emails" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "contato_telefones_contato_idx" ON "contato_telefones" USING btree ("tenant_id","contato_id");--> statement-breakpoint
CREATE INDEX "contato_telefones_e164_idx" ON "contato_telefones" USING btree ("tenant_id","numero_e164");--> statement-breakpoint
CREATE INDEX "contatos_papel_idx" ON "contatos" USING btree ("tenant_id","papel_decisao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_contatos_uq" ON "empresa_contatos" USING btree ("empresa_id","contato_id");--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_contatos_principal_uq" ON "empresa_contatos" USING btree ("empresa_id") WHERE "empresa_contatos"."principal";--> statement-breakpoint
CREATE INDEX "empresa_contatos_contato_idx" ON "empresa_contatos" USING btree ("tenant_id","contato_id");--> statement-breakpoint
-- Busca da lista de contatos (nome), sem acento e sem diferença de caixa
CREATE INDEX "contatos_nome_trgm_idx" ON "contatos" USING gin (lower(f_unaccent("nome")) gin_trgm_ops);
--> statement-breakpoint
-- Backfill dos papéis na decisão padrão das empresas que já existem (feito no start da API, com o
-- leadtogo_owner): o RLS forçado impede o dono de listar os tenants. Mesmo padrão da migração 0016:
-- função SECURITY DEFINER mínima e política só para o leadtogo_owner, travada numa variável que só a
-- função define e limpa. Devolve APENAS os ids dos tenants que ainda não tiveram os papéis criados.
CREATE POLICY configuracoes_papeis_pendentes ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.papeis_pendentes', true) = '1' AND papeis_decisao_criados_em IS NULL);
--> statement-breakpoint
CREATE FUNCTION app_tenants_sem_papeis()
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.papeis_pendentes', '1', true);
  RETURN QUERY
    SELECT c.tenant_id FROM public.tenant_configuracoes c WHERE c.papeis_decisao_criados_em IS NULL ORDER BY c.criado_em;
  PERFORM pg_catalog.set_config('app.papeis_pendentes', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_sem_papeis() FROM PUBLIC;
--> statement-breakpoint
-- RLS padrão: cada empresa (tenant) lê e grava só os próprios cadastros e contatos.
SELECT aplicar_rls_tenant('papeis_decisao');
--> statement-breakpoint
SELECT aplicar_rls_tenant('contatos');
--> statement-breakpoint
SELECT aplicar_rls_tenant('empresa_contatos');
--> statement-breakpoint
SELECT aplicar_rls_tenant('contato_telefones');
--> statement-breakpoint
SELECT aplicar_rls_tenant('contato_emails');
