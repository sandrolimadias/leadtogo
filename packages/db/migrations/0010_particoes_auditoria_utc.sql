-- Partições da auditoria 100% em UTC, sem depender do TimeZone nem do DateStyle da sessão.
-- Antes: `date_trunc('month', <date>)` convertia a data para timestamptz pelo TimeZone da sessão,
-- `inicio::text` dependia do DateStyle, e "o mês corrente" vinha de `now()` no fuso da sessão (perto da
-- virada do mês, um fuso a leste de UTC criaria a partição do mês errado). Agora: aritmética em
-- `timestamp` sem fuso, datas formatadas com to_char e "agora" convertido para UTC de forma explícita.
-- CREATE OR REPLACE mantém dono, SECURITY DEFINER e privilégios; só o corpo muda.
CREATE OR REPLACE FUNCTION criar_particao_auditoria(mes date) RETURNS text
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
DECLARE
  inicio date := date_trunc('month', mes::timestamp)::date;
  fim date := (date_trunc('month', mes::timestamp) + interval '1 month')::date;
  nome text := format('auditoria_%s', to_char(inicio, 'YYYY_MM'));
BEGIN
  IF to_regclass(format('public.%I', nome)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF auditoria FOR VALUES FROM (%L) TO (%L)',
      nome, to_char(inicio, 'YYYY-MM-DD') || ' 00:00:00+00', to_char(fim, 'YYYY-MM-DD') || ' 00:00:00+00');
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nome);
  END IF;
  RETURN nome;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_manter_particoes_auditoria(p_meses integer DEFAULT 12)
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
    -- "agora" em UTC (timestamp sem fuso) + i meses: o mês corrente é o de UTC em qualquer sessão
    mes := (pg_catalog.date_trunc('month', pg_catalog.now() AT TIME ZONE 'UTC') + pg_catalog.make_interval(months => i))::date;
    nome := pg_catalog.format('auditoria_%s', pg_catalog.to_char(mes, 'YYYY_MM'));
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', nome)) IS NULL THEN
      PERFORM public.criar_particao_auditoria(mes);
      criadas := criadas + 1;
    END IF;
  END LOOP;
  RETURN criadas;
END
$$;
