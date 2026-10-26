CREATE TYPE "public"."alcance_evento" AS ENUM('todos', 'empresas');--> statement-breakpoint
CREATE TYPE "public"."situacao_confirmacao" AS ENUM('confirmado', 'lista_espera', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."situacao_evento" AS ENUM('rascunho', 'publicado', 'cancelado');--> statement-breakpoint
CREATE TABLE "evento_confirmacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"situacao" "situacao_confirmacao" DEFAULT 'lista_espera' NOT NULL,
	"entrou_na_fila_em" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmado_em" timestamp with time zone,
	"promovido_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evento_confirmacoes_confirmado_chk" CHECK ("evento_confirmacoes"."situacao" <> 'confirmado' OR "evento_confirmacoes"."confirmado_em" IS NOT NULL),
	CONSTRAINT "evento_confirmacoes_cancelado_chk" CHECK (("evento_confirmacoes"."situacao" = 'cancelado') = ("evento_confirmacoes"."cancelado_em" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "evento_empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"descricao" text,
	"local" varchar(200),
	"link_online" text,
	"inicio_em" timestamp with time zone NOT NULL,
	"fim_em" timestamp with time zone NOT NULL,
	"vagas_totais" integer,
	"vagas_por_empresa" integer,
	"prazo_confirmacao" timestamp with time zone,
	"alcance" "alcance_evento" DEFAULT 'todos' NOT NULL,
	"situacao" "situacao_evento" DEFAULT 'rascunho' NOT NULL,
	"publicado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"cancelado_motivo" text,
	"lembrete_enviado_em" timestamp with time zone,
	"total_confirmados" integer DEFAULT 0 NOT NULL,
	"total_lista_espera" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "eventos_periodo_chk" CHECK ("eventos"."fim_em" > "eventos"."inicio_em"),
	CONSTRAINT "eventos_vagas_chk" CHECK (("eventos"."vagas_totais" IS NULL OR "eventos"."vagas_totais" >= 1) AND ("eventos"."vagas_por_empresa" IS NULL OR "eventos"."vagas_por_empresa" >= 1)),
	CONSTRAINT "eventos_prazo_chk" CHECK ("eventos"."prazo_confirmacao" IS NULL OR "eventos"."prazo_confirmacao" <= "eventos"."inicio_em"),
	CONSTRAINT "eventos_link_chk" CHECK ("eventos"."link_online" IS NULL OR "eventos"."link_online" ~* '^https?://'),
	CONSTRAINT "eventos_cancelado_chk" CHECK (("eventos"."situacao" = 'cancelado') = ("eventos"."cancelado_em" IS NOT NULL)),
	CONSTRAINT "eventos_publicado_chk" CHECK ("eventos"."situacao" = 'rascunho' OR "eventos"."publicado_em" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD CONSTRAINT "evento_confirmacoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD CONSTRAINT "evento_confirmacoes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD CONSTRAINT "evento_confirmacoes_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD CONSTRAINT "evento_confirmacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_empresas" ADD CONSTRAINT "evento_empresas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_empresas" ADD CONSTRAINT "evento_empresas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_empresas" ADD CONSTRAINT "evento_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evento_confirmacoes_ativa_uq" ON "evento_confirmacoes" USING btree ("evento_id","acesso_id") WHERE "evento_confirmacoes"."situacao" <> 'cancelado';--> statement-breakpoint
CREATE INDEX "evento_confirmacoes_fila_idx" ON "evento_confirmacoes" USING btree ("evento_id","situacao","entrou_na_fila_em");--> statement-breakpoint
CREATE INDEX "evento_confirmacoes_empresa_idx" ON "evento_confirmacoes" USING btree ("evento_id","empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evento_empresas_uq" ON "evento_empresas" USING btree ("evento_id","empresa_id");--> statement-breakpoint
CREATE INDEX "evento_empresas_empresa_idx" ON "evento_empresas" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "eventos_agenda_idx" ON "eventos" USING btree ("tenant_id","inicio_em");--> statement-breakpoint

-- Portal do Cliente, Fase 3D: agenda. Só expansão. RLS por empresa (tenant) e, para a sessão do portal, políticas
-- restritivas. Diferente das tabelas anteriores, as restrições do portal valem só para o papel da API
-- (`TO leadtogo_app`): as funções de confirmar, cancelar e promover rodam como dono (SECURITY DEFINER), travam a
-- linha do evento e enxergam todas as confirmações do evento (contagem de vagas e fila). A sessão do portal só LÊ;
-- quem muda as confirmações são as funções, que conferem o alcance, o prazo e as vagas.
SELECT aplicar_rls_tenant('eventos');--> statement-breakpoint
SELECT aplicar_rls_tenant('evento_empresas');--> statement-breakpoint
SELECT aplicar_rls_tenant('evento_confirmacoes');--> statement-breakpoint
DROP POLICY portal_negado ON eventos;--> statement-breakpoint
DROP POLICY portal_negado ON evento_empresas;--> statement-breakpoint
DROP POLICY portal_negado ON evento_confirmacoes;--> statement-breakpoint

CREATE POLICY portal_escopo_sel ON evento_empresas AS RESTRICTIVE FOR SELECT TO leadtogo_app
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON evento_empresas AS RESTRICTIVE FOR INSERT TO leadtogo_app WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON evento_empresas AS RESTRICTIVE FOR UPDATE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON evento_empresas AS RESTRICTIVE FOR DELETE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint

CREATE POLICY portal_escopo_sel ON eventos AS RESTRICTIVE FOR SELECT TO leadtogo_app
  USING (NOT app_portal_ativo() OR (
    situacao IN ('publicado', 'cancelado') AND publicado_em IS NOT NULL AND excluido_em IS NULL
    AND (alcance = 'todos' OR EXISTS (
      SELECT 1 FROM evento_empresas ee
      WHERE ee.evento_id = eventos.id AND ee.empresa_id = app_portal_empresa()))));--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON eventos AS RESTRICTIVE FOR INSERT TO leadtogo_app WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON eventos AS RESTRICTIVE FOR UPDATE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON eventos AS RESTRICTIVE FOR DELETE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint

-- O cliente enxerga as confirmações da própria empresa (para contar as vagas dela), nunca as de outra empresa
CREATE POLICY portal_escopo_sel ON evento_confirmacoes AS RESTRICTIVE FOR SELECT TO leadtogo_app
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON evento_confirmacoes AS RESTRICTIVE FOR INSERT TO leadtogo_app WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON evento_confirmacoes AS RESTRICTIVE FOR UPDATE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON evento_confirmacoes AS RESTRICTIVE FOR DELETE TO leadtogo_app USING (NOT app_portal_ativo());--> statement-breakpoint

-- Promove, na ordem da fila, quem cabe nas vagas livres (total e da empresa). Quem chama já travou o evento (ou
-- esta função o trava de novo, na mesma transação). Devolve os ids das confirmações promovidas.
CREATE FUNCTION app_evento_promover(p_evento uuid)
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  ev public.eventos%ROWTYPE;
  prox uuid;
BEGIN
  SELECT * INTO ev FROM public.eventos
  WHERE id = p_evento AND excluido_em IS NULL AND tenant_id = public.app_tenant_id() FOR UPDATE;
  IF NOT FOUND OR ev.situacao <> 'publicado' THEN RETURN; END IF;
  LOOP
    IF ev.vagas_totais IS NOT NULL AND ev.total_confirmados >= ev.vagas_totais THEN EXIT; END IF;
    SELECT f.id INTO prox FROM public.evento_confirmacoes f
    WHERE f.evento_id = p_evento AND f.situacao = 'lista_espera'
      AND (ev.vagas_por_empresa IS NULL OR (
        SELECT pg_catalog.count(*) FROM public.evento_confirmacoes x
        WHERE x.evento_id = p_evento AND x.empresa_id = f.empresa_id AND x.situacao = 'confirmado'
      ) < ev.vagas_por_empresa)
    ORDER BY f.entrou_na_fila_em, f.id LIMIT 1 FOR UPDATE;
    EXIT WHEN NOT FOUND;
    UPDATE public.evento_confirmacoes
    SET situacao = 'confirmado', confirmado_em = pg_catalog.now(), promovido_em = pg_catalog.now(),
        atualizado_em = pg_catalog.now()
    WHERE id = prox;
    ev.total_confirmados := ev.total_confirmados + 1;
    ev.total_lista_espera := ev.total_lista_espera - 1;
    RETURN NEXT prox;
  END LOOP;
  UPDATE public.eventos SET total_confirmados = ev.total_confirmados,
    total_lista_espera = ev.total_lista_espera, atualizado_em = pg_catalog.now()
  WHERE id = p_evento;
  RETURN;
END
$$;--> statement-breakpoint

-- O cliente confirma presença: vaga livre = confirmado; lotado (no total ou na empresa dele) = lista de espera.
-- Trava a linha do evento: duas confirmações ao mesmo tempo nunca passam do limite. Idempotente (já ter presença
-- devolve a situação atual). Erros (mensagem do RAISE): evento_nao_encontrado, evento_cancelado, evento_encerrado,
-- prazo_encerrado, sem_sessao_do_portal.
CREATE FUNCTION app_evento_confirmar(p_evento uuid, p_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  v_acesso uuid := public.app_portal_acesso();
  v_empresa uuid := public.app_portal_empresa();
  ev public.eventos%ROWTYPE;
  existente public.evento_confirmacoes%ROWTYPE;
  da_empresa integer;
  lotado boolean;
  sit text;
BEGIN
  IF v_acesso IS NULL OR v_empresa IS NULL OR public.app_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'sem_sessao_do_portal';
  END IF;
  SELECT * INTO ev FROM public.eventos
  WHERE id = p_evento AND excluido_em IS NULL AND tenant_id = public.app_tenant_id() FOR UPDATE;
  IF NOT FOUND OR ev.situacao = 'rascunho' OR ev.publicado_em IS NULL
     OR (ev.alcance = 'empresas' AND NOT EXISTS (
       SELECT 1 FROM public.evento_empresas ee WHERE ee.evento_id = ev.id AND ee.empresa_id = v_empresa)) THEN
    RAISE EXCEPTION 'evento_nao_encontrado';
  END IF;
  IF ev.situacao = 'cancelado' THEN RAISE EXCEPTION 'evento_cancelado'; END IF;
  IF ev.inicio_em <= pg_catalog.now() THEN RAISE EXCEPTION 'evento_encerrado'; END IF;
  SELECT * INTO existente FROM public.evento_confirmacoes
  WHERE evento_id = ev.id AND acesso_id = v_acesso AND situacao <> 'cancelado';
  IF FOUND THEN RETURN existente.situacao::text; END IF;
  IF ev.prazo_confirmacao IS NOT NULL AND ev.prazo_confirmacao <= pg_catalog.now() THEN
    RAISE EXCEPTION 'prazo_encerrado';
  END IF;
  SELECT pg_catalog.count(*) INTO da_empresa FROM public.evento_confirmacoes
  WHERE evento_id = ev.id AND empresa_id = v_empresa AND situacao = 'confirmado';
  lotado := (ev.vagas_totais IS NOT NULL AND ev.total_confirmados >= ev.vagas_totais)
         OR (ev.vagas_por_empresa IS NOT NULL AND da_empresa >= ev.vagas_por_empresa);
  sit := CASE WHEN lotado THEN 'lista_espera' ELSE 'confirmado' END;
  INSERT INTO public.evento_confirmacoes (id, tenant_id, evento_id, acesso_id, empresa_id, situacao, confirmado_em)
  VALUES (p_id, ev.tenant_id, ev.id, v_acesso, v_empresa, sit::public.situacao_confirmacao,
          CASE WHEN lotado THEN NULL ELSE pg_catalog.now() END);
  UPDATE public.eventos SET
    total_confirmados = total_confirmados + CASE WHEN lotado THEN 0 ELSE 1 END,
    total_lista_espera = total_lista_espera + CASE WHEN lotado THEN 1 ELSE 0 END,
    atualizado_em = pg_catalog.now()
  WHERE id = ev.id;
  RETURN sit;
END
$$;--> statement-breakpoint

-- Cancela uma confirmação (ou a posição na fila) e promove quem estava esperando. Devolve os ids promovidos.
-- Interna: `app_evento_cancelar_presenca` (o cliente, a própria) e `app_evento_remover_participante` (a equipe).
CREATE FUNCTION app_evento_cancelar_confirmacao(p_confirmacao uuid)
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  c public.evento_confirmacoes%ROWTYPE;
  ev public.eventos%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.evento_confirmacoes
  WHERE id = p_confirmacao AND situacao <> 'cancelado' AND tenant_id = public.app_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'sem_presenca'; END IF;
  SELECT * INTO ev FROM public.eventos WHERE id = c.evento_id FOR UPDATE;
  -- relê a confirmação já com o evento travado (outra transação pode tê-la cancelado ou promovido)
  SELECT * INTO c FROM public.evento_confirmacoes
  WHERE id = p_confirmacao AND situacao <> 'cancelado' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sem_presenca'; END IF;
  UPDATE public.evento_confirmacoes
  SET situacao = 'cancelado', cancelado_em = pg_catalog.now(), atualizado_em = pg_catalog.now()
  WHERE id = c.id;
  UPDATE public.eventos SET
    total_confirmados = greatest(total_confirmados - CASE WHEN c.situacao = 'confirmado' THEN 1 ELSE 0 END, 0),
    total_lista_espera = greatest(total_lista_espera - CASE WHEN c.situacao = 'lista_espera' THEN 1 ELSE 0 END, 0),
    atualizado_em = pg_catalog.now()
  WHERE id = ev.id;
  RETURN QUERY SELECT * FROM public.app_evento_promover(ev.id);
END
$$;--> statement-breakpoint

-- O cliente cancela a PRÓPRIA presença, até o início do evento (o prazo de confirmação não impede cancelar).
CREATE FUNCTION app_evento_cancelar_presenca(p_evento uuid)
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  v_acesso uuid := public.app_portal_acesso();
  v_empresa uuid := public.app_portal_empresa();
  ev public.eventos%ROWTYPE;
  c uuid;
BEGIN
  IF v_acesso IS NULL OR v_empresa IS NULL OR public.app_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'sem_sessao_do_portal';
  END IF;
  SELECT * INTO ev FROM public.eventos
  WHERE id = p_evento AND excluido_em IS NULL AND tenant_id = public.app_tenant_id() FOR UPDATE;
  IF NOT FOUND OR ev.situacao = 'rascunho' OR ev.publicado_em IS NULL THEN
    RAISE EXCEPTION 'evento_nao_encontrado';
  END IF;
  IF ev.situacao = 'cancelado' THEN RAISE EXCEPTION 'evento_cancelado'; END IF;
  IF ev.inicio_em <= pg_catalog.now() THEN RAISE EXCEPTION 'evento_encerrado'; END IF;
  SELECT id INTO c FROM public.evento_confirmacoes
  WHERE evento_id = ev.id AND acesso_id = v_acesso AND situacao <> 'cancelado';
  IF NOT FOUND THEN RAISE EXCEPTION 'sem_presenca'; END IF;
  RETURN QUERY SELECT * FROM public.app_evento_cancelar_confirmacao(c);
END
$$;--> statement-breakpoint

-- A equipe tira uma pessoa do evento (confirmada ou na fila) e quem espera é promovido. Nunca na sessão do portal.
CREATE FUNCTION app_evento_remover_participante(p_confirmacao uuid)
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  IF public.app_portal_ativo() OR public.app_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;
  RETURN QUERY SELECT * FROM public.app_evento_cancelar_confirmacao(p_confirmacao);
END
$$;--> statement-breakpoint

-- A equipe mudou as vagas: promove quem passou a caber. Nunca na sessão do portal.
CREATE FUNCTION app_evento_reprocessar_vagas(p_evento uuid)
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  IF public.app_portal_ativo() OR public.app_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;
  RETURN QUERY SELECT * FROM public.app_evento_promover(p_evento);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_evento_promover(uuid), app_evento_confirmar(uuid, uuid), app_evento_cancelar_confirmacao(uuid),
  app_evento_cancelar_presenca(uuid), app_evento_remover_participante(uuid), app_evento_reprocessar_vagas(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_evento_confirmar(uuid, uuid), app_evento_cancelar_presenca(uuid),
  app_evento_remover_participante(uuid), app_evento_reprocessar_vagas(uuid) TO leadtogo_app;--> statement-breakpoint

-- Lembrete de 24 horas: o worker (sem empresa na sessão) descobre os eventos que entram na janela. Mesmo padrão das
-- limpezas (0009): política só para o dono, travada numa variável que só a função liga e desliga. Só LÊ; quem marca
-- o lembrete como enviado é o worker, dentro da empresa do evento.
CREATE POLICY eventos_lembrete_le ON eventos FOR SELECT TO leadtogo_owner
  USING (current_setting('app.lembrando_eventos', true) = '1');--> statement-breakpoint
CREATE FUNCTION app_eventos_a_lembrar()
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.lembrando_eventos', '1', true);
  RETURN QUERY
    SELECT e.id, e.tenant_id FROM public.eventos e
    WHERE e.situacao = 'publicado' AND e.excluido_em IS NULL AND e.lembrete_enviado_em IS NULL
      AND e.inicio_em > pg_catalog.now() AND e.inicio_em <= pg_catalog.now() + interval '24 hours'
    ORDER BY e.inicio_em LIMIT 500;
  PERFORM pg_catalog.set_config('app.lembrando_eventos', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_eventos_a_lembrar() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_eventos_a_lembrar() TO leadtogo_app;
