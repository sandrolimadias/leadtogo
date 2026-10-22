CREATE TYPE "public"."modo_checkin" AS ENUM('avisar', 'bloquear', 'so_gravar');--> statement-breakpoint
CREATE TYPE "public"."chave_resultado_visita" AS ENUM('nao_localizada', 'encerrada');--> statement-breakpoint
CREATE TABLE "visita_modelo_versoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"modelo_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"campos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visita_modelos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"versao_atual_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visita_resultados" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"chave_sistema" "chave_resultado_visita",
	"modelo_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "checkin_modo" "modo_checkin" DEFAULT 'avisar' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "checkin_limite_m" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "lembrete_relatorios_hora" time DEFAULT '17:30' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "visitas_padroes_criados_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "numero_funcionarios" integer;--> statement-breakpoint
ALTER TABLE "visita_modelo_versoes" ADD CONSTRAINT "visita_modelo_versoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_modelo_versoes" ADD CONSTRAINT "visita_modelo_versoes_modelo_id_visita_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."visita_modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_modelo_versoes" ADD CONSTRAINT "visita_modelo_versoes_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_modelo_versoes" ADD CONSTRAINT "visita_modelo_versoes_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_modelos" ADD CONSTRAINT "visita_modelos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_modelos" ADD CONSTRAINT "visita_modelos_versao_atual_id_visita_modelo_versoes_id_fk" FOREIGN KEY ("versao_atual_id") REFERENCES "public"."visita_modelo_versoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_modelos" ADD CONSTRAINT "visita_modelos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_modelos" ADD CONSTRAINT "visita_modelos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_resultados" ADD CONSTRAINT "visita_resultados_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_resultados" ADD CONSTRAINT "visita_resultados_modelo_id_visita_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."visita_modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_resultados" ADD CONSTRAINT "visita_resultados_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_resultados" ADD CONSTRAINT "visita_resultados_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visita_modelo_versoes_numero_uq" ON "visita_modelo_versoes" USING btree ("modelo_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "visita_modelos_nome_uq" ON "visita_modelos" USING btree ("tenant_id",lower("nome")) WHERE "visita_modelos"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "visita_modelos_padrao_uq" ON "visita_modelos" USING btree ("tenant_id") WHERE "visita_modelos"."padrao" AND "visita_modelos"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "visita_resultados_nome_uq" ON "visita_resultados" USING btree ("tenant_id",lower("nome")) WHERE "visita_resultados"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "visita_resultados_chave_sistema_uq" ON "visita_resultados" USING btree ("tenant_id","chave_sistema") WHERE "visita_resultados"."chave_sistema" IS NOT NULL AND "visita_resultados"."excluido_em" IS NULL;--> statement-breakpoint
-- Limite do check-in (G3a): de 10 m a 50 km.
ALTER TABLE "tenant_configuracoes" ADD CONSTRAINT "tenant_configuracoes_checkin_limite_chk" CHECK ("checkin_limite_m" BETWEEN 10 AND 50000);--> statement-breakpoint
-- RLS forçado e políticas padrão (aplicar_rls_tenant também concede o DML ao app). As FKs entre modelos,
-- versões e resultados não passam pelo RLS: a API só grava ids da própria empresa.
SELECT aplicar_rls_tenant('visita_modelos');--> statement-breakpoint
SELECT aplicar_rls_tenant('visita_modelo_versoes');--> statement-breakpoint
SELECT aplicar_rls_tenant('visita_resultados');--> statement-breakpoint
-- Backfill do modelo padrão e dos seis resultados nas empresas que já existem (feito no start da API,
-- com o leadtogo_owner): o RLS forçado impede o dono de listar os tenants. Mesmo padrão das migrações
-- 0016, 0026 e 0027: função SECURITY DEFINER mínima e política só para o leadtogo_owner, travada numa
-- variável que só a função define e limpa. Devolve APENAS os ids dos tenants ainda sem a marca.
CREATE POLICY configuracoes_visitas_pendentes ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.visitas_pendentes', true) = '1' AND visitas_padroes_criados_em IS NULL);
--> statement-breakpoint
CREATE FUNCTION app_tenants_sem_padroes_visita()
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.visitas_pendentes', '1', true);
  RETURN QUERY
    SELECT c.tenant_id FROM public.tenant_configuracoes c WHERE c.visitas_padroes_criados_em IS NULL ORDER BY c.criado_em;
  PERFORM pg_catalog.set_config('app.visitas_pendentes', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_sem_padroes_visita() FROM PUBLIC;
