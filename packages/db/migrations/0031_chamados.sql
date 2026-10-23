CREATE TYPE "public"."canal_da_notificacao" AS ENUM('sino', 'email');--> statement-breakpoint
CREATE TYPE "public"."destinatario_da_notificacao" AS ENUM('membro', 'contato');--> statement-breakpoint
CREATE TYPE "public"."ator_do_evento" AS ENUM('membro', 'contato', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."autor_do_chamado" AS ENUM('membro', 'contato');--> statement-breakpoint
CREATE TYPE "public"."estado_anexo" AS ENUM('pendente_varredura', 'limpo', 'infectado');--> statement-breakpoint
CREATE TYPE "public"."origem_chamado" AS ENUM('interna', 'portal');--> statement-breakpoint
CREATE TYPE "public"."prioridade_chamado" AS ENUM('baixa', 'normal', 'alta', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."status_chamado" AS ENUM('aguardando_triagem', 'pendente', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'fechado');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_chamado" AS ENUM('aberto', 'triado', 'atribuido', 'assumido', 'status_alterado', 'prioridade_alterada', 'area_alterada', 'primeira_resposta', 'mensagem', 'nota_interna', 'anexo', 'resolvido', 'reaberto', 'fechado');--> statement-breakpoint
CREATE TABLE "area_membros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"membro_id" uuid,
	"perfil_id" uuid,
	"gestor" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "area_membros_alvo_chk" CHECK (num_nonnulls("area_membros"."membro_id", "area_membros"."perfil_id") = 1),
	CONSTRAINT "area_membros_gestor_chk" CHECK (NOT "area_membros"."gestor" OR "area_membros"."membro_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "areas_atendimento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"visivel_no_portal" boolean DEFAULT false NOT NULL,
	"meta_resposta_min" integer,
	"meta_resolucao_min" integer,
	"pula_triagem" boolean DEFAULT false NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"chave_sistema" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "areas_atendimento_metas_chk" CHECK (("areas_atendimento"."meta_resposta_min" IS NULL OR "areas_atendimento"."meta_resposta_min" > 0) AND ("areas_atendimento"."meta_resolucao_min" IS NULL OR "areas_atendimento"."meta_resolucao_min" > 0))
);
--> statement-breakpoint
CREATE TABLE "calendario_expediente" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"inicio" time NOT NULL,
	"fim" time NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	CONSTRAINT "calendario_expediente_dia_chk" CHECK ("calendario_expediente"."dia_semana" BETWEEN 0 AND 6),
	CONSTRAINT "calendario_expediente_faixa_chk" CHECK ("calendario_expediente"."fim" > "calendario_expediente"."inicio")
);
--> statement-breakpoint
CREATE TABLE "chamado_anexos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"mensagem_id" uuid,
	"chave_arquivo" text NOT NULL,
	"nome" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho" bigint NOT NULL,
	"estado" "estado_anexo" DEFAULT 'pendente_varredura' NOT NULL,
	"enviado_em" timestamp with time zone,
	"varrido_em" timestamp with time zone,
	"assinatura" text,
	"tentativas_varredura" smallint DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"enviado_por_membro_id" uuid,
	"enviado_por_contato_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "chamado_anexos_tamanho_chk" CHECK ("chamado_anexos"."tamanho" BETWEEN 1 AND 26214400),
	CONSTRAINT "chamado_anexos_infectado_chk" CHECK ("chamado_anexos"."estado" <> 'infectado' OR "chamado_anexos"."assinatura" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "chamado_eventos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"tipo" "tipo_evento_chamado" NOT NULL,
	"ator_tipo" "ator_do_evento" DEFAULT 'membro' NOT NULL,
	"ator_membro_id" uuid,
	"ator_contato_id" uuid,
	"status_de" "status_chamado",
	"status_para" "status_chamado",
	"area_de_id" uuid,
	"area_para_id" uuid,
	"responsavel_de_id" uuid,
	"responsavel_para_id" uuid,
	"prioridade_de" "prioridade_chamado",
	"prioridade_para" "prioridade_chamado",
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chamado_eventos_ator_chk" CHECK (("chamado_eventos"."ator_tipo" = 'membro' AND "chamado_eventos"."ator_membro_id" IS NOT NULL AND "chamado_eventos"."ator_contato_id" IS NULL)
        OR ("chamado_eventos"."ator_tipo" = 'contato' AND "chamado_eventos"."ator_contato_id" IS NOT NULL AND "chamado_eventos"."ator_membro_id" IS NULL)
        OR ("chamado_eventos"."ator_tipo" = 'sistema' AND "chamado_eventos"."ator_membro_id" IS NULL AND "chamado_eventos"."ator_contato_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "chamado_mensagens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"autor_tipo" "autor_do_chamado" NOT NULL,
	"autor_membro_id" uuid,
	"autor_contato_id" uuid,
	"corpo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "chamado_mensagens_autor_chk" CHECK (("chamado_mensagens"."autor_tipo" = 'membro' AND "chamado_mensagens"."autor_membro_id" IS NOT NULL AND "chamado_mensagens"."autor_contato_id" IS NULL)
        OR ("chamado_mensagens"."autor_tipo" = 'contato' AND "chamado_mensagens"."autor_contato_id" IS NOT NULL AND "chamado_mensagens"."autor_membro_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "chamado_notas_internas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"autor_membro_id" uuid NOT NULL,
	"corpo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chamados" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"assunto" text NOT NULL,
	"descricao" text,
	"area_id" uuid,
	"status" "status_chamado" DEFAULT 'pendente' NOT NULL,
	"prioridade" "prioridade_chamado" DEFAULT 'normal' NOT NULL,
	"responsavel_id" uuid,
	"origem" "origem_chamado" DEFAULT 'interna' NOT NULL,
	"solicitante_membro_id" uuid,
	"contato_id" uuid,
	"empresa_cliente_id" uuid,
	"primeira_resposta_em" timestamp with time zone,
	"resolvido_em" timestamp with time zone,
	"fechado_em" timestamp with time zone,
	"reaberturas" smallint DEFAULT 0 NOT NULL,
	"status_alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "chamados_origem_chk" CHECK (("chamados"."origem" = 'interna' AND "chamados"."solicitante_membro_id" IS NOT NULL AND "chamados"."contato_id" IS NULL)
        OR ("chamados"."origem" = 'portal' AND "chamados"."contato_id" IS NOT NULL AND "chamados"."solicitante_membro_id" IS NULL)),
	CONSTRAINT "chamados_area_chk" CHECK ("chamados"."area_id" IS NOT NULL OR "chamados"."status" = 'aguardando_triagem'),
	CONSTRAINT "chamados_fechamento_chk" CHECK (("chamados"."status" <> 'fechado' OR "chamados"."fechado_em" IS NOT NULL)
        AND ("chamados"."status" NOT IN ('resolvido', 'fechado') OR "chamados"."resolvido_em" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "config_triagem" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"ativa" boolean DEFAULT false NOT NULL,
	"perfil_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "feriados" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"data" date NOT NULL,
	"nome" text NOT NULL,
	"recorrente" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "triagem_membros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "notificacoes" ALTER COLUMN "membro_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "chamado_ultimo_numero" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_configuracoes" ADD COLUMN "chamados_padroes_criados_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "destinatario_tipo" "destinatario_da_notificacao" DEFAULT 'membro' NOT NULL;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "contato_id" uuid;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "canal" "canal_da_notificacao" DEFAULT 'sino' NOT NULL;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "chamado_id" uuid;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "enviada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_area_id_areas_atendimento_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas_atendimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_membro_id_membros_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_perfil_id_perfis_acesso_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_acesso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas_atendimento" ADD CONSTRAINT "areas_atendimento_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas_atendimento" ADD CONSTRAINT "areas_atendimento_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas_atendimento" ADD CONSTRAINT "areas_atendimento_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendario_expediente" ADD CONSTRAINT "calendario_expediente_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendario_expediente" ADD CONSTRAINT "calendario_expediente_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_anexos" ADD CONSTRAINT "chamado_anexos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_anexos" ADD CONSTRAINT "chamado_anexos_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_anexos" ADD CONSTRAINT "chamado_anexos_mensagem_id_chamado_mensagens_id_fk" FOREIGN KEY ("mensagem_id") REFERENCES "public"."chamado_mensagens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_anexos" ADD CONSTRAINT "chamado_anexos_enviado_por_membro_id_membros_id_fk" FOREIGN KEY ("enviado_por_membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_anexos" ADD CONSTRAINT "chamado_anexos_enviado_por_contato_id_contatos_id_fk" FOREIGN KEY ("enviado_por_contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_anexos" ADD CONSTRAINT "chamado_anexos_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_anexos" ADD CONSTRAINT "chamado_anexos_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_ator_membro_id_membros_id_fk" FOREIGN KEY ("ator_membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_ator_contato_id_contatos_id_fk" FOREIGN KEY ("ator_contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_area_de_id_areas_atendimento_id_fk" FOREIGN KEY ("area_de_id") REFERENCES "public"."areas_atendimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_area_para_id_areas_atendimento_id_fk" FOREIGN KEY ("area_para_id") REFERENCES "public"."areas_atendimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_responsavel_de_id_membros_id_fk" FOREIGN KEY ("responsavel_de_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_responsavel_para_id_membros_id_fk" FOREIGN KEY ("responsavel_para_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_autor_membro_id_membros_id_fk" FOREIGN KEY ("autor_membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_autor_contato_id_contatos_id_fk" FOREIGN KEY ("autor_contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagens" ADD CONSTRAINT "chamado_mensagens_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_notas_internas" ADD CONSTRAINT "chamado_notas_internas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_notas_internas" ADD CONSTRAINT "chamado_notas_internas_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_notas_internas" ADD CONSTRAINT "chamado_notas_internas_autor_membro_id_membros_id_fk" FOREIGN KEY ("autor_membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_notas_internas" ADD CONSTRAINT "chamado_notas_internas_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_notas_internas" ADD CONSTRAINT "chamado_notas_internas_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_area_id_areas_atendimento_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas_atendimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_responsavel_id_membros_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_solicitante_membro_id_membros_id_fk" FOREIGN KEY ("solicitante_membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_empresa_cliente_id_empresas_id_fk" FOREIGN KEY ("empresa_cliente_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_triagem" ADD CONSTRAINT "config_triagem_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_triagem" ADD CONSTRAINT "config_triagem_perfil_id_perfis_acesso_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_acesso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_triagem" ADD CONSTRAINT "config_triagem_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triagem_membros" ADD CONSTRAINT "triagem_membros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triagem_membros" ADD CONSTRAINT "triagem_membros_membro_id_membros_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triagem_membros" ADD CONSTRAINT "triagem_membros_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "area_membros_membro_uq" ON "area_membros" USING btree ("area_id","membro_id") WHERE "area_membros"."membro_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "area_membros_perfil_uq" ON "area_membros" USING btree ("area_id","perfil_id") WHERE "area_membros"."perfil_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "area_membros_membro_idx" ON "area_membros" USING btree ("tenant_id","membro_id");--> statement-breakpoint
CREATE UNIQUE INDEX "areas_atendimento_nome_uq" ON "areas_atendimento" USING btree ("tenant_id",lower("nome")) WHERE "areas_atendimento"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "areas_atendimento_chave_uq" ON "areas_atendimento" USING btree ("tenant_id","chave_sistema") WHERE "areas_atendimento"."chave_sistema" IS NOT NULL AND "areas_atendimento"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "calendario_expediente_uq" ON "calendario_expediente" USING btree ("tenant_id","dia_semana","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "chamado_anexos_chave_uq" ON "chamado_anexos" USING btree ("chave_arquivo");--> statement-breakpoint
CREATE INDEX "chamado_anexos_chamado_idx" ON "chamado_anexos" USING btree ("chamado_id");--> statement-breakpoint
CREATE INDEX "chamado_anexos_mensagem_idx" ON "chamado_anexos" USING btree ("mensagem_id");--> statement-breakpoint
CREATE INDEX "chamado_anexos_pendentes_idx" ON "chamado_anexos" USING btree ("criado_em") WHERE "chamado_anexos"."estado" = 'pendente_varredura' AND "chamado_anexos"."enviado_em" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "chamado_eventos_chamado_idx" ON "chamado_eventos" USING btree ("chamado_id","em");--> statement-breakpoint
CREATE INDEX "chamado_eventos_tipo_idx" ON "chamado_eventos" USING btree ("tenant_id","tipo","em");--> statement-breakpoint
CREATE INDEX "chamado_mensagens_chamado_idx" ON "chamado_mensagens" USING btree ("chamado_id","criado_em");--> statement-breakpoint
CREATE INDEX "chamado_notas_internas_chamado_idx" ON "chamado_notas_internas" USING btree ("chamado_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "chamados_numero_uq" ON "chamados" USING btree ("tenant_id","numero");--> statement-breakpoint
CREATE INDEX "chamados_status_idx" ON "chamados" USING btree ("tenant_id","status","criado_em");--> statement-breakpoint
CREATE INDEX "chamados_area_idx" ON "chamados" USING btree ("tenant_id","area_id","status");--> statement-breakpoint
CREATE INDEX "chamados_responsavel_idx" ON "chamados" USING btree ("tenant_id","responsavel_id","status");--> statement-breakpoint
CREATE INDEX "chamados_solicitante_idx" ON "chamados" USING btree ("tenant_id","solicitante_membro_id");--> statement-breakpoint
CREATE INDEX "chamados_contato_idx" ON "chamados" USING btree ("tenant_id","contato_id");--> statement-breakpoint
CREATE INDEX "chamados_empresa_idx" ON "chamados" USING btree ("tenant_id","empresa_cliente_id");--> statement-breakpoint
CREATE INDEX "config_triagem_perfil_idx" ON "config_triagem" USING btree ("tenant_id","perfil_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feriados_data_uq" ON "feriados" USING btree ("tenant_id","data") WHERE "feriados"."excluido_em" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "triagem_membros_uq" ON "triagem_membros" USING btree ("tenant_id","membro_id");--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notificacoes_contato_idx" ON "notificacoes" USING btree ("tenant_id","contato_id","criado_em") WHERE "notificacoes"."contato_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notificacoes_chamado_idx" ON "notificacoes" USING btree ("chamado_id") WHERE "notificacoes"."chamado_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_destinatario_chk" CHECK (("notificacoes"."destinatario_tipo" = 'membro' AND "notificacoes"."membro_id" IS NOT NULL AND "notificacoes"."contato_id" IS NULL)
        OR ("notificacoes"."destinatario_tipo" = 'contato' AND "notificacoes"."contato_id" IS NOT NULL AND "notificacoes"."membro_id" IS NULL));
--> statement-breakpoint
-- RLS forçado e políticas padrão (aplicar_rls_tenant também concede o DML ao app). As FKs entre as tabelas
-- do chamado (área, responsável, contato, mensagem) não passam pelo RLS: a API só grava ids da própria
-- empresa, na empresa ativa.
SELECT aplicar_rls_tenant('areas_atendimento');--> statement-breakpoint
SELECT aplicar_rls_tenant('area_membros');--> statement-breakpoint
SELECT aplicar_rls_tenant('config_triagem');--> statement-breakpoint
SELECT aplicar_rls_tenant('triagem_membros');--> statement-breakpoint
SELECT aplicar_rls_tenant('chamados');--> statement-breakpoint
SELECT aplicar_rls_tenant('chamado_mensagens');--> statement-breakpoint
SELECT aplicar_rls_tenant('chamado_notas_internas');--> statement-breakpoint
SELECT aplicar_rls_tenant('chamado_eventos');--> statement-breakpoint
SELECT aplicar_rls_tenant('chamado_anexos');--> statement-breakpoint
SELECT aplicar_rls_tenant('calendario_expediente');--> statement-breakpoint
SELECT aplicar_rls_tenant('feriados');--> statement-breakpoint
-- A linha do tempo só recebe acréscimos: é a base única das métricas e não pode ser reescrita pelo app.
REVOKE UPDATE, DELETE ON chamado_eventos FROM leadtogo_app;--> statement-breakpoint
-- Backfill das áreas, do expediente, dos feriados fixos e da triagem (desligada) nas empresas que já
-- existem (feito no start da API, com o leadtogo_owner): o RLS forçado impede o dono de listar os
-- tenants. Mesmo padrão das migrações 0016, 0026, 0027 e 0028: função SECURITY DEFINER mínima e política
-- só para o leadtogo_owner, travada numa variável que só a função define e limpa. Devolve APENAS os ids
-- dos tenants ainda sem a marca.
CREATE POLICY configuracoes_chamados_pendentes ON tenant_configuracoes FOR SELECT TO leadtogo_owner
  USING (current_setting('app.chamados_pendentes', true) = '1' AND chamados_padroes_criados_em IS NULL);
--> statement-breakpoint
CREATE FUNCTION app_tenants_sem_padroes_chamados()
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.chamados_pendentes', '1', true);
  RETURN QUERY
    SELECT c.tenant_id FROM public.tenant_configuracoes c WHERE c.chamados_padroes_criados_em IS NULL ORDER BY c.criado_em;
  PERFORM pg_catalog.set_config('app.chamados_pendentes', '', true);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_sem_padroes_chamados() FROM PUBLIC;
