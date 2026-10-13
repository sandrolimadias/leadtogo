CREATE TYPE "public"."acao_de_tag" AS ENUM('adicionada', 'removida');--> statement-breakpoint
CREATE TYPE "public"."matriz_filial" AS ENUM('matriz', 'filial');--> statement-breakpoint
CREATE TYPE "public"."origem_cadastro" AS ENUM('manual', 'receita', 'importacao', 'prospeccao', 'whatsapp', 'api');--> statement-breakpoint
CREATE TYPE "public"."origem_socio" AS ENUM('receita', 'manual');--> statement-breakpoint
CREATE TYPE "public"."origem_telefone" AS ENUM('manual', 'receita', 'importacao');--> statement-breakpoint
CREATE TYPE "public"."regime_tributario" AS ENUM('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real', 'imune_isenta', 'nao_informado');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento" AS ENUM('cnpj', 'cpf', 'nenhum');--> statement-breakpoint
CREATE TYPE "public"."tipo_telefone" AS ENUM('fixo', 'celular', 'whatsapp', 'outro');--> statement-breakpoint
CREATE TABLE "empresa_cnaes" (
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cnae_codigo" integer NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_cnaes_empresa_id_cnae_codigo_pk" PRIMARY KEY("empresa_id","cnae_codigo")
);
--> statement-breakpoint
CREATE TABLE "empresa_socios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"qualificacao_codigo" smallint,
	"qualificacao_texto" text,
	"origem" "origem_socio" DEFAULT 'receita' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresa_tags" (
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"automatica" boolean DEFAULT false NOT NULL,
	"aplicada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_por" uuid,
	CONSTRAINT "empresa_tags_empresa_id_tag_id_pk" PRIMARY KEY("empresa_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "empresa_tags_historico" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"acao" "acao_de_tag" NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"por" uuid,
	"automatica" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresa_telefones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
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
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo_documento" "tipo_documento" DEFAULT 'nenhum' NOT NULL,
	"documento" varchar(14),
	"cnpj_raiz" varchar(8) GENERATED ALWAYS AS (CASE WHEN tipo_documento = 'cnpj' THEN left(documento, 8) END) STORED,
	"matriz_filial" "matriz_filial",
	"matriz_id" uuid,
	"razao_social" text NOT NULL,
	"nome_fantasia" text,
	"mei" boolean DEFAULT false NOT NULL,
	"data_inicio_atividades" date,
	"porte_codigo" smallint,
	"regime_tributario" "regime_tributario" DEFAULT 'nao_informado' NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"vertical_id" uuid,
	"website" text,
	"cep" char(8),
	"tipo_logradouro" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio_codigo" integer,
	"pais_codigo" smallint,
	"observacoes" text,
	"origem_cadastro" "origem_cadastro" DEFAULT 'manual' NOT NULL,
	"receita_atualizado_em" timestamp with time zone,
	"situacao_nao_verificada" boolean DEFAULT false NOT NULL,
	"ultima_visita_em" timestamp with time zone,
	"ultimo_contato_em" timestamp with time zone,
	"proxima_atividade_id" uuid,
	"proxima_atividade_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "bloquear_empresa_nao_ativa" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "empresa_cnaes" ADD CONSTRAINT "empresa_cnaes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_cnaes" ADD CONSTRAINT "empresa_cnaes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_cnaes" ADD CONSTRAINT "empresa_cnaes_cnae_codigo_cnaes_codigo_fk" FOREIGN KEY ("cnae_codigo") REFERENCES "public"."cnaes"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_socios" ADD CONSTRAINT "empresa_socios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_socios" ADD CONSTRAINT "empresa_socios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_socios" ADD CONSTRAINT "empresa_socios_qualificacao_codigo_qualificacoes_socio_codigo_fk" FOREIGN KEY ("qualificacao_codigo") REFERENCES "public"."qualificacoes_socio"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags" ADD CONSTRAINT "empresa_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags" ADD CONSTRAINT "empresa_tags_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags" ADD CONSTRAINT "empresa_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags" ADD CONSTRAINT "empresa_tags_aplicada_por_membros_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags_historico" ADD CONSTRAINT "empresa_tags_historico_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags_historico" ADD CONSTRAINT "empresa_tags_historico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags_historico" ADD CONSTRAINT "empresa_tags_historico_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_tags_historico" ADD CONSTRAINT "empresa_tags_historico_por_membros_id_fk" FOREIGN KEY ("por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_telefones" ADD CONSTRAINT "empresa_telefones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_telefones" ADD CONSTRAINT "empresa_telefones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_matriz_id_empresas_id_fk" FOREIGN KEY ("matriz_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_porte_codigo_portes_codigo_fk" FOREIGN KEY ("porte_codigo") REFERENCES "public"."portes"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_vendedor_id_membros_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_vertical_id_verticais_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_municipio_codigo_municipios_codigo_ibge_fk" FOREIGN KEY ("municipio_codigo") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_pais_codigo_paises_codigo_fk" FOREIGN KEY ("pais_codigo") REFERENCES "public"."paises"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_cnaes_principal_uq" ON "empresa_cnaes" USING btree ("empresa_id") WHERE "empresa_cnaes"."principal";--> statement-breakpoint
CREATE INDEX "empresa_cnaes_cnae_idx" ON "empresa_cnaes" USING btree ("tenant_id","cnae_codigo");--> statement-breakpoint
CREATE INDEX "empresa_socios_empresa_idx" ON "empresa_socios" USING btree ("tenant_id","empresa_id");--> statement-breakpoint
CREATE INDEX "empresa_tags_tag_idx" ON "empresa_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint
CREATE INDEX "empresa_tags_historico_empresa_idx" ON "empresa_tags_historico" USING btree ("tenant_id","empresa_id","em");--> statement-breakpoint
CREATE INDEX "empresa_tags_historico_tag_idx" ON "empresa_tags_historico" USING btree ("tenant_id","tag_id");--> statement-breakpoint
CREATE INDEX "empresa_telefones_empresa_idx" ON "empresa_telefones" USING btree ("tenant_id","empresa_id");--> statement-breakpoint
CREATE INDEX "empresa_telefones_e164_idx" ON "empresa_telefones" USING btree ("tenant_id","numero_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_documento_uq" ON "empresas" USING btree ("tenant_id","documento") WHERE "empresas"."documento" IS NOT NULL AND "empresas"."excluido_em" IS NULL;--> statement-breakpoint
CREATE INDEX "empresas_vendedor_idx" ON "empresas" USING btree ("tenant_id","vendedor_id");--> statement-breakpoint
CREATE INDEX "empresas_municipio_idx" ON "empresas" USING btree ("tenant_id","municipio_codigo");--> statement-breakpoint
CREATE INDEX "empresas_vertical_idx" ON "empresas" USING btree ("tenant_id","vertical_id");--> statement-breakpoint
CREATE INDEX "empresas_raiz_idx" ON "empresas" USING btree ("tenant_id","cnpj_raiz");--> statement-breakpoint
CREATE INDEX "empresas_ultima_visita_idx" ON "empresas" USING btree ("tenant_id","ultima_visita_em");--> statement-breakpoint
CREATE INDEX "empresas_ultimo_contato_idx" ON "empresas" USING btree ("tenant_id","ultimo_contato_em");
--> statement-breakpoint
-- Busca da lista (nome, razão social e CNPJ), sem acento e sem diferença de caixa
CREATE INDEX "empresas_razao_trgm_idx" ON "empresas" USING gin (lower(f_unaccent("razao_social")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "empresas_fantasia_trgm_idx" ON "empresas" USING gin (lower(f_unaccent("nome_fantasia")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "empresas_documento_trgm_idx" ON "empresas" USING gin ("documento" gin_trgm_ops);
--> statement-breakpoint
-- RLS padrão: cada empresa (tenant) lê e grava só a própria carteira.
SELECT aplicar_rls_tenant('empresas');
--> statement-breakpoint
SELECT aplicar_rls_tenant('empresa_telefones');
--> statement-breakpoint
SELECT aplicar_rls_tenant('empresa_cnaes');
--> statement-breakpoint
SELECT aplicar_rls_tenant('empresa_socios');
--> statement-breakpoint
SELECT aplicar_rls_tenant('empresa_tags');
--> statement-breakpoint
SELECT aplicar_rls_tenant('empresa_tags_historico');
--> statement-breakpoint
-- CNAE que a Receita traz e ainda não está na tabela (o app só lê `cnaes`): função mínima do
-- leadtogo_owner, sem INSERT direto para o app (docs/modelagem_banco.md, seção 4). A hierarquia
-- (divisão, grupo, classe) sai do próprio código e a seção, da divisão. Idempotente.
CREATE FUNCTION app_registrar_cnae(p_codigo integer, p_descricao text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  cod text;
  divisao integer;
  secao char(1);
BEGIN
  IF p_codigo IS NULL OR p_codigo < 100000 OR p_codigo > 9999999 THEN
    RAISE EXCEPTION 'CNAE inválido' USING ERRCODE = '22023';
  END IF;
  IF p_descricao IS NULL OR pg_catalog.length(pg_catalog.btrim(p_descricao)) = 0
     OR pg_catalog.length(p_descricao) > 300 THEN
    RAISE EXCEPTION 'descrição do CNAE inválida' USING ERRCODE = '22023';
  END IF;
  cod := pg_catalog.lpad(p_codigo::text, 7, '0');
  divisao := pg_catalog.substr(cod, 1, 2)::integer;
  secao := CASE
    WHEN divisao BETWEEN 1 AND 3 THEN 'A'
    WHEN divisao BETWEEN 5 AND 9 THEN 'B'
    WHEN divisao BETWEEN 10 AND 33 THEN 'C'
    WHEN divisao = 35 THEN 'D'
    WHEN divisao BETWEEN 36 AND 39 THEN 'E'
    WHEN divisao BETWEEN 41 AND 43 THEN 'F'
    WHEN divisao BETWEEN 45 AND 47 THEN 'G'
    WHEN divisao BETWEEN 49 AND 53 THEN 'H'
    WHEN divisao BETWEEN 55 AND 56 THEN 'I'
    WHEN divisao BETWEEN 58 AND 63 THEN 'J'
    WHEN divisao BETWEEN 64 AND 66 THEN 'K'
    WHEN divisao = 68 THEN 'L'
    WHEN divisao BETWEEN 69 AND 75 THEN 'M'
    WHEN divisao BETWEEN 77 AND 82 THEN 'N'
    WHEN divisao = 84 THEN 'O'
    WHEN divisao = 85 THEN 'P'
    WHEN divisao BETWEEN 86 AND 88 THEN 'Q'
    WHEN divisao BETWEEN 90 AND 93 THEN 'R'
    WHEN divisao BETWEEN 94 AND 96 THEN 'S'
    WHEN divisao = 97 THEN 'T'
    WHEN divisao = 99 THEN 'U'
  END;
  IF secao IS NULL THEN
    RAISE EXCEPTION 'divisão do CNAE desconhecida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cnaes (codigo, descricao, secao, divisao, grupo, classe)
  VALUES (p_codigo, pg_catalog.btrim(p_descricao), secao, pg_catalog.substr(cod, 1, 2),
          pg_catalog.substr(cod, 1, 3), pg_catalog.substr(cod, 1, 5))
  ON CONFLICT (codigo) DO NOTHING;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_registrar_cnae(integer, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_registrar_cnae(integer, text) TO leadtogo_app;
