CREATE SCHEMA "referencia_geo";
--> statement-breakpoint
CREATE TYPE "public"."geo_aproximacao" AS ENUM('interpolada', 'rua', 'cep_cidade');--> statement-breakpoint
CREATE TYPE "public"."geo_origem" AS ENUM('cnefe', 'nominatim', 'cep', 'manual', 'checkin');--> statement-breakpoint
CREATE TYPE "public"."geo_precisao" AS ENUM('exata', 'aproximada');--> statement-breakpoint
CREATE TYPE "public"."provedor_geo" AS ENUM('cnefe', 'nominatim', 'cep');--> statement-breakpoint
CREATE TYPE "public"."resultado_geo_empresa" AS ENUM('pendente', 'exata', 'aproximada', 'a_confirmar', 'ja_tinha', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."situacao_geo_lote" AS ENUM('em_andamento', 'concluido', 'falhou', 'cancelado');--> statement-breakpoint
CREATE TABLE "microrregioes" (
	"codigo" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"uf" char(2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referencia_geo"."cnefe_enderecos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "referencia_geo"."cnefe_enderecos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"municipio_codigo" integer NOT NULL,
	"cep" char(8),
	"localidade" text,
	"logradouro_normalizado" text NOT NULL,
	"numero" integer,
	"modificador" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"nivel_coordenada" smallint NOT NULL,
	"especie" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referencia_geo"."cnefe_logradouros" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "referencia_geo"."cnefe_logradouros_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"municipio_codigo" integer NOT NULL,
	"logradouro_normalizado" text NOT NULL,
	"logradouro" text NOT NULL,
	"enderecos" integer NOT NULL,
	"latitude_centro" double precision NOT NULL,
	"longitude_centro" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_consultas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid,
	"lote_id" uuid,
	"provedor" "provedor_geo" NOT NULL,
	"consulta" text NOT NULL,
	"resultado" text NOT NULL,
	"precisao" "geo_precisao",
	"aproximacao" "geo_aproximacao",
	"localizacao" geography(Point,4326),
	"resposta" jsonb,
	"acionado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "geo_lote_empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"resultado" "resultado_geo_empresa" DEFAULT 'pendente' NOT NULL,
	"motivo" text,
	"processada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_lotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"municipios" integer[] NOT NULL,
	"escopo" text NOT NULL,
	"refazer_com_coordenada" boolean DEFAULT false NOT NULL,
	"situacao" "situacao_geo_lote" DEFAULT 'em_andamento' NOT NULL,
	"total_empresas" integer DEFAULT 0 NOT NULL,
	"totais" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ultimo_progresso_em" timestamp with time zone,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "geo_regiao_municipios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"regiao_id" uuid NOT NULL,
	"municipio_codigo" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "geo_regioes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mapa_legenda" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"cor" text NOT NULL,
	"nome" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "municipios" ADD COLUMN "microrregiao_codigo" integer;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "geo_padroes_criados_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "aparece_no_mapa" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "visivel_ao_abrir" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "localizacao" geography(Point,4326);--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "geo_precisao" "geo_precisao";--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "geo_aproximacao" "geo_aproximacao";--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "geo_origem" "geo_origem";--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "geo_endereco_consultado" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "geo_ajuste_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "geo_atualizado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "microrregioes" ADD CONSTRAINT "microrregioes_uf_estados_uf_fk" FOREIGN KEY ("uf") REFERENCES "public"."estados"("uf") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_consultas" ADD CONSTRAINT "geo_consultas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_consultas" ADD CONSTRAINT "geo_consultas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_consultas" ADD CONSTRAINT "geo_consultas_lote_id_geo_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."geo_lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_consultas" ADD CONSTRAINT "geo_consultas_acionado_por_membros_id_fk" FOREIGN KEY ("acionado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_consultas" ADD CONSTRAINT "geo_consultas_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_consultas" ADD CONSTRAINT "geo_consultas_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_lote_empresas" ADD CONSTRAINT "geo_lote_empresas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_lote_empresas" ADD CONSTRAINT "geo_lote_empresas_lote_id_geo_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."geo_lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_lote_empresas" ADD CONSTRAINT "geo_lote_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_lotes" ADD CONSTRAINT "geo_lotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_lotes" ADD CONSTRAINT "geo_lotes_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_lotes" ADD CONSTRAINT "geo_lotes_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regiao_municipios" ADD CONSTRAINT "geo_regiao_municipios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regiao_municipios" ADD CONSTRAINT "geo_regiao_municipios_regiao_id_geo_regioes_id_fk" FOREIGN KEY ("regiao_id") REFERENCES "public"."geo_regioes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regiao_municipios" ADD CONSTRAINT "geo_regiao_municipios_municipio_codigo_municipios_codigo_ibge_fk" FOREIGN KEY ("municipio_codigo") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regiao_municipios" ADD CONSTRAINT "geo_regiao_municipios_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regiao_municipios" ADD CONSTRAINT "geo_regiao_municipios_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regioes" ADD CONSTRAINT "geo_regioes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regioes" ADD CONSTRAINT "geo_regioes_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_regioes" ADD CONSTRAINT "geo_regioes_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_legenda" ADD CONSTRAINT "mapa_legenda_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_legenda" ADD CONSTRAINT "mapa_legenda_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_legenda" ADD CONSTRAINT "mapa_legenda_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cnefe_enderecos_rua_idx" ON "referencia_geo"."cnefe_enderecos" USING btree ("municipio_codigo","logradouro_normalizado","numero");--> statement-breakpoint
CREATE INDEX "cnefe_enderecos_cep_idx" ON "referencia_geo"."cnefe_enderecos" USING btree ("cep");--> statement-breakpoint
CREATE UNIQUE INDEX "cnefe_logradouros_uq" ON "referencia_geo"."cnefe_logradouros" USING btree ("municipio_codigo","logradouro_normalizado");--> statement-breakpoint
CREATE INDEX "cnefe_logradouros_trgm_idx" ON "referencia_geo"."cnefe_logradouros" USING gin ("logradouro_normalizado" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "geo_consultas_empresa_idx" ON "geo_consultas" USING btree ("tenant_id","empresa_id","criado_em");--> statement-breakpoint
CREATE INDEX "geo_consultas_cache_idx" ON "geo_consultas" USING btree ("tenant_id","provedor","consulta");--> statement-breakpoint
CREATE INDEX "geo_consultas_lote_idx" ON "geo_consultas" USING btree ("tenant_id","lote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_lote_empresas_uq" ON "geo_lote_empresas" USING btree ("lote_id","empresa_id");--> statement-breakpoint
CREATE INDEX "geo_lote_empresas_resultado_idx" ON "geo_lote_empresas" USING btree ("tenant_id","lote_id","resultado");--> statement-breakpoint
CREATE INDEX "geo_lotes_situacao_idx" ON "geo_lotes" USING btree ("tenant_id","situacao");--> statement-breakpoint
CREATE INDEX "geo_lotes_criado_idx" ON "geo_lotes" USING btree ("tenant_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_regiao_municipios_uq" ON "geo_regiao_municipios" USING btree ("regiao_id","municipio_codigo");--> statement-breakpoint
CREATE INDEX "geo_regiao_municipios_regiao_idx" ON "geo_regiao_municipios" USING btree ("tenant_id","regiao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_regioes_nome_uq" ON "geo_regioes" USING btree ("tenant_id",lower("nome")) WHERE "geo_regioes"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mapa_legenda_chave_uq" ON "mapa_legenda" USING btree ("tenant_id","chave");--> statement-breakpoint
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_microrregiao_codigo_microrregioes_codigo_fk" FOREIGN KEY ("microrregiao_codigo") REFERENCES "public"."microrregioes"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "municipios_microrregiao_idx" ON "municipios" USING btree ("microrregiao_codigo");--> statement-breakpoint
CREATE INDEX "empresas_localizacao_idx" ON "empresas" USING gist ("localizacao");
--> statement-breakpoint
-- RLS forçado e políticas padrão nas tabelas de tenant (aplicar_rls_tenant também concede o DML ao app).
SELECT aplicar_rls_tenant('geo_regioes');--> statement-breakpoint
SELECT aplicar_rls_tenant('geo_regiao_municipios');--> statement-breakpoint
SELECT aplicar_rls_tenant('geo_lotes');--> statement-breakpoint
SELECT aplicar_rls_tenant('geo_lote_empresas');--> statement-breakpoint
SELECT aplicar_rls_tenant('geo_consultas');--> statement-breakpoint
SELECT aplicar_rls_tenant('mapa_legenda');--> statement-breakpoint
-- Referências globais, só leitura para o app (a carga é do owner, no seed).
GRANT SELECT ON "microrregioes" TO leadtogo_app;--> statement-breakpoint
-- Schema `referencia_geo` (CNEFE): dado público recarregável, FORA do backup (docs/runbook_backup.md,
-- seção 5). O app só lê; a carga é do leadtogo_owner (scripts/geo/).
GRANT USAGE ON SCHEMA "referencia_geo" TO leadtogo_app;--> statement-breakpoint
GRANT SELECT ON "referencia_geo"."cnefe_logradouros", "referencia_geo"."cnefe_enderecos" TO leadtogo_app;--> statement-breakpoint
-- Backfill do grupo de tags "Cadastro" e das flags do mapa nas empresas que já existem (feito no start
-- da API, com o leadtogo_owner): o RLS forçado impede o dono de listar os tenants. Mesmo padrão das
-- migrações 0016 e 0018: função SECURITY DEFINER mínima e política só para o leadtogo_owner, travada
-- numa variável que só a função define e limpa. Devolve APENAS os ids dos tenants ainda sem a marca.
CREATE POLICY configuracoes_geo_pendentes ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.geo_pendentes', true) = '1' AND geo_padroes_criados_em IS NULL);
--> statement-breakpoint
CREATE FUNCTION app_tenants_sem_padroes_geo()
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.geo_pendentes', '1', true);
  RETURN QUERY
    SELECT c.tenant_id FROM public.tenant_configuracoes c WHERE c.geo_padroes_criados_em IS NULL ORDER BY c.criado_em;
  PERFORM pg_catalog.set_config('app.geo_pendentes', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_sem_padroes_geo() FROM PUBLIC;
