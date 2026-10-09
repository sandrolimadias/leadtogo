ALTER TABLE "eventos_outbox" ADD COLUMN "tratado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD COLUMN "tratado_por" text;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD COLUMN "tratamento" text;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD CONSTRAINT "eventos_outbox_tratamento_ck" CHECK ("eventos_outbox"."tratamento" IS NULL OR "eventos_outbox"."tratamento" IN ('reprocessado', 'descartado'));
--> statement-breakpoint
-- Alerta e tratamento dos eventos esgotados (E14), sem papel que ignore o RLS (mesmo padrão das
-- migrações 0006–0009): funções SECURITY DEFINER mínimas do leadtogo_owner, com search_path fixo e
-- EXECUTE só para o leadtogo_app, apoiadas em políticas só para o leadtogo_owner travadas numa variável
-- de transação que só elas definem e limpam. Migração só de expansão.
-- "Esgotado e não tratado": falhou_em preenchido e (nunca tratado, ou tratado ANTES da falha atual). A
-- segunda condição faz um evento reprocessado que esgota de novo voltar a contar.
CREATE POLICY outbox_alertas_le ON eventos_outbox FOR SELECT TO leadtogo_owner
  USING (current_setting('app.outbox_alertas', true) = '1');
--> statement-breakpoint
CREATE POLICY outbox_alertas_atualiza ON eventos_outbox FOR UPDATE TO leadtogo_owner
  USING (current_setting('app.outbox_alertas', true) = '1')
  WITH CHECK (current_setting('app.outbox_alertas', true) = '1');
--> statement-breakpoint

-- Quantos eventos esgotados esperam tratamento, somando todos os tenants. Devolve só o número.
CREATE FUNCTION app_contar_eventos_esgotados()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  total bigint;
BEGIN
  PERFORM pg_catalog.set_config('app.outbox_alertas', '1', true);
  SELECT pg_catalog.count(*) INTO total
  FROM public.eventos_outbox e
  WHERE e.falhou_em IS NOT NULL AND (e.tratado_em IS NULL OR e.tratado_em < e.falhou_em);
  PERFORM pg_catalog.set_config('app.outbox_alertas', '', true);
  RETURN total;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_contar_eventos_esgotados() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_contar_eventos_esgotados() TO leadtogo_app;
--> statement-breakpoint

-- Lista os eventos esgotados e ainda não tratados (os mais antigos primeiro; lote de 1 a 500), para o
-- comando `outbox-tratar --listar`. Não devolve o payload.
CREATE FUNCTION app_listar_eventos_esgotados(p_limite integer DEFAULT 100)
  RETURNS TABLE (id uuid, tenant_id uuid, tipo text, tentativas integer, falhou_em timestamptz, ultimo_erro text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.outbox_alertas', '1', true);
  RETURN QUERY
    SELECT e.id, e.tenant_id, e.tipo, e.tentativas, e.falhou_em, e.ultimo_erro
    FROM public.eventos_outbox e
    WHERE e.falhou_em IS NOT NULL AND (e.tratado_em IS NULL OR e.tratado_em < e.falhou_em)
    ORDER BY e.falhou_em, e.id
    LIMIT LEAST(GREATEST(coalesce(p_limite, 100), 1), 500);
  PERFORM pg_catalog.set_config('app.outbox_alertas', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_listar_eventos_esgotados(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_listar_eventos_esgotados(integer) TO leadtogo_app;
--> statement-breakpoint

-- Trata UM evento esgotado, registrando quem e quando. 'reprocessar' devolve o evento ao relay (zera as
-- tentativas e tira o falhou_em); 'descartar' abandona o evento (apaga o payload). Devolve false se o
-- evento não existe ou não está esgotado e pendente de tratamento. Ação ou operador inválidos: erro.
CREATE FUNCTION app_tratar_evento_esgotado(p_id uuid, p_acao text, p_por text)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  por text := pg_catalog.btrim(coalesce(p_por, ''));
  afetados integer;
BEGIN
  IF p_acao NOT IN ('reprocessar', 'descartar') THEN
    RAISE EXCEPTION 'ação inválida: use reprocessar ou descartar' USING ERRCODE = '22023';
  END IF;
  IF por = '' OR pg_catalog.length(por) > 100 THEN
    RAISE EXCEPTION 'informe quem trata o evento (1 a 100 caracteres)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('app.outbox_alertas', '1', true);
  IF p_acao = 'reprocessar' THEN
    UPDATE public.eventos_outbox e
    SET falhou_em = NULL, tentativas = 0, proxima_tentativa_em = NULL, reservado_ate = NULL,
        tratado_em = pg_catalog.now(), tratado_por = por, tratamento = 'reprocessado'
    WHERE e.id = p_id AND e.falhou_em IS NOT NULL AND (e.tratado_em IS NULL OR e.tratado_em < e.falhou_em);
  ELSE
    UPDATE public.eventos_outbox e
    SET payload = '{}'::jsonb, reservado_ate = NULL,
        tratado_em = pg_catalog.now(), tratado_por = por, tratamento = 'descartado'
    WHERE e.id = p_id AND e.falhou_em IS NOT NULL AND (e.tratado_em IS NULL OR e.tratado_em < e.falhou_em);
  END IF;
  GET DIAGNOSTICS afetados = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.outbox_alertas', '', true);
  RETURN afetados = 1;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tratar_evento_esgotado(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tratar_evento_esgotado(uuid, text, text) TO leadtogo_app;
