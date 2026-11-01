ALTER TABLE "tenant_configuracoes" ADD COLUMN "portal_formulario_satisfacao_id" uuid;--> statement-breakpoint

-- Portal, Fase 4F (docs/plano_portal_formularios_e_eventos.md, B-11). Só expansão: o formulário que vira a
-- pesquisa de satisfação dos chamados (nulo = só as estrelas de antes).
ALTER TABLE tenant_configuracoes ADD CONSTRAINT tenant_configuracoes_formulario_satisfacao_fk
  FOREIGN KEY (portal_formulario_satisfacao_id) REFERENCES formularios(id);
