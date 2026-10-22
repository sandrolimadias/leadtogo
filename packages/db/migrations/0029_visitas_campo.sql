CREATE TYPE "public"."situacao_relatorio_visita" AS ENUM('rascunho', 'concluido');--> statement-breakpoint
CREATE TABLE "relatorios_visita" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"atividade_id" uuid NOT NULL,
	"responsavel_id" uuid NOT NULL,
	"sem_checkin" boolean DEFAULT false NOT NULL,
	"checkin_em" timestamp with time zone,
	"checkin_local" geography(Point,4326),
	"checkin_precisao_m" integer,
	"distancia_m" integer,
	"fora_do_limite" boolean DEFAULT false NOT NULL,
	"checkin_offline" boolean DEFAULT false NOT NULL,
	"situacao" "situacao_relatorio_visita" DEFAULT 'rascunho' NOT NULL,
	"resultado_id" uuid,
	"modelo_versao_id" uuid,
	"respostas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "relatorios_visita_checkin" CHECK ("relatorios_visita"."sem_checkin" = ("relatorios_visita"."checkin_em" IS NULL) AND ("relatorios_visita"."checkin_local" IS NULL OR "relatorios_visita"."checkin_em" IS NOT NULL)),
	CONSTRAINT "relatorios_visita_concluido" CHECK ("relatorios_visita"."situacao" <> 'concluido' OR ("relatorios_visita"."resultado_id" IS NOT NULL AND "relatorios_visita"."modelo_versao_id" IS NOT NULL AND "relatorios_visita"."concluido_em" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "catalogo_perfis_versao" integer;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "visita_tentada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "atividades" ADD COLUMN "conta_visita" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_atividade_id_atividades_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_responsavel_id_membros_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_resultado_id_visita_resultados_id_fk" FOREIGN KEY ("resultado_id") REFERENCES "public"."visita_resultados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_modelo_versao_id_visita_modelo_versoes_id_fk" FOREIGN KEY ("modelo_versao_id") REFERENCES "public"."visita_modelo_versoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relatorios_visita_atividade_uq" ON "relatorios_visita" USING btree ("atividade_id");--> statement-breakpoint
CREATE INDEX "relatorios_visita_responsavel_idx" ON "relatorios_visita" USING btree ("tenant_id","responsavel_id","situacao");--> statement-breakpoint
CREATE INDEX "relatorios_visita_empresa_idx" ON "relatorios_visita" USING btree ("tenant_id","empresa_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "relatorios_visita_versao_idx" ON "relatorios_visita" USING btree ("tenant_id","modelo_versao_id");--> statement-breakpoint
-- RLS forçado e políticas padrão (aplicar_rls_tenant também concede o DML ao app). O id do relatório
-- vem do aparelho; as FKs (empresa, atividade, resultado, versão) são conferidas na API, na empresa ativa.
SELECT aplicar_rls_tenant('relatorios_visita');--> statement-breakpoint
-- O mapa pinta "visita tentada" por visita_tentada_em; as empresas já existentes não têm nenhuma.
-- Sincronização do catálogo de permissões (v2: visitas.ver_localizacao) nos perfis de SISTEMA das
-- empresas que já existem, feita no start da API com o leadtogo_owner. Mesmo padrão das 0016, 0026,
-- 0027 e 0028: função SECURITY DEFINER mínima e política só para o leadtogo_owner, travada numa variável
-- que só a função define e limpa. Devolve APENAS os ids das empresas com perfis criados numa versão
-- anterior à pedida (nula = versão 1).
CREATE POLICY configuracoes_catalogo_desatualizado ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (perfis_criados_em IS NOT NULL
    AND coalesce(catalogo_perfis_versao, 1) < nullif(current_setting('app.catalogo_versao', true), '')::int);
--> statement-breakpoint
CREATE FUNCTION app_tenants_catalogo_desatualizado(p_versao integer)
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.catalogo_versao', p_versao::text, true);
  RETURN QUERY
    SELECT c.tenant_id FROM public.tenant_configuracoes c
    WHERE c.perfis_criados_em IS NOT NULL AND coalesce(c.catalogo_perfis_versao, 1) < p_versao
    ORDER BY c.criado_em;
  PERFORM pg_catalog.set_config('app.catalogo_versao', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_catalogo_desatualizado(integer) FROM PUBLIC;
