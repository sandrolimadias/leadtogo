-- Manutenção agendada do worker, sem papel que ignore o RLS (mesmo padrão das migrações 0006–0008):
-- funções SECURITY DEFINER mínimas do leadtogo_owner, com prazos FIXOS (não são parâmetros) e lotes
-- limitados, apoiadas em políticas só para o leadtogo_owner, travadas numa variável que só a função
-- define e limpa. O leadtogo_app só tem EXECUTE nelas. Migração só de expansão.

-- 1. Partições mensais da auditoria: garante a do mês corrente e as dos próximos p_meses (0 a 12).
-- Devolve quantas partições criou. O lock impede duas execuções simultâneas de disputar o CREATE TABLE.
CREATE FUNCTION app_manter_particoes_auditoria(p_meses integer DEFAULT 12)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  criadas integer := 0;
  mes date;
  nome text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('leadtogo.particoes_auditoria'));
  FOR i IN 0..LEAST(GREATEST(coalesce(p_meses, 12), 0), 12) LOOP
    mes := (pg_catalog.date_trunc('month', pg_catalog.now()) + pg_catalog.make_interval(months => i))::date;
    nome := pg_catalog.format('auditoria_%s', pg_catalog.to_char(mes, 'YYYY_MM'));
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', nome)) IS NULL THEN
      PERFORM public.criar_particao_auditoria(mes);
      criadas := criadas + 1;
    END IF;
  END LOOP;
  RETURN criadas;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_manter_particoes_auditoria(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_manter_particoes_auditoria(integer) TO leadtogo_app;
--> statement-breakpoint

-- 2. Convites que já não servem: cancelados ou vencidos há mais de 30 dias. Os aceitos ficam (histórico).
CREATE POLICY convites_limpeza_le ON convites FOR SELECT TO leadtogo_owner
  USING (current_setting('app.limpeza_convites', true) = '1');
--> statement-breakpoint
CREATE POLICY convites_limpeza_apaga ON convites FOR DELETE TO leadtogo_owner
  USING (current_setting('app.limpeza_convites', true) = '1');
--> statement-breakpoint
CREATE FUNCTION app_limpar_convites(p_lote integer DEFAULT 500)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  apagados integer;
BEGIN
  PERFORM pg_catalog.set_config('app.limpeza_convites', '1', true);
  WITH alvo AS (
    SELECT c.id FROM public.convites c
    WHERE c.revogado_em < pg_catalog.now() - interval '30 days'
       OR (c.aceito_em IS NULL AND c.revogado_em IS NULL AND c.expira_em < pg_catalog.now() - interval '30 days')
    ORDER BY c.criado_em
    LIMIT LEAST(GREATEST(coalesce(p_lote, 500), 1), 5000)
  ), feito AS (
    DELETE FROM public.convites c USING alvo WHERE c.id = alvo.id RETURNING 1
  )
  SELECT pg_catalog.count(*) INTO apagados FROM feito;
  PERFORM pg_catalog.set_config('app.limpeza_convites', '', true);
  RETURN apagados;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_limpar_convites(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_limpar_convites(integer) TO leadtogo_app;
--> statement-breakpoint

-- 3. Eventos do outbox entregues há mais de 14 dias. Os que esgotaram as tentativas (falhou_em) NUNCA
-- são apagados aqui: o alerta da E14 depende deles.
CREATE POLICY outbox_limpeza_le ON eventos_outbox FOR SELECT TO leadtogo_owner
  USING (current_setting('app.limpeza_outbox', true) = '1');
--> statement-breakpoint
CREATE POLICY outbox_limpeza_apaga ON eventos_outbox FOR DELETE TO leadtogo_owner
  USING (current_setting('app.limpeza_outbox', true) = '1');
--> statement-breakpoint
CREATE FUNCTION app_limpar_outbox(p_lote integer DEFAULT 500)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  apagados integer;
BEGIN
  PERFORM pg_catalog.set_config('app.limpeza_outbox', '1', true);
  WITH alvo AS (
    SELECT e.id FROM public.eventos_outbox e
    WHERE e.processado_em < pg_catalog.now() - interval '14 days'
    ORDER BY e.processado_em
    LIMIT LEAST(GREATEST(coalesce(p_lote, 500), 1), 5000)
  ), feito AS (
    DELETE FROM public.eventos_outbox e USING alvo WHERE e.id = alvo.id RETURNING 1
  )
  SELECT pg_catalog.count(*) INTO apagados FROM feito;
  PERFORM pg_catalog.set_config('app.limpeza_outbox', '', true);
  RETURN apagados;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_limpar_outbox(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_limpar_outbox(integer) TO leadtogo_app;
