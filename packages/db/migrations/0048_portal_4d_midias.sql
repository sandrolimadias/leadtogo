CREATE TYPE "public"."provedor_video" AS ENUM('youtube', 'vimeo');--> statement-breakpoint
CREATE TYPE "public"."tipo_midia_publicacao" AS ENUM('imagem', 'video');--> statement-breakpoint
CREATE TABLE "publicacao_midias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"tipo" "tipo_midia_publicacao" NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"legenda" varchar(200),
	"texto_alternativo" varchar(300),
	"chave_arquivo" text,
	"nome" text,
	"mime" text,
	"tamanho" bigint,
	"estado" "estado_anexo" DEFAULT 'pendente_varredura' NOT NULL,
	"enviado_em" timestamp with time zone,
	"varrido_em" timestamp with time zone,
	"assinatura" text,
	"tentativas_varredura" smallint DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"video_provedor" "provedor_video",
	"video_id" varchar(32),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_por" uuid,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "publicacao_midias_tipo_chk" CHECK (("publicacao_midias"."tipo" = 'imagem' AND "publicacao_midias"."chave_arquivo" IS NOT NULL AND "publicacao_midias"."texto_alternativo" IS NOT NULL
           AND "publicacao_midias"."tamanho" BETWEEN 1 AND 10485760 AND "publicacao_midias"."video_id" IS NULL)
        OR ("publicacao_midias"."tipo" = 'video' AND "publicacao_midias"."video_provedor" IS NOT NULL AND "publicacao_midias"."video_id" IS NOT NULL
           AND "publicacao_midias"."chave_arquivo" IS NULL)),
	CONSTRAINT "publicacao_midias_video_id_chk" CHECK ("publicacao_midias"."video_id" IS NULL OR "publicacao_midias"."video_id" ~ '^[A-Za-z0-9_-]{6,32}$')
);
--> statement-breakpoint
ALTER TABLE "publicacao_midias" ADD CONSTRAINT "publicacao_midias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_midias" ADD CONSTRAINT "publicacao_midias_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_midias" ADD CONSTRAINT "publicacao_midias_criado_por_membros_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacao_midias" ADD CONSTRAINT "publicacao_midias_atualizado_por_membros_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."membros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publicacao_midias_publicacao_idx" ON "publicacao_midias" USING btree ("publicacao_id","ordem");--> statement-breakpoint

-- Portal, Fase 4D (docs/plano_portal_formularios_e_eventos.md, B-3). Só expansão.
-- O cliente lê a mídia só da publicação que ele enxerga (a política de `publicacoes` decide) e, na imagem, só a
-- "limpa" (o antivírus liberou); nunca grava. A escrita da equipe vale só para o papel da API: o processador do
-- antivírus atualiza o estado pela conexão da aplicação, no contexto do tenant.
SELECT aplicar_rls_tenant('publicacao_midias');--> statement-breakpoint
DROP POLICY portal_negado ON publicacao_midias;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON publicacao_midias AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR (
    excluido_em IS NULL AND (tipo = 'video' OR (estado = 'limpo' AND enviado_em IS NOT NULL))
    AND EXISTS (SELECT 1 FROM publicacoes p WHERE p.id = publicacao_midias.publicacao_id)));--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON publicacao_midias AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON publicacao_midias AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON publicacao_midias AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());
