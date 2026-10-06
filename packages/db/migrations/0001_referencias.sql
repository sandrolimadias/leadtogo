CREATE TABLE "cnaes" (
	"codigo" integer PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL,
	"secao" char(1) NOT NULL,
	"divisao" varchar(2) NOT NULL,
	"grupo" varchar(3) NOT NULL,
	"classe" varchar(5) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estados" (
	"uf" char(2) PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"regiao" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipios" (
	"codigo_ibge" integer PRIMARY KEY NOT NULL,
	"codigo_siafi" integer,
	"nome" text NOT NULL,
	"uf" char(2) NOT NULL,
	"localizacao" geometry(Point,4326),
	CONSTRAINT "municipios_codigo_siafi_key" UNIQUE("codigo_siafi")
);
--> statement-breakpoint
CREATE TABLE "paises" (
	"codigo" char(2) PRIMARY KEY NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portes" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualificacoes_socio" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receita_consultas" (
	"cnpj" varchar(14) PRIMARY KEY NOT NULL,
	"dados" jsonb NOT NULL,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fonte" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_uf_estados_uf_fk" FOREIGN KEY ("uf") REFERENCES "public"."estados"("uf") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "municipios_uf_idx" ON "municipios" USING btree ("uf");--> statement-breakpoint
CREATE INDEX "municipios_localizacao_idx" ON "municipios" USING gist ("localizacao");
--> statement-breakpoint
-- unaccent() não é IMMUTABLE e por isso não serve em índice; este invólucro é.
CREATE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION f_unaccent(text) TO leadtogo_app;
--> statement-breakpoint
-- Busca por nome sem acento e sem caixa (autocomplete de cidade e de atividade)
CREATE INDEX "municipios_nome_trgm_idx" ON "municipios" USING gin (f_unaccent("nome") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "cnaes_descricao_trgm_idx" ON "cnaes" USING gin (f_unaccent("descricao") gin_trgm_ops);
--> statement-breakpoint
-- O app só lê as referências. Escrita: owner (seeds) e worker. receita_consultas é o cache
-- que cresce com o uso (sem DELETE para o app).
GRANT SELECT ON "cnaes", "municipios", "estados", "paises", "portes", "qualificacoes_socio" TO leadtogo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "receita_consultas" TO leadtogo_app;
