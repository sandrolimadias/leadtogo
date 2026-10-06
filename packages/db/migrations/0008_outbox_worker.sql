ALTER TABLE "eventos_outbox" ADD COLUMN "tentativas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD COLUMN "proxima_tentativa_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD COLUMN "reservado_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD COLUMN "ultimo_erro" text;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD COLUMN "falhou_em" timestamp with time zone;--> statement-breakpoint
-- Eventos que o relay ainda pode reservar (pendentes, sem falha definitiva)
CREATE INDEX "eventos_outbox_fila_idx" ON "eventos_outbox" ("criado_em") WHERE "processado_em" IS NULL AND "falhou_em" IS NULL;
--> statement-breakpoint
-- Relay do outbox sem papel BYPASSRLS (direção do E7): o worker conecta como leadtogo_app e NÃO enxerga
-- eventos de nenhum tenant sem tenant ativo. Para descobrir o que há para entregar, usa uma função
-- SECURITY DEFINER mínima do leadtogo_owner (mesmo padrão das migrações 0006 e 0007), apoiada em
-- políticas FOR SELECT/UPDATE só para o leadtogo_owner, travadas numa variável que só a função define.
-- A função devolve APENAS (id, tenant_id); tipo e payload o worker lê depois, com o tenant ativo, sob RLS.
CREATE POLICY outbox_reserva_le ON eventos_outbox FOR SELECT TO leadtogo_owner
  USING (current_setting('app.outbox_reserva', true) = '1');
--> statement-breakpoint
CREATE POLICY outbox_reserva_atualiza ON eventos_outbox FOR UPDATE TO leadtogo_owner
  USING (current_setting('app.outbox_reserva', true) = '1')
  WITH CHECK (current_setting('app.outbox_reserva', true) = '1');
--> statement-breakpoint
-- Reserva um lote de eventos pendentes e vencidos (FOR UPDATE SKIP LOCKED: dois relays nunca pegam o
-- mesmo) e soma 1 à tentativa. Limites fixos: lote de 1 a 200; reserva de 5 a 600 segundos.
CREATE FUNCTION app_reservar_eventos(p_limite integer DEFAULT 50, p_reserva_s integer DEFAULT 60)
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.outbox_reserva', '1', true);
  RETURN QUERY
    WITH escolhidos AS (
      SELECT e.id
      FROM public.eventos_outbox e
      WHERE e.processado_em IS NULL
        AND e.falhou_em IS NULL
        AND (e.proxima_tentativa_em IS NULL OR e.proxima_tentativa_em <= pg_catalog.now())
        AND (e.reservado_ate IS NULL OR e.reservado_ate <= pg_catalog.now())
      ORDER BY e.criado_em, e.id
      LIMIT LEAST(GREATEST(coalesce(p_limite, 50), 1), 200)
      FOR UPDATE SKIP LOCKED
    ), reservados AS (
      UPDATE public.eventos_outbox o
      SET reservado_ate = pg_catalog.now() + pg_catalog.make_interval(secs => LEAST(GREATEST(coalesce(p_reserva_s, 60), 5), 600)),
          tentativas = o.tentativas + 1
      FROM escolhidos
      WHERE o.id = escolhidos.id
      RETURNING o.id, o.tenant_id
    )
    SELECT r.id, r.tenant_id FROM reservados r;
  PERFORM pg_catalog.set_config('app.outbox_reserva', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_reservar_eventos(integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_reservar_eventos(integer, integer) TO leadtogo_app;
