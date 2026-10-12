-- CNPJ deixa de ser único no banco inteiro: a unicidade global revelava a quem cadastra que outra conta já usa
-- o CNPJ. Só afrouxa uma restrição (nenhum dado é alterado ou apagado); o índice acelera o aviso de CNPJ
-- repetido DENTRO da mesma conta.
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_cnpj_key";--> statement-breakpoint
CREATE INDEX "tenants_conta_cnpj_idx" ON "tenants" USING btree ("conta_id","cnpj");