ALTER TABLE "portal_preferencias" ADD COLUMN "tema" varchar(10) DEFAULT 'sistema' NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_preferencias" ADD CONSTRAINT "portal_preferencias_tema_chk" CHECK ("portal_preferencias"."tema" IN ('claro', 'escuro', 'sistema'));--> statement-breakpoint

-- Portal, Fase 4A (docs/plano_portal_formularios_e_eventos.md, F-5 e F-8). Só expansão.
-- (1) tema do portal guardado nas preferências da pessoa (acima);
-- (2) o cliente corrige o próprio CARGO: o vínculo dele com a empresa da sessão deixa de ser só leitura,
--     e um gatilho garante que, pela sessão do portal, só `cargo` (e o carimbo) mudam: o resto da linha volta
--     ao que era (principal, ativo, empresa, contato ficam com a equipe).
DROP POLICY portal_so_leitura_upd ON empresa_contatos;--> statement-breakpoint
CREATE POLICY portal_escopo_upd ON empresa_contatos AS RESTRICTIVE FOR UPDATE
  USING (NOT app_portal_ativo() OR (contato_id = app_portal_contato() AND empresa_id = app_portal_empresa()))
  WITH CHECK (NOT app_portal_ativo() OR (contato_id = app_portal_contato() AND empresa_id = app_portal_empresa()));--> statement-breakpoint

CREATE FUNCTION app_portal_so_cargo() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  novo_cargo text := NEW.cargo;
  novo_carimbo timestamptz := NEW.atualizado_em;
BEGIN
  IF app_portal_ativo() THEN
    NEW := OLD;
    NEW.cargo := novo_cargo;
    NEW.atualizado_em := novo_carimbo;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER empresa_contatos_portal_so_cargo BEFORE UPDATE ON empresa_contatos
  FOR EACH ROW EXECUTE FUNCTION app_portal_so_cargo();
--> statement-breakpoint

-- (3) "Minha empresa" mostra o cadastro completo (F-6): o portal passa a LER os telefones e os CNAEs da
--     própria empresa-cliente (nunca grava; as outras empresas continuam invisíveis).
DROP POLICY portal_negado ON empresa_telefones;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON empresa_telefones AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON empresa_telefones AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON empresa_telefones AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON empresa_telefones AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());--> statement-breakpoint
DROP POLICY portal_negado ON empresa_cnaes;--> statement-breakpoint
CREATE POLICY portal_escopo_sel ON empresa_cnaes AS RESTRICTIVE FOR SELECT
  USING (NOT app_portal_ativo() OR empresa_id = app_portal_empresa());--> statement-breakpoint
CREATE POLICY portal_so_leitura_ins ON empresa_cnaes AS RESTRICTIVE FOR INSERT WITH CHECK (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_upd ON empresa_cnaes AS RESTRICTIVE FOR UPDATE USING (NOT app_portal_ativo());--> statement-breakpoint
CREATE POLICY portal_so_leitura_del ON empresa_cnaes AS RESTRICTIVE FOR DELETE USING (NOT app_portal_ativo());
