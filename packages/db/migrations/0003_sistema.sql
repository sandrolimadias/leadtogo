CREATE TYPE "public"."origem_auditoria" AS ENUM('app', 'api', 'integracao', 'sistema');--> statement-breakpoint
CREATE TABLE "arquivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chave_arquivo" text NOT NULL,
	"nome" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho" bigint NOT NULL,
	"entidade_tipo" text,
	"entidade_id" uuid,
	"enviado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
-- Particionada por mês (UTC); o Drizzle não gera PARTITION BY, então esta tabela é editada à mão.
CREATE TABLE "auditoria" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" uuid NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid,
	"acao" text NOT NULL,
	"alteracoes" jsonb,
	"membro_id" uuid,
	"origem" "origem_auditoria" DEFAULT 'app' NOT NULL,
	"ip" "inet",
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_id_em_pk" PRIMARY KEY("id","em")
) PARTITION BY RANGE ("em");
--> statement-breakpoint
CREATE TABLE "eventos_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"entidade_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"mensagem" text,
	"link" text,
	"lida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviado_por_membros_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_outbox" ADD CONSTRAINT "eventos_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_membro_id_membros_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "arquivos_chave_arquivo_uq" ON "arquivos" USING btree ("chave_arquivo");--> statement-breakpoint
CREATE INDEX "arquivos_entidade_idx" ON "arquivos" USING btree ("tenant_id","entidade_tipo","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria" USING btree ("tenant_id","entidade","entidade_id","em");--> statement-breakpoint
CREATE INDEX "eventos_outbox_pendentes_idx" ON "eventos_outbox" USING btree ("criado_em") WHERE "eventos_outbox"."processado_em" IS NULL;--> statement-breakpoint
CREATE INDEX "notificacoes_nao_lidas_idx" ON "notificacoes" USING btree ("tenant_id","membro_id","criado_em") WHERE "notificacoes"."lida_em" IS NULL;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_foto_arquivo_id_arquivos_id_fk" FOREIGN KEY ("foto_arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_arquivo_id_arquivos_id_fk" FOREIGN KEY ("logo_arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Manutenção das partições: só o leadtogo_owner executa (o app não recebe EXECUTE).
-- Cria a partição do mês de `mes` (UTC) se ainda não existir e devolve o nome dela.
-- As partições têm RLS forçado e NENHUMA política: o acesso direto a elas (fora da tabela-mãe,
-- onde estão as políticas) não lê nada, nem para o dono. O app nem tem privilégio nelas.
CREATE FUNCTION criar_particao_auditoria(mes date) RETURNS text
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
DECLARE
  inicio date := date_trunc('month', mes)::date;
  fim date := (date_trunc('month', mes) + interval '1 month')::date;
  nome text := format('auditoria_%s', to_char(inicio, 'YYYY_MM'));
BEGIN
  IF to_regclass(format('public.%I', nome)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF auditoria FOR VALUES FROM (%L) TO (%L)',
      nome, inicio::text || ' 00:00:00+00', fim::text || ' 00:00:00+00');
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nome);
  END IF;
  RETURN nome;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION criar_particao_auditoria(date) FROM PUBLIC;
--> statement-breakpoint
-- Rede de segurança: datas fora das partições criadas caem aqui em vez de falhar o INSERT.
CREATE TABLE "auditoria_default" PARTITION OF "auditoria" DEFAULT;
--> statement-breakpoint
ALTER TABLE "auditoria_default" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auditoria_default" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Do mês anterior até 12 meses à frente
SELECT criar_particao_auditoria((date_trunc('month', now()) + make_interval(months => m))::date)
  FROM generate_series(-1, 12) AS m;
--> statement-breakpoint
SELECT aplicar_rls_tenant('arquivos');
--> statement-breakpoint
SELECT aplicar_rls_tenant('notificacoes');
--> statement-breakpoint
SELECT aplicar_rls_tenant('eventos_outbox');
--> statement-breakpoint
SELECT aplicar_rls_tenant('auditoria');
--> statement-breakpoint
-- Log só de acréscimo: o app insere e lê, nunca altera nem apaga (as políticas de UPDATE e
-- DELETE existem, mas sem privilégio nada as alcança).
REVOKE UPDATE, DELETE ON "auditoria" FROM leadtogo_app;
