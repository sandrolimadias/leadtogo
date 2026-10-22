CREATE TYPE "public"."alcance_permissao" AS ENUM('propria', 'equipe', 'todas');--> statement-breakpoint
CREATE TYPE "public"."chave_perfil_sistema" AS ENUM('admin', 'gestor', 'vendedor');--> statement-breakpoint
CREATE TABLE "perfil_permissoes" (
	"tenant_id" uuid NOT NULL,
	"perfil_id" uuid NOT NULL,
	"permissao" text NOT NULL,
	"alcance" "alcance_permissao",
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfil_permissoes_perfil_id_permissao_pk" PRIMARY KEY("perfil_id","permissao")
);
--> statement-breakpoint
CREATE TABLE "perfis_acesso" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"sistema" boolean DEFAULT false NOT NULL,
	"chave_sistema" "chave_perfil_sistema",
	"exige_2fa" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "convites" ADD COLUMN "perfil_id" uuid;--> statement-breakpoint
ALTER TABLE "membros" ADD COLUMN "perfil_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "perfis_criados_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_perfil_id_perfis_acesso_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_acesso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis_acesso" ADD CONSTRAINT "perfis_acesso_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis_acesso" ADD CONSTRAINT "perfis_acesso_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis_acesso" ADD CONSTRAINT "perfis_acesso_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "perfil_permissoes_tenant_idx" ON "perfil_permissoes" USING btree ("tenant_id","perfil_id");--> statement-breakpoint
CREATE UNIQUE INDEX "perfis_acesso_nome_uq" ON "perfis_acesso" USING btree ("tenant_id",lower("nome")) WHERE "perfis_acesso"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "perfis_acesso_sistema_uq" ON "perfis_acesso" USING btree ("tenant_id","chave_sistema") WHERE "perfis_acesso"."chave_sistema" IS NOT NULL AND "perfis_acesso"."excluido_em" IS NULL;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_perfil_id_perfis_acesso_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_acesso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_perfil_id_perfis_acesso_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_acesso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membros_perfil_idx" ON "membros" USING btree ("tenant_id","perfil_id");--> statement-breakpoint
-- Perfil de sistema ⇔ chave_sistema preenchida (Admin, Gestor e Vendedor; os da empresa não têm chave).
ALTER TABLE "perfis_acesso" ADD CONSTRAINT "perfis_acesso_sistema_chk" CHECK ("sistema" = ("chave_sistema" IS NOT NULL));--> statement-breakpoint
-- RLS forçado e políticas padrão (aplicar_rls_tenant também concede o DML ao app). As FKs de
-- membros.perfil_id, convites.perfil_id e perfil_permissoes.perfil_id não passam pelo RLS: a API só
-- grava perfil da própria empresa.
SELECT aplicar_rls_tenant('perfis_acesso');--> statement-breakpoint
SELECT aplicar_rls_tenant('perfil_permissoes');--> statement-breakpoint
-- Backfill dos perfis de sistema nas empresas que já existem (feito no start da API, com o
-- leadtogo_owner): o RLS forçado impede o dono de listar os tenants. Mesmo padrão das migrações 0016,
-- 0018 e 0026: função SECURITY DEFINER mínima e política só para o leadtogo_owner, travada numa
-- variável que só a função define e limpa. Devolve APENAS os ids dos tenants ainda sem a marca.
CREATE POLICY configuracoes_perfis_pendentes ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.perfis_pendentes', true) = '1' AND perfis_criados_em IS NULL);
--> statement-breakpoint
CREATE FUNCTION app_tenants_sem_perfis()
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.perfis_pendentes', '1', true);
  RETURN QUERY
    SELECT c.tenant_id FROM public.tenant_configuracoes c WHERE c.perfis_criados_em IS NULL ORDER BY c.criado_em;
  PERFORM pg_catalog.set_config('app.perfis_pendentes', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_sem_perfis() FROM PUBLIC;
--> statement-breakpoint
-- 2FA por perfil: o guard precisa do perfil e do flag exige_2fa junto dos vínculos, ANTES de haver
-- tenant ativo. Mesmo padrão da 0011: política de leitura só para o dono e só nas empresas em que o
-- usuário que a função recebe é membro ativo. A app_vinculos_com_politica fica até a contração.
CREATE POLICY perfis_do_usuario ON perfis_acesso FOR SELECT TO leadtogo_owner
  USING (tenant_id IN (
    SELECT m.tenant_id FROM public.membros m
    WHERE m.usuario_id = nullif(current_setting('app.vinculos_usuario', true), '')::uuid
      AND m.excluido_em IS NULL AND m.ativo));
--> statement-breakpoint
CREATE FUNCTION app_vinculos_com_perfil(p_usuario_id uuid)
  RETURNS TABLE (
    tenant_id uuid,
    papel public.papel_membro,
    dois_fatores_exigido public.politica_dois_fatores,
    perfil_id uuid,
    perfil_exige_2fa boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.vinculos_usuario', coalesce(p_usuario_id::text, ''), true);
  RETURN QUERY
    SELECT m.tenant_id, m.papel, coalesce(c.dois_fatores_exigido, 'admin'::public.politica_dois_fatores),
      p.id, p.exige_2fa
    FROM public.membros m
    LEFT JOIN public.tenant_configuracoes c ON c.tenant_id = m.tenant_id
    LEFT JOIN public.perfis_acesso p
      ON p.id = m.perfil_id AND p.tenant_id = m.tenant_id AND p.excluido_em IS NULL
    WHERE m.usuario_id = p_usuario_id AND m.excluido_em IS NULL AND m.ativo
    ORDER BY m.criado_em, m.id;
  PERFORM pg_catalog.set_config('app.vinculos_usuario', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_vinculos_com_perfil(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_vinculos_com_perfil(uuid) TO leadtogo_app;
