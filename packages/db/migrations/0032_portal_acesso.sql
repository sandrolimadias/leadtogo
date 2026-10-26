CREATE TYPE "public"."finalidade_link_portal" AS ENUM('convite', 'entrada', 'troca_email');--> statement-breakpoint
CREATE TYPE "public"."papel_portal" AS ENUM('responsavel', 'colega');--> statement-breakpoint
CREATE TYPE "public"."situacao_acesso_portal" AS ENUM('convidado', 'ativo', 'suspenso', 'revogado');--> statement-breakpoint
CREATE TYPE "public"."situacao_pedido_acesso" AS ENUM('pendente', 'aprovado', 'recusado');--> statement-breakpoint
CREATE TABLE "chamado_atividades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"atividade_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chamado_avaliacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"nota" smallint NOT NULL,
	"comentario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chamado_avaliacoes_nota_chk" CHECK ("chamado_avaliacoes"."nota" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "portal_acessos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"papel" "papel_portal" DEFAULT 'colega' NOT NULL,
	"situacao" "situacao_acesso_portal" DEFAULT 'convidado' NOT NULL,
	"convidado_por" uuid,
	"aceito_em" timestamp with time zone,
	"ultimo_acesso_em" timestamp with time zone,
	"privacidade_aceita_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"finalidade" "finalidade_link_portal" NOT NULL,
	"token_hash" text NOT NULL,
	"email_destino" "citext",
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_links_troca_chk" CHECK (("portal_links"."finalidade" = 'troca_email') = ("portal_links"."email_destino" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "portal_pedidos_acesso" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pedido_por" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" "citext" NOT NULL,
	"cargo" text,
	"situacao" "situacao_pedido_acesso" DEFAULT 'pendente' NOT NULL,
	"tratado_por" uuid,
	"tratado_em" timestamp with time zone,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_pedidos_tratado_chk" CHECK (("portal_pedidos_acesso"."situacao" = 'pendente') = ("portal_pedidos_acesso"."tratado_em" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "portal_segundo_fator" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"segredo_cifrado" text NOT NULL,
	"confirmado_em" timestamp with time zone,
	"codigos_recuperacao" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_sessoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"acesso_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"valida_ate_em" timestamp with time zone NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"agente" text,
	"segundo_fator_em" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_ativo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_nome" text;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_exige_dois_fatores_responsavel" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chamado_atividades" ADD CONSTRAINT "chamado_atividades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_atividades" ADD CONSTRAINT "chamado_atividades_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_atividades" ADD CONSTRAINT "chamado_atividades_atividade_id_atividades_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_atividades" ADD CONSTRAINT "chamado_atividades_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_atividades" ADD CONSTRAINT "chamado_atividades_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_avaliacoes" ADD CONSTRAINT "chamado_avaliacoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_avaliacoes" ADD CONSTRAINT "chamado_avaliacoes_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_avaliacoes" ADD CONSTRAINT "chamado_avaliacoes_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_acessos" ADD CONSTRAINT "portal_acessos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_acessos" ADD CONSTRAINT "portal_acessos_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_acessos" ADD CONSTRAINT "portal_acessos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_acessos" ADD CONSTRAINT "portal_acessos_convidado_por_membros_id_fk" FOREIGN KEY ("convidado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_acessos" ADD CONSTRAINT "portal_acessos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_acessos" ADD CONSTRAINT "portal_acessos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_pedidos_acesso" ADD CONSTRAINT "portal_pedidos_acesso_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_pedidos_acesso" ADD CONSTRAINT "portal_pedidos_acesso_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_pedidos_acesso" ADD CONSTRAINT "portal_pedidos_acesso_pedido_por_portal_acessos_id_fk" FOREIGN KEY ("pedido_por") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_pedidos_acesso" ADD CONSTRAINT "portal_pedidos_acesso_tratado_por_membros_id_fk" FOREIGN KEY ("tratado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_segundo_fator" ADD CONSTRAINT "portal_segundo_fator_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_segundo_fator" ADD CONSTRAINT "portal_segundo_fator_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessoes" ADD CONSTRAINT "portal_sessoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessoes" ADD CONSTRAINT "portal_sessoes_acesso_id_portal_acessos_id_fk" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chamado_atividades_uq" ON "chamado_atividades" USING btree ("chamado_id","atividade_id");--> statement-breakpoint
CREATE INDEX "chamado_atividades_chamado_idx" ON "chamado_atividades" USING btree ("chamado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chamado_avaliacoes_chamado_uq" ON "chamado_avaliacoes" USING btree ("chamado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_acessos_contato_uq" ON "portal_acessos" USING btree ("contato_id","empresa_id") WHERE "portal_acessos"."situacao" <> 'revogado' AND "portal_acessos"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_acessos_email_uq" ON "portal_acessos" USING btree ("empresa_id","email") WHERE "portal_acessos"."situacao" <> 'revogado' AND "portal_acessos"."excluido_em" IS NULL;--> statement-breakpoint
CREATE INDEX "portal_acessos_empresa_idx" ON "portal_acessos" USING btree ("tenant_id","empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_links_hash_uq" ON "portal_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "portal_links_acesso_idx" ON "portal_links" USING btree ("acesso_id");--> statement-breakpoint
CREATE INDEX "portal_pedidos_situacao_idx" ON "portal_pedidos_acesso" USING btree ("tenant_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_segundo_fator_acesso_uq" ON "portal_segundo_fator" USING btree ("acesso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_sessoes_hash_uq" ON "portal_sessoes" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "portal_sessoes_acesso_idx" ON "portal_sessoes" USING btree ("acesso_id");--> statement-breakpoint
-- ============================================================================================
-- Portal do Cliente (Fase 3A): isolamento em duas camadas (docs/plano_portal_cliente.md, seção 3).
-- Camada 1: o tenant, como sempre (app.tenant_id). Camada 2: a empresa-cliente. A sessão do portal
-- preenche app.portal_acesso_id, app.portal_empresa_id e app.portal_contato_id (a API, nunca o CRM);
-- com a variável preenchida valem POLÍTICAS RESTRITIVAS (somam-se às do tenant, nunca as afrouxam).
-- Falha fechada: acesso preenchido e empresa vazia não enxerga linha nenhuma das tabelas escopadas.
-- ============================================================================================
CREATE FUNCTION app_portal_ativo() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
  AS $$ SELECT nullif(current_setting('app.portal_acesso_id', true), '') IS NOT NULL $$;--> statement-breakpoint
CREATE FUNCTION app_portal_acesso() RETURNS uuid
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
  AS $$ SELECT nullif(current_setting('app.portal_acesso_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION app_portal_empresa() RETURNS uuid
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
  AS $$ SELECT nullif(current_setting('app.portal_empresa_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION app_portal_contato() RETURNS uuid
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
  AS $$ SELECT nullif(current_setting('app.portal_contato_id', true), '')::uuid $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_portal_ativo(), app_portal_acesso(), app_portal_empresa(), app_portal_contato() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_ativo(), app_portal_acesso(), app_portal_empresa(), app_portal_contato() TO leadtogo_app, leadtogo_owner;--> statement-breakpoint

-- Negado por padrão: a sessão do portal não enxerga nem grava a tabela. Quem precisa dela troca esta
-- política pelas suas (DROP POLICY portal_negado + políticas escopadas).
CREATE FUNCTION aplicar_portal_negado(tabela regclass) RETURNS void
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS portal_negado ON %s', tabela);
  EXECUTE format('CREATE POLICY portal_negado ON %s AS RESTRICTIVE FOR ALL USING (NOT app_portal_ativo())', tabela);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION aplicar_portal_negado(regclass) FROM PUBLIC;--> statement-breakpoint

-- Toda tabela nova que passa por aplicar_rls_tenant já nasce negada ao portal
CREATE OR REPLACE FUNCTION aplicar_rls_tenant(tabela regclass, coluna name DEFAULT 'tenant_id') RETURNS void
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabela);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabela);

  EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_select ON %s FOR SELECT USING (%I = app_tenant_id() OR %I = ANY (app_tenant_ids()))',
    tabela, coluna, coluna);

  EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK (%I = app_tenant_id())',
    tabela, coluna);

  EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_update ON %s FOR UPDATE USING (%I = app_tenant_id()) WITH CHECK (%I = app_tenant_id())',
    tabela, coluna, coluna);

  EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON %s', tabela);
  EXECUTE format(
    'CREATE POLICY tenant_delete ON %s FOR DELETE USING (%I = app_tenant_id())',
    tabela, coluna);

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO leadtogo_app', tabela);
  PERFORM aplicar_portal_negado(tabela);
END
$$;--> statement-breakpoint

SELECT aplicar_rls_tenant('portal_acessos');--> statement-breakpoint
SELECT aplicar_rls_tenant('portal_links');--> statement-breakpoint
SELECT aplicar_rls_tenant('portal_sessoes');--> statement-breakpoint
SELECT aplicar_rls_tenant('portal_segundo_fator');--> statement-breakpoint
SELECT aplicar_rls_tenant('portal_pedidos_acesso');--> statement-breakpoint
SELECT aplicar_rls_tenant('chamado_avaliacoes');--> statement-breakpoint
SELECT aplicar_rls_tenant('chamado_atividades');--> statement-breakpoint

-- As tabelas que já existem também passam a negar o portal, EXCETO as que ele usa (cada uma ganha,
-- abaixo, o tratamento próprio): chamados e seus filhos, notificações, empresa e contato do cliente, o
-- que a abertura do chamado lê (membros, áreas, expediente, feriados, triagem, configuração, tenants) e
-- o que ela grava (auditoria e outbox).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT DISTINCT c.oid::regclass AS tabela, c.relname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'tenant_select' AND n.nspname = 'public'
      AND c.relname NOT IN (
        'portal_acessos', 'portal_links', 'portal_sessoes', 'portal_segundo_fator', 'portal_pedidos_acesso',
        'chamado_avaliacoes', 'chamado_atividades',
        'chamados', 'chamado_mensagens', 'chamado_anexos', 'chamado_eventos', 'chamado_notas_internas',
        'notificacoes', 'empresas', 'contatos', 'contato_telefones', 'contato_emails', 'empresa_contatos',
        'membros', 'areas_atendimento', 'calendario_expediente', 'feriados', 'config_triagem',
        'triagem_membros', 'tenant_configuracoes', 'tenants', 'auditoria', 'eventos_outbox'
      )
  LOOP
    PERFORM aplicar_portal_negado(t.tabela);
  END LOOP;
END
$$;--> statement-breakpoint

-- Somente leitura para o portal (lê, nunca grava)
DO $$
DECLARE
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['membros', 'areas_atendimento', 'calendario_expediente', 'feriados',
    'config_triagem', 'triagem_membros', 'tenants']
  LOOP
    EXECUTE format('CREATE POLICY portal_so_leitura_ins ON %I AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo())', nome);
    EXECUTE format('CREATE POLICY portal_so_leitura_upd ON %I AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo())', nome);
    EXECUTE format('CREATE POLICY portal_so_leitura_del ON %I AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo())', nome);
  END LOOP;
END
$$;--> statement-breakpoint

-- Chamados: só os da empresa-cliente da sessão; os filhos herdam pelo chamado
CREATE POLICY portal_escopo ON chamados AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR empresa_cliente_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_escopo ON chamado_mensagens AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR EXISTS (SELECT 1 FROM chamados c WHERE c.id = chamado_id));--> statement-breakpoint
CREATE POLICY portal_escopo ON chamado_anexos AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR EXISTS (SELECT 1 FROM chamados c WHERE c.id = chamado_id));--> statement-breakpoint
-- A linha do tempo interna o cliente não lê; a abertura e a resposta dele gravam eventos
CREATE POLICY portal_leitura_negada ON chamado_eventos AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON chamado_eventos AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR EXISTS (SELECT 1 FROM chamados c WHERE c.id = chamado_id));--> statement-breakpoint
SELECT aplicar_portal_negado('chamado_notas_internas');--> statement-breakpoint
SELECT aplicar_portal_negado('area_membros');--> statement-breakpoint

-- Notificações: as do próprio contato
CREATE POLICY portal_escopo ON notificacoes AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR (destinatario_tipo = 'contato' AND contato_id = app_portal_contato()));--> statement-breakpoint

-- A empresa-cliente e o próprio contato
CREATE POLICY portal_escopo_sel ON empresas AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON empresas AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON empresas AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON empresas AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON empresa_contatos AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON empresa_contatos AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON empresa_contatos AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON empresa_contatos AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON contatos AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR id = app_portal_contato() OR EXISTS (
    SELECT 1 FROM empresa_contatos ec WHERE ec.contato_id = contatos.id AND ec.empresa_id = app_portal_empresa()));--> statement-breakpoint
CREATE POLICY portal_escopo_upd ON contatos AS RESTRICTIVE FOR UPDATE
  USING (NOT app_portal_ativo() OR id = app_portal_contato());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON contatos AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON contatos AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_escopo ON contato_telefones AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR contato_id = app_portal_contato());--> statement-breakpoint
CREATE POLICY portal_escopo ON contato_emails AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR contato_id = app_portal_contato());--> statement-breakpoint

-- Tabelas novas do portal: o que a sessão enxerga e grava
DROP POLICY portal_negado ON portal_acessos;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON portal_acessos AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_escopo_upd ON portal_acessos AS RESTRICTIVE FOR UPDATE
  USING (NOT app_portal_ativo() OR id = app_portal_acesso());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON portal_acessos AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON portal_acessos AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
DROP POLICY portal_negado ON portal_links;--> statement-breakpoint
CREATE POLICY portal_escopo ON portal_links AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
DROP POLICY portal_negado ON portal_sessoes;--> statement-breakpoint
CREATE POLICY portal_escopo ON portal_sessoes AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
DROP POLICY portal_negado ON portal_segundo_fator;--> statement-breakpoint
CREATE POLICY portal_escopo ON portal_segundo_fator AS RESTRICTIVE FOR ALL
  USING (NOT app_portal_ativo() OR acesso_id = app_portal_acesso());--> statement-breakpoint
DROP POLICY portal_negado ON portal_pedidos_acesso;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON portal_pedidos_acesso AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON portal_pedidos_acesso AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (empresa_id = app_portal_empresa() AND pedido_por = app_portal_acesso()));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON portal_pedidos_acesso AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON portal_pedidos_acesso AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
DROP POLICY portal_negado ON chamado_avaliacoes;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON chamado_avaliacoes AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR EXISTS (SELECT 1 FROM chamados c WHERE c.id = chamado_id));--> statement-breakpoint
CREATE POLICY portal_escopo_ins ON chamado_avaliacoes AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_portal_ativo() OR (acesso_id = app_portal_acesso()
    AND EXISTS (SELECT 1 FROM chamados c WHERE c.id = chamado_id)));--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON chamado_avaliacoes AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON chamado_avaliacoes AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint

-- Entrada pelo e-mail (ainda sem tenant): função SECURITY DEFINER mínima e política só para o
-- leadtogo_owner, travada numa variável que só a função define e limpa (mesmo padrão das migrações
-- 0016, 0026 e 0031). Devolve APENAS (tenant, acesso) dos acessos ativos com aquele e-mail.
CREATE POLICY portal_entrada_por_email ON portal_acessos FOR SELECT TO leadtogo_owner
  USING (current_setting('app.portal_entrada', true) = '1' AND situacao = 'ativo' AND excluido_em IS NULL
    AND email = current_setting('app.portal_email', true)::citext);--> statement-breakpoint
CREATE FUNCTION app_portal_acessos_por_email(p_email citext)
  RETURNS TABLE (tenant_id uuid, acesso_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.portal_entrada', '1', true);
  PERFORM pg_catalog.set_config('app.portal_email', p_email::text, true);
  RETURN QUERY
    SELECT a.tenant_id, a.id FROM public.portal_acessos a
    WHERE a.situacao = 'ativo' AND a.excluido_em IS NULL AND a.email = p_email
    ORDER BY a.criado_em;
  PERFORM pg_catalog.set_config('app.portal_entrada', '', true);
  PERFORM pg_catalog.set_config('app.portal_email', '', true);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_portal_acessos_por_email(citext) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_acessos_por_email(citext) TO leadtogo_app;--> statement-breakpoint

-- Limpeza periódica (job de manutenção): links vencidos há 30 dias e sessões vencidas há 90
CREATE POLICY portal_links_limpeza ON portal_links FOR DELETE TO leadtogo_owner
  USING (current_setting('app.portal_limpeza', true) = '1');--> statement-breakpoint
CREATE POLICY portal_sessoes_limpeza ON portal_sessoes FOR DELETE TO leadtogo_owner
  USING (current_setting('app.portal_limpeza', true) = '1');--> statement-breakpoint
CREATE POLICY portal_links_limpeza_sel ON portal_links FOR SELECT TO leadtogo_owner
  USING (current_setting('app.portal_limpeza', true) = '1');--> statement-breakpoint
CREATE POLICY portal_sessoes_limpeza_sel ON portal_sessoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.portal_limpeza', true) = '1');--> statement-breakpoint
CREATE FUNCTION app_portal_limpar()
  RETURNS TABLE (links integer, sessoes integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  n_links integer;
  n_sessoes integer;
BEGIN
  PERFORM pg_catalog.set_config('app.portal_limpeza', '1', true);
  DELETE FROM public.portal_links WHERE expira_em < pg_catalog.now() - interval '30 days';
  GET DIAGNOSTICS n_links = ROW_COUNT;
  DELETE FROM public.portal_sessoes WHERE valida_ate_em < pg_catalog.now() - interval '90 days'
    OR (revogada_em IS NOT NULL AND revogada_em < pg_catalog.now() - interval '90 days');
  GET DIAGNOSTICS n_sessoes = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.portal_limpeza', '', true);
  RETURN QUERY SELECT n_links, n_sessoes;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_portal_limpar() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_limpar() TO leadtogo_app;
