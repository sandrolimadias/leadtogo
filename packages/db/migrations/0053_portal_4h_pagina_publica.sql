ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_slug" varchar(40);--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_pagina_eventos_ativa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_formulario_associacao_id" uuid;--> statement-breakpoint

-- Portal, Fase 4H (docs/plano_portal_formularios_e_eventos.md, F-3 e F-4). Só expansão: o endereço público do
-- portal (página de eventos e "Seja um Associado") e o formulário de associação.
ALTER TABLE tenant_configuracoes ADD CONSTRAINT tenant_configuracoes_portal_slug_chk
  CHECK (portal_slug IS NULL OR portal_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$');--> statement-breakpoint
CREATE UNIQUE INDEX tenant_configuracoes_portal_slug_uq ON tenant_configuracoes (portal_slug)
  WHERE portal_slug IS NOT NULL;--> statement-breakpoint
ALTER TABLE tenant_configuracoes ADD CONSTRAINT tenant_configuracoes_formulario_associacao_fk
  FOREIGN KEY (portal_formulario_associacao_id) REFERENCES formularios(id);--> statement-breakpoint

-- O endereço chega sem o tenant. Política só do dono, travada em app.portal_slug.
CREATE POLICY configuracoes_por_slug ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.portal_slug', true) <> '' AND portal_slug = current_setting('app.portal_slug', true));--> statement-breakpoint
CREATE FUNCTION app_portal_publico(p_slug text)
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.portal_slug', coalesce(p_slug, ''), true);
  RETURN QUERY SELECT c.tenant_id FROM public.tenant_configuracoes c
    WHERE c.portal_slug = p_slug AND c.portal_ativo AND c.portal_pagina_eventos_ativa;
  PERFORM pg_catalog.set_config('app.portal_slug', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_portal_publico(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_publico(text) TO leadtogo_app;
