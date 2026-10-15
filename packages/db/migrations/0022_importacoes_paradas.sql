-- Varredura de importações paradas (Módulo 4): o worker precisa achar, somando todas as empresas, os lotes
-- em andamento que pararam de andar. Sem papel que ignore o RLS (mesmo padrão das migrações 0013 e 0016):
-- função SECURITY DEFINER mínima do leadtogo_owner, com search_path fixo e EXECUTE só para o
-- leadtogo_app, apoiada em políticas de leitura só para o leadtogo_owner, travadas numa variável de
-- transação que só a função define e limpa. Devolve APENAS (tenant_id, id). Migração só de expansão.
-- "Parado": em andamento, com linha pendente, e sem espera programada nem progresso há mais de
-- p_minutos. Um lote que espera de propósito (intervalo ou 429, `proxima_consulta_em`) só conta depois
-- de passada a espera MAIS a margem.
CREATE POLICY importacoes_paradas_le ON importacoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.importacoes_paradas', true) = '1');
--> statement-breakpoint
CREATE POLICY importacao_linhas_paradas_le ON importacao_linhas FOR SELECT TO leadtogo_owner
  USING (current_setting('app.importacoes_paradas', true) = '1');
--> statement-breakpoint
CREATE FUNCTION app_importacoes_paradas(p_minutos integer DEFAULT 2)
  RETURNS TABLE (tenant_id uuid, id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  margem interval := pg_catalog.make_interval(mins => LEAST(GREATEST(coalesce(p_minutos, 2), 1), 60));
BEGIN
  PERFORM pg_catalog.set_config('app.importacoes_paradas', '1', true);
  RETURN QUERY
    SELECT i.tenant_id, i.id
    FROM public.importacoes i
    WHERE i.situacao = 'em_andamento'
      AND i.excluido_em IS NULL
      AND coalesce(i.proxima_consulta_em, '-infinity'::timestamptz) < pg_catalog.now() - margem
      AND coalesce(i.ultimo_progresso_em, i.iniciado_em, i.criado_em) < pg_catalog.now() - margem
      AND EXISTS (
        SELECT 1 FROM public.importacao_linhas l
        WHERE l.importacao_id = i.id AND l.resultado = 'pendente'
      )
    ORDER BY i.iniciado_em, i.id
    LIMIT 100;
  PERFORM pg_catalog.set_config('app.importacoes_paradas', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_importacoes_paradas(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_importacoes_paradas(integer) TO leadtogo_app;
