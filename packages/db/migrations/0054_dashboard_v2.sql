CREATE TABLE "municipio_contornos" (
	"municipio_codigo" integer PRIMARY KEY NOT NULL,
	"uf" char(2) NOT NULL,
	"contorno" geometry(MultiPolygon, 4326) NOT NULL,
	"fonte" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "municipio_contornos" ADD CONSTRAINT "municipio_contornos_municipio_codigo_municipios_codigo_ibge_fk" FOREIGN KEY ("municipio_codigo") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "municipio_contornos" ADD CONSTRAINT "municipio_contornos_uf_estados_uf_fk" FOREIGN KEY ("uf") REFERENCES "public"."estados"("uf") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "municipio_contornos_uf_idx" ON "municipio_contornos" USING btree ("uf");--> statement-breakpoint
CREATE INDEX "empresa_tags_historico_tag_empresa_idx" ON "empresa_tags_historico" USING btree ("tenant_id","tag_id","empresa_id","em");--> statement-breakpoint
CREATE INDEX "atividades_realizadas_idx" ON "atividades" USING btree ("tenant_id","realizada_em") WHERE "atividades"."situacao" = 'realizada';--> statement-breakpoint

-- Dashboard v2 (docs/plano_dashboard_v2.md). Só expansão: tabela de referência nova, dois índices e uma
-- carga de dados que só ACRESCENTA linhas.
-- municipio_contornos é referência global, como municipios: sem tenant_id e sem RLS; o app só lê.
GRANT SELECT ON "municipio_contornos" TO leadtogo_app;--> statement-breakpoint

-- Histórico de Status para os associados que não o têm (ex.: carga feita antes do histórico): grava a linha
-- 'adicionada' com a data em que a tag foi aplicada, marcada como automática. Sem isso, a contagem de
-- associados em uma data passada e o churn ignorariam essas empresas. Idempotente (só onde falta).
-- As tabelas têm RLS forçado também para o owner: a carga passa empresa (tenant) por empresa. Para listar as
-- empresas, uma política de leitura de `tenants` só para o owner existe SÓ durante o bloco (criada e apagada
-- na mesma transação; o app nunca a vê).
DO $$
DECLARE
  t record;
BEGIN
  CREATE POLICY carga_0054_le_tenants ON tenants FOR SELECT TO leadtogo_owner USING (true);
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', t.id::text, true);
    INSERT INTO empresa_tags_historico (id, tenant_id, empresa_id, tag_id, acao, em, por, automatica)
    -- uuid v7 com o instante de aplicada_em (gen_random_uuid() é v4: os bits 52 e 53 trocam a versão para 7)
    SELECT encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
             PLACING substring(int8send(floor(extract(epoch FROM et.aplicada_em) * 1000)::bigint) FROM 3)
             FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::uuid,
           et.tenant_id, et.empresa_id, et.tag_id, 'adicionada', et.aplicada_em, NULL, true
    FROM empresa_tags et
    JOIN tags tg ON tg.id = et.tag_id AND tg.chave_sistema = 'cliente'
    WHERE et.tenant_id = t.id
      AND NOT EXISTS (
        SELECT 1 FROM empresa_tags_historico h
        WHERE h.empresa_id = et.empresa_id AND h.tag_id = et.tag_id AND h.acao = 'adicionada'
          AND h.em <= et.aplicada_em
      );
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
  DROP POLICY carga_0054_le_tenants ON tenants;
END $$;
