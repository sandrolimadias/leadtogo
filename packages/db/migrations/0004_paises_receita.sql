-- BREAKING-DB: paises passa do código ISO de 2 letras para o código numérico da Receita Federal
-- (Brasil = 105). A tabela é de referência e é recarregada por `pnpm db:seed`; as linhas ISO antigas
-- são descartadas aqui, porque os códigos não são conversíveis. Nenhuma FK aponta para paises.
TRUNCATE TABLE "paises";--> statement-breakpoint
ALTER TABLE "paises" ALTER COLUMN "codigo" SET DATA TYPE smallint USING "codigo"::smallint;--> statement-breakpoint
-- tenants.pais_codigo: 'BR' vira 105; qualquer outro valor antigo (não há) vira NULL
ALTER TABLE "tenants" ALTER COLUMN "pais_codigo" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "pais_codigo" SET DATA TYPE smallint USING (CASE WHEN "pais_codigo" = 'BR' THEN 105 ELSE NULL END);--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "pais_codigo" SET DEFAULT 105;
