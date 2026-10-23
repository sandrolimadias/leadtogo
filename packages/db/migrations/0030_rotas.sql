CREATE TYPE "public"."estimativa_rota" AS ENUM('ruas', 'linha_reta');--> statement-breakpoint
CREATE TYPE "public"."partida_rota" AS ENUM('posicao_atual', 'ponto');--> statement-breakpoint
CREATE TYPE "public"."situacao_parada" AS ENUM('pendente', 'visitada', 'pulada');--> statement-breakpoint
CREATE TYPE "public"."situacao_rota" AS ENUM('planejada', 'em_andamento', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TABLE "rota_paradas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rota_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem" smallint NOT NULL,
	"distancia_trecho_m" integer,
	"duracao_trecho_s" integer,
	"situacao" "situacao_parada" DEFAULT 'pendente' NOT NULL,
	"motivo_pulo" text,
	"atividade_id" uuid,
	"resolvida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "rota_paradas_ordem_chk" CHECK ("rota_paradas"."ordem" >= 1),
	CONSTRAINT "rota_paradas_pulo_chk" CHECK (("rota_paradas"."situacao" = 'pulada') = ("rota_paradas"."motivo_pulo" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "rota_pontos_partida" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"endereco" text,
	"localizacao" geography(Point,4326) NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rotas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"codigo" integer NOT NULL,
	"nome" text NOT NULL,
	"data" date NOT NULL,
	"responsavel_id" uuid NOT NULL,
	"partida" "partida_rota" DEFAULT 'posicao_atual' NOT NULL,
	"ponto_partida_id" uuid,
	"voltar_ao_inicio" boolean DEFAULT true NOT NULL,
	"minutos_por_visita" smallint DEFAULT 40 NOT NULL,
	"situacao" "situacao_rota" DEFAULT 'planejada' NOT NULL,
	"distancia_m" integer,
	"duracao_s" integer,
	"estimativa" "estimativa_rota",
	"otimizada_em" timestamp with time zone,
	"trajeto" geography(LineString,4326),
	"iniciada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "rotas_partida_chk" CHECK (("rotas"."partida" = 'ponto') = ("rotas"."ponto_partida_id" IS NOT NULL)),
	CONSTRAINT "rotas_minutos_por_visita_chk" CHECK ("rotas"."minutos_por_visita" BETWEEN 0 AND 480)
);
--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "rota_minutos_por_visita" smallint DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "rota_ultimo_codigo" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rota_paradas" ADD CONSTRAINT "rota_paradas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_paradas" ADD CONSTRAINT "rota_paradas_rota_id_rotas_id_fk" FOREIGN KEY ("rota_id") REFERENCES "public"."rotas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_paradas" ADD CONSTRAINT "rota_paradas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_paradas" ADD CONSTRAINT "rota_paradas_atividade_id_atividades_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_paradas" ADD CONSTRAINT "rota_paradas_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_paradas" ADD CONSTRAINT "rota_paradas_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_pontos_partida" ADD CONSTRAINT "rota_pontos_partida_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_pontos_partida" ADD CONSTRAINT "rota_pontos_partida_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_pontos_partida" ADD CONSTRAINT "rota_pontos_partida_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_responsavel_id_membros_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_ponto_partida_id_rota_pontos_partida_id_fk" FOREIGN KEY ("ponto_partida_id") REFERENCES "public"."rota_pontos_partida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rota_paradas_empresa_uq" ON "rota_paradas" USING btree ("rota_id","empresa_id") WHERE "rota_paradas"."excluido_em" IS NULL;--> statement-breakpoint
CREATE INDEX "rota_paradas_rota_idx" ON "rota_paradas" USING btree ("rota_id","ordem");--> statement-breakpoint
CREATE INDEX "rota_paradas_empresa_idx" ON "rota_paradas" USING btree ("tenant_id","empresa_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "rota_paradas_atividade_uq" ON "rota_paradas" USING btree ("atividade_id") WHERE "rota_paradas"."atividade_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rota_pontos_partida_nome_uq" ON "rota_pontos_partida" USING btree ("tenant_id",lower("nome")) WHERE "rota_pontos_partida"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rota_pontos_partida_padrao_uq" ON "rota_pontos_partida" USING btree ("tenant_id") WHERE "rota_pontos_partida"."padrao" AND "rota_pontos_partida"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rotas_codigo_uq" ON "rotas" USING btree ("tenant_id","codigo");--> statement-breakpoint
CREATE INDEX "rotas_responsavel_data_idx" ON "rotas" USING btree ("tenant_id","responsavel_id","data");--> statement-breakpoint
CREATE INDEX "rotas_data_idx" ON "rotas" USING btree ("tenant_id","data");--> statement-breakpoint
-- RLS forçado e políticas padrão (aplicar_rls_tenant também concede o DML ao app). As FKs (responsável,
-- ponto de partida, empresas e atividade da parada) são conferidas na API, na empresa ativa.
SELECT aplicar_rls_tenant('rota_pontos_partida');--> statement-breakpoint
SELECT aplicar_rls_tenant('rotas');--> statement-breakpoint
SELECT aplicar_rls_tenant('rota_paradas');
