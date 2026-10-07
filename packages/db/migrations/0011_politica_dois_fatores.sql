CREATE TYPE "public"."politica_dois_fatores" AS ENUM('admin', 'admin_gestor', 'todos');--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "dois_fatores_exigido" "politica_dois_fatores" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
-- Política de 2FA por empresa: quem a API deve obrigar a ter 2FA ao usar cada empresa. O guard precisa
-- dela junto dos vínculos, ANTES de haver tenant ativo; mesmo padrão da migração 0006: função
-- SECURITY DEFINER mínima do leadtogo_owner + política de leitura só para o dono e só para o usuário
-- que a função recebe (as empresas em que ele é membro ativo). A função antiga (app_vinculos_do_usuario)
-- fica até a contração: a API passa a usar esta.
CREATE POLICY politica_dois_fatores_do_usuario ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (tenant_id IN (
    SELECT m.tenant_id FROM public.membros m
    WHERE m.usuario_id = nullif(current_setting('app.vinculos_usuario', true), '')::uuid
      AND m.excluido_em IS NULL AND m.ativo));
--> statement-breakpoint
CREATE FUNCTION app_vinculos_com_politica(p_usuario_id uuid)
  RETURNS TABLE (tenant_id uuid, papel public.papel_membro, dois_fatores_exigido public.politica_dois_fatores)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.vinculos_usuario', coalesce(p_usuario_id::text, ''), true);
  RETURN QUERY
    SELECT m.tenant_id, m.papel, coalesce(c.dois_fatores_exigido, 'admin'::public.politica_dois_fatores)
    FROM public.membros m
    LEFT JOIN public.tenant_configuracoes c ON c.tenant_id = m.tenant_id
    WHERE m.usuario_id = p_usuario_id AND m.excluido_em IS NULL AND m.ativo
    ORDER BY m.criado_em, m.id;
  PERFORM pg_catalog.set_config('app.vinculos_usuario', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_vinculos_com_politica(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_vinculos_com_politica(uuid) TO leadtogo_app;
