-- Portal do Cliente, Fase 3A (parte 2): só expansão, sem perda de dado.
--
-- 1) O cliente só enxerga os chamados abertos PELO PORTAL. A política da 0032 liberava todo chamado da
--    empresa-cliente, inclusive os internos (a equipe abre chamado entre si citando a empresa). Troca a
--    política restritiva por uma que exige também `origem = 'portal'`.
-- 2) O cliente abre chamados, mas a numeração (`tenant_configuracoes.chamado_ultimo_numero`) é de uma tabela que
--    o portal só lê. Função SECURITY DEFINER mínima, que mexe SÓ na linha do tenant da sessão (`app.tenant_id`) e só
--    no contador; roda como dono da tabela, que a política de somente leitura do portal não alcança.

DROP POLICY portal_escopo ON chamados;--> statement-breakpoint
CREATE POLICY portal_escopo ON chamados AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR (empresa_cliente_id = app_portal_empresa() AND origem = 'portal'));--> statement-breakpoint

-- A 0032 esqueceu `tenant_configuracoes` na lista de tabelas somente leitura para o portal: sem isto a sessão do
-- cliente poderia gravar na configuração da empresa. O portal só lê (o nome do portal, o expediente...). A
-- política vale só para o papel da API (`TO leadtogo_app`): a função abaixo roda como dono da tabela.
CREATE POLICY portal_so_leitura_ins ON tenant_configuracoes AS RESTRICTIVE FOR INSERT TO leadtogo_app WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON tenant_configuracoes AS RESTRICTIVE FOR UPDATE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON tenant_configuracoes AS RESTRICTIVE FOR DELETE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint

CREATE FUNCTION app_proximo_numero_chamado()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  numero integer;
BEGIN
  IF public.app_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'sem empresa na sessão';
  END IF;
  UPDATE public.tenant_configuracoes SET chamado_ultimo_numero = chamado_ultimo_numero + 1
  WHERE tenant_id = public.app_tenant_id()
  RETURNING chamado_ultimo_numero INTO numero;
  RETURN numero;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_proximo_numero_chamado() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_proximo_numero_chamado() TO leadtogo_app;
