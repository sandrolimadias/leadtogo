CREATE TYPE "public"."origem_participacao" AS ENUM('portal', 'publico', 'equipe');--> statement-breakpoint
CREATE TYPE "public"."presenca_evento" AS ENUM('nao_registrada', 'checkin_qr', 'manual');--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ALTER COLUMN "acesso_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ALTER COLUMN "empresa_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_eventos_crm_ativo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_eventos_crm_responsavel_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_avaliacao_por_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "origem" "origem_participacao" DEFAULT 'portal' NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "nome" varchar(160);--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "email" "citext";--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "telefone" varchar(20);--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "cnpj" varchar(14);--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "contato_id" uuid;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "resposta_id" uuid;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "presenca" "presenca_evento" DEFAULT 'nao_registrada' NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "presenca_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "presenca_por" uuid;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "avaliacao_resposta_id" uuid;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "avaliacao_token_hash" text;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "avaliacao_pedida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "avaliacao_lembretes" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD COLUMN "crm_tratado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "publico" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "formulario_inscricao_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "formulario_avaliacao_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "publicacao_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "encerrado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "encerrado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "checkin_token_hash" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "checkin_exige_codigo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "checkin_abre_minutos" smallint DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD CONSTRAINT "evento_confirmacoes_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD CONSTRAINT "evento_confirmacoes_presenca_por_membros_id_fk" FOREIGN KEY ("presenca_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_encerrado_por_membros_id_fk" FOREIGN KEY ("encerrado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evento_confirmacoes_email_uq" ON "evento_confirmacoes" USING btree ("evento_id","email") WHERE "evento_confirmacoes"."situacao" <> 'cancelado' AND "evento_confirmacoes"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evento_confirmacoes_avaliacao_uq" ON "evento_confirmacoes" USING btree ("avaliacao_token_hash");--> statement-breakpoint
CREATE INDEX "evento_confirmacoes_empresa_hist_idx" ON "evento_confirmacoes" USING btree ("tenant_id","empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_checkin_uq" ON "eventos" USING btree ("checkin_token_hash");--> statement-breakpoint
ALTER TABLE "evento_confirmacoes" ADD CONSTRAINT "evento_confirmacoes_quem_chk" CHECK ("evento_confirmacoes"."acesso_id" IS NOT NULL OR "evento_confirmacoes"."email" IS NOT NULL);--> statement-breakpoint

-- Portal, Fase 4G (docs/plano_portal_formularios_e_eventos.md, seção 9). Só expansão.
-- FKs que ficam só no SQL (evitam ciclo entre os schemas)
ALTER TABLE eventos ADD CONSTRAINT eventos_formulario_inscricao_fk FOREIGN KEY (formulario_inscricao_id) REFERENCES formularios(id);--> statement-breakpoint
ALTER TABLE eventos ADD CONSTRAINT eventos_formulario_avaliacao_fk FOREIGN KEY (formulario_avaliacao_id) REFERENCES formularios(id);--> statement-breakpoint
ALTER TABLE eventos ADD CONSTRAINT eventos_publicacao_fk FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id);--> statement-breakpoint
ALTER TABLE evento_confirmacoes ADD CONSTRAINT evento_confirmacoes_resposta_fk FOREIGN KEY (resposta_id) REFERENCES formulario_respostas(id);--> statement-breakpoint
ALTER TABLE evento_confirmacoes ADD CONSTRAINT evento_confirmacoes_avaliacao_fk FOREIGN KEY (avaliacao_resposta_id) REFERENCES formulario_respostas(id);--> statement-breakpoint
ALTER TABLE tenant_configuracoes ADD CONSTRAINT tenant_configuracoes_eventos_crm_responsavel_fk FOREIGN KEY (portal_eventos_crm_responsavel_id) REFERENCES membros(id);--> statement-breakpoint

-- Inscrição (portal, página pública ou equipe), com vagas, vagas por empresa e lista de espera, travando a linha do
-- evento. Na sessão do portal, quem é a pessoa vem da SESSÃO (os dados recebidos só completam nome/e-mail/CNPJ) e o
-- alcance é conferido (todos, empresas ou tags). Fora do portal: "publico" exige evento público; "equipe" é a
-- presença registrada pela equipe (vale depois do início). Idempotente: já inscrito devolve a situação atual.
-- Erros (mensagem do RAISE): evento_nao_encontrado, evento_cancelado, evento_encerrado, prazo_encerrado,
-- evento_so_associados, sem_email.
CREATE FUNCTION app_evento_inscrever(p_evento uuid, p_id uuid, p_dados jsonb)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  portal boolean := public.app_portal_ativo();
  v_acesso uuid;
  v_empresa uuid;
  v_contato uuid;
  v_origem text := coalesce(p_dados->>'origem', 'portal');
  v_email public.citext := nullif(p_dados->>'email', '')::public.citext;
  ev public.eventos%ROWTYPE;
  existente public.evento_confirmacoes%ROWTYPE;
  da_empresa integer := 0;
  lotado boolean;
  sit text;
BEGIN
  IF public.app_tenant_id() IS NULL THEN RAISE EXCEPTION 'evento_nao_encontrado'; END IF;
  IF portal THEN
    v_acesso := public.app_portal_acesso();
    v_empresa := public.app_portal_empresa();
    v_contato := public.app_portal_contato();
    v_origem := 'portal';
  ELSE
    IF v_origem NOT IN ('publico', 'equipe') THEN RAISE EXCEPTION 'evento_nao_encontrado'; END IF;
    v_empresa := nullif(p_dados->>'empresa_id', '')::uuid;
    v_contato := nullif(p_dados->>'contato_id', '')::uuid;
    IF v_email IS NULL THEN RAISE EXCEPTION 'sem_email'; END IF;
  END IF;
  SELECT * INTO ev FROM public.eventos
  WHERE id = p_evento AND excluido_em IS NULL AND tenant_id = public.app_tenant_id() FOR UPDATE;
  IF NOT FOUND OR ev.situacao = 'rascunho' OR ev.publicado_em IS NULL THEN
    RAISE EXCEPTION 'evento_nao_encontrado';
  END IF;
  IF portal AND NOT (ev.alcance::text = 'todos'
      OR (ev.alcance::text = 'empresas' AND EXISTS (
        SELECT 1 FROM public.evento_empresas ee WHERE ee.evento_id = ev.id AND ee.empresa_id = v_empresa))
      OR (ev.alcance::text = 'tags' AND EXISTS (
        SELECT 1 FROM public.evento_tags et JOIN public.contato_tags ct ON ct.tag_id = et.tag_id
        WHERE et.evento_id = ev.id AND ct.contato_id = v_contato))) THEN
    RAISE EXCEPTION 'evento_nao_encontrado';
  END IF;
  IF v_origem = 'publico' AND NOT ev.publico THEN RAISE EXCEPTION 'evento_so_associados'; END IF;
  IF ev.situacao = 'cancelado' THEN RAISE EXCEPTION 'evento_cancelado'; END IF;
  IF ev.encerrado_em IS NOT NULL THEN RAISE EXCEPTION 'evento_encerrado'; END IF;
  IF v_origem <> 'equipe' AND ev.inicio_em <= pg_catalog.now() THEN RAISE EXCEPTION 'evento_encerrado'; END IF;
  IF v_acesso IS NOT NULL THEN
    SELECT * INTO existente FROM public.evento_confirmacoes
    WHERE evento_id = ev.id AND acesso_id = v_acesso AND situacao <> 'cancelado';
  ELSE
    SELECT * INTO existente FROM public.evento_confirmacoes
    WHERE evento_id = ev.id AND email = v_email AND situacao <> 'cancelado';
  END IF;
  IF FOUND THEN RETURN existente.situacao::text; END IF;
  IF v_origem <> 'equipe' AND ev.prazo_confirmacao IS NOT NULL AND ev.prazo_confirmacao <= pg_catalog.now() THEN
    RAISE EXCEPTION 'prazo_encerrado';
  END IF;
  IF v_empresa IS NOT NULL THEN
    SELECT pg_catalog.count(*) INTO da_empresa FROM public.evento_confirmacoes
    WHERE evento_id = ev.id AND empresa_id = v_empresa AND situacao = 'confirmado';
  END IF;
  -- A equipe registra presença de quem veio: nunca vai para a fila
  lotado := v_origem <> 'equipe' AND (
    (ev.vagas_totais IS NOT NULL AND ev.total_confirmados >= ev.vagas_totais)
    OR (v_empresa IS NOT NULL AND ev.vagas_por_empresa IS NOT NULL AND da_empresa >= ev.vagas_por_empresa));
  sit := CASE WHEN lotado THEN 'lista_espera' ELSE 'confirmado' END;
  INSERT INTO public.evento_confirmacoes (id, tenant_id, evento_id, acesso_id, empresa_id, situacao, confirmado_em,
    origem, nome, email, telefone, cnpj, contato_id, resposta_id)
  VALUES (p_id, ev.tenant_id, ev.id, v_acesso, v_empresa, sit::public.situacao_confirmacao,
    CASE WHEN lotado THEN NULL ELSE pg_catalog.now() END, v_origem::public.origem_participacao,
    left(nullif(p_dados->>'nome', ''), 160), v_email, left(nullif(p_dados->>'telefone', ''), 20),
    left(nullif(p_dados->>'cnpj', ''), 14), v_contato, nullif(p_dados->>'resposta_id', '')::uuid);
  UPDATE public.eventos SET
    total_confirmados = total_confirmados + CASE WHEN lotado THEN 0 ELSE 1 END,
    total_lista_espera = total_lista_espera + CASE WHEN lotado THEN 1 ELSE 0 END,
    atualizado_em = pg_catalog.now()
  WHERE id = ev.id;
  RETURN sit;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_evento_inscrever(uuid, uuid, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_evento_inscrever(uuid, uuid, jsonb) TO leadtogo_app;--> statement-breakpoint

-- A confirmação antiga do portal passa pela inscrição nova (que confere também o alcance por tags)
CREATE OR REPLACE FUNCTION app_evento_confirmar(p_evento uuid, p_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  IF NOT public.app_portal_ativo() THEN RAISE EXCEPTION 'sem_sessao_do_portal'; END IF;
  RETURN public.app_evento_inscrever(p_evento, p_id, '{}'::jsonb);
END
$$;--> statement-breakpoint

-- QR de check-in: o token chega sem o tenant. Políticas só do dono, travadas em app.checkin_evento.
CREATE POLICY eventos_por_checkin ON eventos FOR SELECT TO leadtogo_owner
  USING (current_setting('app.checkin_evento', true) <> '' AND checkin_token_hash = current_setting('app.checkin_evento', true));--> statement-breakpoint
CREATE FUNCTION app_evento_por_checkin(p_hash text)
  RETURNS TABLE (tenant_id uuid, evento_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.checkin_evento', coalesce(p_hash, ''), true);
  RETURN QUERY SELECT e.tenant_id, e.id FROM public.eventos e
    WHERE e.checkin_token_hash = p_hash AND e.excluido_em IS NULL AND e.situacao = 'publicado';
  PERFORM pg_catalog.set_config('app.checkin_evento', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_evento_por_checkin(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_evento_por_checkin(text) TO leadtogo_app;--> statement-breakpoint

-- Link pessoal da avaliação (e-mail a quem não tem acesso ao portal): o token chega sem o tenant.
CREATE POLICY evento_confirmacoes_por_avaliacao ON evento_confirmacoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.avaliacao_evento', true) <> '' AND avaliacao_token_hash = current_setting('app.avaliacao_evento', true));--> statement-breakpoint
CREATE FUNCTION app_participacao_por_avaliacao(p_hash text)
  RETURNS TABLE (tenant_id uuid, participacao_id uuid, evento_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.avaliacao_evento', coalesce(p_hash, ''), true);
  RETURN QUERY SELECT c.tenant_id, c.id, c.evento_id FROM public.evento_confirmacoes c
    WHERE c.avaliacao_token_hash = p_hash AND c.situacao <> 'cancelado';
  PERFORM pg_catalog.set_config('app.avaliacao_evento', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_participacao_por_avaliacao(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_participacao_por_avaliacao(text) TO leadtogo_app;
