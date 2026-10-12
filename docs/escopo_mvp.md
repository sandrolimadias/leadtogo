# Leadtogo — Escopo do MVP

> Status: **Decidido pelo Ale** · Data: 12/10/2026
> Complementa `funcionalidades.md` (regras de negócio, que **não mudam**), `modelagem_banco.md` e `plano_implantacao.md` (seção 6, pendências herdadas).
> Este documento só diz **o que entra no MVP, em que ordem e o que fica de fora**. Onde um módulo cita uma regra, vale o texto de `funcionalidades.md`.

---

## 1. Contexto

No início, **só o Ale usa o sistema: um usuário, administrador**. Os papéis (admin, gestor, vendedor) e as regras de carteira **continuam no banco e na API**, mas o MVP **não tem telas de equipe** (além do que já existe em Configurações → Usuários e Segurança, entregue na E16a).

**Critério de pronto do MVP:** o Ale importou a carteira e os leads e usou o sistema no dia a dia por **duas semanas**.

---

## 2. Módulos, nesta ordem

Cada módulo vai para produção **sozinho** (commits pequenos na `main`, com testes, conforme o `CLAUDE.md`). O módulo seguinte só começa com o anterior no ar.

### Módulo 1 — Configurações base
Grupos de tags e tags (**Status** e **Visitação**), tipos de atividade, verticais, funil e etapas, origens, motivos e soluções. Os **valores padrão são criados por tenant** (empresas novas e as que já existem) e há **telas simples de edição** em Configurações.

### Módulo 2 — Empresas
- Cadastro por **CNPJ, CPF ou sem documento**.
- Consulta à **Minha Receita** (com alternativa em caso de falha), preenchendo endereço, CNAEs, sócios, porte e situação.
- **Matriz/filial** pela raiz do CNPJ.
- Telefones em **E.164**; vendedor (padrão: o usuário), vertical e tags.
- **Lista** com busca, filtros do protótipo e chips fixos: *Todas, Minha carteira, Sem visita há 90 dias, Nunca visitadas, Sem próxima atividade*.
- **Ficha** com abas *Resumo, Contatos, Atividades, Oportunidades e Histórico*.
- **Regra das tags (decidida em 12/10/2026):** tag em uso por alguma empresa, **atual ou no histórico de Status** (`empresa_tags_historico`), **não pode ser excluída, só inativada**, para preservar o histórico de conversão (Lead → Cliente). O mesmo vale para excluir um **grupo** de tags com tags em uso. A API de tags (Módulo 1) ainda não confere o uso, porque ainda não há tags aplicadas a empresas: a verificação entra junto com `empresa_tags` e `empresa_tags_historico`, no Módulo 2, com teste.

### Módulo 3 — Contatos
Vínculo N:N com empresas, cargo por vínculo, telefones, e-mails, papel na decisão, aniversário, consentimento LGPD e **"converter sócio em contato"**. Lista e ficha.

### Módulo 4 — Importação de planilha (Excel/CSV)
- Empresas e contatos; mapeamento de colunas, prévia, validação e relatório de erros.
- Deduplicação por **CNPJ dentro do tenant**.
- Escolha do **Status** (*Cliente* para a carteira, *Lead* para leads) e origem **"Importação"**.
- **Enriquecimento pela Receita em segundo plano** (fila no worker, respeitando o limite da API), com **progresso visível**.

### Módulo 5 — Atividades
Formulário **Registrar atividade** (protótipo), situação, resultado, importante/urgente, **efeito na carteira** (tags Visitada/Contactada, última visita e último contato), **"Registrar e agendar próxima"**, atrasadas e linha do tempo na ficha.

### Módulo 6 — Oportunidades
**Kanban por funil**, arrastar entre fases, **diálogo de fechamento** (Conquistado/Perdido/Cancelado/Suspenso, motivo, *retomar em*, empresa vira Cliente), **valores digitados** (único, mensal, total), probabilidade sugerida pela etapa, histórico de fases e lista simples.

### Módulo 7 — Dashboard
Minhas atividades (Hoje, Atrasadas, 7 dias, conclusão rápida), funil por fase, previsão do mês, conquistadas × perdidas, carteira por status e sem contato há 60 dias. **Só a visão "Minha".**

### Transversal (entra junto dos módulos em que fizer sentido)
- **Busca global** (empresas, contatos, oportunidades).
- **Auditoria nas fichas** (aba Histórico).
- Aviso **"Nova versão disponível"** no PWA.

### Trilha técnica — antes do primeiro cliente externo
(Origem: `plano_implantacao.md`, seção 6; não bloqueia o uso do Ale.)
- `acessos_log` (**6 meses**, partição mensal descartada pelo job de manutenção).
- Limpeza de sessões expiradas.
- Retenção da auditoria (prazo e descarte das partições antigas).
- **Ensaio completo da restauração** em produção (`runbook_backup.md`, seção 3).

---

## 3. Fora do MVP (e por quê)

| Item | Motivo |
|---|---|
| **Prospecção** | **Fase própria logo após o MVP.** Exige base completa de CNPJs ou API paga; a Minha Receita não oferece busca por CNAE + município |
| Kanban de Tarefas | Com um usuário só, "Minhas atividades" do Dashboard cobre o dia a dia |
| Catálogo de produtos/itens | O MVP usa valores digitados na oportunidade (único, mensal, total) |
| Campos personalizados | Não há necessidade comprovada; os campos fixos cobrem o uso inicial |
| Recorrência e lembretes | Dependem da central de notificações e de rotinas no worker |
| Central de notificações e push | Um usuário só; o Dashboard mostra o que está atrasado |
| Filtros salvos personalizados | Os chips fixos da lista de Empresas bastam |
| Visão Equipe e transferência de carteira | Só há um usuário |
| Painel consolidado | Só há uma empresa em uso |
| Copiar configurações entre empresas | Só há uma empresa em uso |
| Offline | Complexidade alta; o PWA exige conexão no MVP |
| Atualização campo a campo pela Receita e rotina mensal | A consulta inicial e o enriquecimento da importação cobrem o MVP |
| Faixas de funcionários e de faturamento (cadastros e campos na empresa) | Decidido em 12/10/2026: não entram no MVP; a empresa não tem esses campos até uma fase posterior (`faixas_*` ficam só na modelagem) |
| Detecção de duplicados por similaridade | O MVP deduplica só por CNPJ |
| Exportação | O Ale tem a planilha de origem; sai com a exportação de dados por tenant (LGPD) |
| Integrações (WhatsApp, e-mail, agendas, n8n) | Fases 4 a 7 de `funcionalidades.md` |
| Mapa e rotas | Fases 2 e 3 de `funcionalidades.md` |

> As tabelas e o desenho dos itens acima **continuam em `modelagem_banco.md`**. O MVP só não cria as tabelas de que não precisa; cada uma entra, por migração, quando o item for implementado.

---

## 4. Regras do MVP

- **Planilhas reais: nunca usar nem commitar dados reais.** O Ale passa só os **nomes das colunas**; os testes usam planilha **falsa**, gerada no teste.
- Segue valendo tudo do `CLAUDE.md`: RLS forçado e teste de isolamento em toda tabela de negócio, migrações "expandir e depois contrair" e `pnpm lint && pnpm typecheck && pnpm test` antes de cada commit.
- Vendedor padrão de toda empresa nova = o usuário logado; as regras de carteira por papel continuam aplicadas na API, mesmo sem tela de equipe.
