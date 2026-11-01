-- Portal, Fase 4G (docs/plano_portal_formularios_e_eventos.md, seção 9). Só expansão: funções para o cliente do
-- portal registrar a avaliação e o check-in na PRÓPRIA participação (a sessão do portal não altera a tabela).

-- A avaliação do evento (o formulário já foi gravado): só presente, evento encerrado, uma vez.
CREATE FUNCTION app_evento_registrar_avaliacao(p_evento uuid, p_resposta uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  v_acesso uuid := public.app_portal_acesso();
  c uuid;
BEGIN
  IF v_acesso IS NULL OR public.app_tenant_id() IS NULL THEN RAISE EXCEPTION 'sem_sessao_do_portal'; END IF;
  SELECT x.id INTO c FROM public.evento_confirmacoes x JOIN public.eventos e ON e.id = x.evento_id
  WHERE x.evento_id = p_evento AND x.acesso_id = v_acesso AND x.situacao <> 'cancelado'
    AND x.presenca <> 'nao_registrada' AND e.encerrado_em IS NOT NULL AND e.tenant_id = public.app_tenant_id()
  FOR UPDATE OF x;
  IF NOT FOUND THEN RAISE EXCEPTION 'sem_presenca'; END IF;
  UPDATE public.evento_confirmacoes SET avaliacao_resposta_id = p_resposta, atualizado_em = pg_catalog.now()
  WHERE id = c AND avaliacao_resposta_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'ja_avaliado'; END IF;
END
$$;--> statement-breakpoint

-- Check-in pelo QR, logado: marca a presença da própria inscrição.
CREATE FUNCTION app_evento_checkin_portal(p_evento uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  v_acesso uuid := public.app_portal_acesso();
  nome text;
BEGIN
  IF v_acesso IS NULL OR public.app_tenant_id() IS NULL THEN RAISE EXCEPTION 'sem_sessao_do_portal'; END IF;
  UPDATE public.evento_confirmacoes SET
    presenca = CASE WHEN presenca = 'nao_registrada' THEN 'checkin_qr'::public.presenca_evento ELSE presenca END,
    presenca_em = coalesce(presenca_em, pg_catalog.now()), atualizado_em = pg_catalog.now()
  WHERE evento_id = p_evento AND acesso_id = v_acesso AND situacao = 'confirmado' AND tenant_id = public.app_tenant_id()
  RETURNING evento_confirmacoes.nome INTO nome;
  IF NOT FOUND THEN RAISE EXCEPTION 'sem_inscricao'; END IF;
  RETURN coalesce(nome, '');
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_evento_registrar_avaliacao(uuid, uuid), app_evento_checkin_portal(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_evento_registrar_avaliacao(uuid, uuid), app_evento_checkin_portal(uuid) TO leadtogo_app;
