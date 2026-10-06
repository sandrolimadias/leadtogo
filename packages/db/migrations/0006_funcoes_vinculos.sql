-- Descoberta de vínculos ANTES de haver tenant ativo (docs/configuracao_tecnologia.md, Multiempresa).
--
-- Problema: o guard da API precisa saber em quais empresas o usuário é membro para então definir
-- app.tenant_id, mas `membros` e `tenants` têm RLS forçado (inclusive para o dono): sem tenant ativo
-- nenhuma linha aparece. A saída sem papel BYPASSRLS e sem afrouxar o RLS do app: funções
-- SECURITY DEFINER mínimas, do leadtogo_owner, e políticas extras que valem SÓ para o leadtogo_owner
-- e SÓ para o usuário que a função recebe (o app, que não é o owner, não é alcançado por elas).

-- Políticas para o dono dentro das funções. O usuário vem de uma variável de transação que apenas
-- as funções definem; sem ela (NULL), nenhuma linha casa.
CREATE POLICY vinculos_do_usuario ON membros FOR SELECT TO leadtogo_owner
  USING (usuario_id = nullif(current_setting('app.vinculos_usuario', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY empresas_da_conta_do_usuario ON tenants FOR SELECT TO leadtogo_owner
  USING (conta_id IN (
    SELECT ca.conta_id FROM public.conta_administradores ca
    WHERE ca.usuario_id = nullif(current_setting('app.consolidado_usuario', true), '')::uuid
      AND ca.papel IN ('dono', 'administrador')));
--> statement-breakpoint
-- Em quais empresas o usuário é membro (ativo, não excluído) e com qual papel. Só isso: o resto do
-- membro (nome, e-mail, gestor...) só se lê depois, com o tenant ativo e sob RLS.
CREATE FUNCTION app_vinculos_do_usuario(p_usuario_id uuid)
  RETURNS TABLE (tenant_id uuid, papel public.papel_membro)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.vinculos_usuario', coalesce(p_usuario_id::text, ''), true);
  RETURN QUERY
    SELECT m.tenant_id, m.papel
    FROM public.membros m
    WHERE m.usuario_id = p_usuario_id AND m.excluido_em IS NULL AND m.ativo
    ORDER BY m.criado_em, m.id;
  PERFORM pg_catalog.set_config('app.vinculos_usuario', '', true);
END
$$;
--> statement-breakpoint
-- Empresas (em teste ou ativas) das contas que o usuário administra como dono ou administrador:
-- é o `app.tenant_ids` do painel consolidado (só leitura). O financeiro não entra.
CREATE FUNCTION app_empresas_da_conta_do_usuario(p_usuario_id uuid)
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.consolidado_usuario', coalesce(p_usuario_id::text, ''), true);
  RETURN QUERY
    SELECT t.id
    FROM public.tenants t
    WHERE t.situacao IN ('teste', 'ativo')
    ORDER BY t.criado_em, t.id;
  PERFORM pg_catalog.set_config('app.consolidado_usuario', '', true);
END
$$;
--> statement-breakpoint
-- Só o leadtogo_app executa (PUBLIC não): o app informa o usuário da sessão já autenticada.
REVOKE ALL ON FUNCTION app_vinculos_do_usuario(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_empresas_da_conta_do_usuario(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_vinculos_do_usuario(uuid) TO leadtogo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_empresas_da_conta_do_usuario(uuid) TO leadtogo_app;
