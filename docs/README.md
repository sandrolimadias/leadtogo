# Documentação do Leadtogo

| Documento | Conteúdo |
|---|---|
| [configuracao_tecnologia.md](configuracao_tecnologia.md) | Stack, infraestrutura, segurança, integrações |
| [funcionalidades.md](funcionalidades.md) | O que o sistema faz: telas, regras de negócio, fases |
| [modelagem_banco.md](modelagem_banco.md) | Tabelas, colunas, índices, RLS e multiempresa |
| [design_system.md](design_system.md) | Resumo das decisões visuais |
| [design-system/](design-system/LEIA-ME.md) | Tokens, componentes de referência, catálogo, fontes e ícones |
| [seguranca_dependencias.md](seguranca_dependencias.md) | Vulnerabilidades de dependências conhecidas e não corrigidas, com a avaliação do risco e quando rever |
| [esteira_deploy.md](esteira_deploy.md) | Git, CI/CD, Coolify, migrações e rollback |
| [runbook_e13.md](runbook_e13.md) | Roteiro do primeiro deploy no Coolify (DNS, segredos, GHCR, banco, recursos, deploy automático, checklist e rollback) |
| [escopo_mvp.md](escopo_mvp.md) | Recorte do MVP: módulos em ordem, trilha técnica e o que fica de fora |
| [roteiro_teste_chamados.md](roteiro_teste_chamados.md) | Roteiro de teste da central de chamados (Fase 2), com a verificação no servidor, o ClamAV e o CORS |
| [roteiro_teste_portal_3d.md](roteiro_teste_portal_3d.md) | Roteiro de teste do Portal do Cliente, Fase 3D (agenda: publicar eventos, vagas, lista de espera, promoção, cancelamento e lembrete) |
| [roteiro_teste_portal_3c.md](roteiro_teste_portal_3c.md) | Roteiro de teste do Portal do Cliente, Fase 3C (documentos: envio com antivírus, alcance, download com registro e quem baixou) |
| [roteiro_teste_portal_3b.md](roteiro_teste_portal_3b.md) | Roteiro de teste do Portal do Cliente, Fase 3B (publicações: escrever, agendar, fixar, reagir, comentar, denunciar e moderar) |
| [roteiro_teste_portal_3a.md](roteiro_teste_portal_3a.md) | Roteiro de teste do Portal do Cliente, Fase 3A (acesso do cliente e chamados), com DNS, Coolify, `PORTAL_URL` e verificação no servidor |
| [roteiro_garage_anexos.md](roteiro_garage_anexos.md) | Garage dos anexos dos chamados: endereço público, CORS do bucket, CSP e como conferir |
| [plano_portal_cliente.md](plano_portal_cliente.md) | Plano aprovado do Portal do Cliente (Fase 3: acesso, chamados, publicações, documentos, agenda, avisos), com as telas em `prototipo-portal/` |
| [plano_api_aberta.md](plano_api_aberta.md) | Plano da API aberta (chaves de API, API pública `/v1/publica/*` e webhooks de saída), base das integrações com n8n e ERPs; aprovado e executado (fases I1 a I4) |
| [roteiro_teste_api_aberta.md](roteiro_teste_api_aberta.md) | Roteiro de teste da API aberta: chaves, API pública, webhooks e os workflows do n8n |
| [api/publica-v1.openapi.json](api/publica-v1.openapi.json) | Retrato do contrato da API pública v1 (gerado; só mudanças aditivas) |
| [plano_importacao_oportunidades.md](plano_importacao_oportunidades.md) | Plano da importação de oportunidades por planilha (quarto tipo do assistente de importação); aprovado em 28/10/2026 |
| [roteiro_teste_importacao_oportunidades.md](roteiro_teste_importacao_oportunidades.md) | Roteiro de teste da importação de oportunidades por planilha |
| [plano_busca_global.md](plano_busca_global.md) | Plano da busca global da barra do topo (empresas, contatos e oportunidades) e das buscas recentes; aprovado em 29/10/2026 |
| [roteiro_teste_busca_global.md](roteiro_teste_busca_global.md) | Roteiro de teste da busca global |
| [plano_prospeccao.md](plano_prospeccao.md) | Plano da Prospecção (busca por CNAE e município na base da Receita), guardado para a próxima fase |
| [plano_implantacao.md](plano_implantacao.md) | Plano da Fase 0: estrutura, infraestrutura e primeiro deploy |
| [prototipo/](prototipo/README.md) | Protótipo das telas (Claude Design) e especificação de interface |
| [cnaes_interesse.md](cnaes_interesse.md) | Lista de CNAEs do Ale (126 códigos, todos válidos): primeiro perfil de regras da importação |
| [revisao_prototipo.md](revisao_prototipo.md) | Revisão do protótipo contra os documentos |

Regra: quando o código mudar uma decisão, o documento correspondente é atualizado no mesmo commit.
