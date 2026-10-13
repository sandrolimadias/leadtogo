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

### Módulo 1 — Configurações base ✅ *concluído e testado em produção pelo Ale (13/10/2026)*
Grupos de tags e tags (**Status** e **Visitação**), tipos de atividade, verticais, funil e etapas, origens, motivos e soluções. Os **valores padrão são criados por tenant** (empresas novas e as que já existem) e há **telas simples de edição** em Configurações.

**O que foi entregue** (9 tabelas, API e telas; detalhes em `modelagem_banco.md`, seções 3.2 e 5):
- **Padrões por empresa**, criados uma única vez (marca `padroes_criados_em`; o que o administrador exclui não volta): grupos **Status** (Lead, Prospect, Cliente, Inativo) e **Visitação** (Visitada, Contactada), tipos de atividade (Ligação, WhatsApp, E-mail, Visita, Reunião, Tarefa), funil **Vendas** com 4 fases (alerta de parada em 14 dias), 5 origens e 12 motivos. Verticais e soluções começam vazias. As empresas que já existiam receberam os padrões no deploy.
- **API** em `/v1/configuracoes/...` (tag-grupos, tags, tipos-atividade, verticais, solucoes, origens, motivos, funis): ler é de qualquer membro, escrever é do administrador; auditoria, exclusão lógica, nome único e reordenação.
- **Telas** em Configurações: Tags, Tipos de atividade, Funis e fases, Origens e motivos, Verticais e soluções (reordenar por botões, sem arrastar).
- **O que o sistema protege:** grupos Status e Visitação (só renomear); tags `lead`, `cliente`, `visitada` e `contactada` (renomear e recolorir, sem inativar nem excluir); origem **Importação** e tipo **Tarefa** (idem; a Tarefa fica sempre com empresa opcional e sem contar como visita ou contato); o **funil padrão** (sempre exatamente um, garantido também por índice único no banco) e a **última fase** de um funil.
- **Faixas de funcionários e de faturamento** ficaram fora do MVP (ver seção 3).

**Regra de exclusão de todos os cadastros** (decidida em 13/10/2026; registrada em `funcionalidades.md`, seção 11): **só se exclui o que nunca foi usado; o que já foi usado só se inativa**, para preservar o histórico. Vale para tags, grupos de tags, tipos de atividade, origens, motivos, soluções, verticais, funis e fases. A API do Módulo 1 ainda **não confere o uso**, porque ainda não há onde usar; cada verificação entra, **com teste**, junto da tabela que passa a usar o cadastro:

| Módulo | Passa a usar | Verificação pendente |
|---|---|---|
| 2 (Empresas) | tags e grupos de tags (`empresa_tags` e o histórico de Status), verticais | Excluir só se nunca usado, **nem no histórico de Status**; usado, só inativar |
| 5 (Atividades) | tipos de atividade | Idem |
| 6 (Oportunidades) | funis, fases, motivos, origens, soluções | Idem. **Fases passam a poder ser inativadas** (a coluna `ativo` já existe; a API e a tela do Módulo 1 não oferecem, porque a fase só era excluível). A regra "fase com oportunidades **ativas** exige mover antes" continua valendo para tirar a fase de uso |


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
*Decidido pelo Ale em 12/10/2026; **substitui** a descrição anterior. Vem depois dos Módulos 1 a 3. Detalhes de regra em `funcionalidades.md` (seção 3, "Importação por planilha").*

- **Tela igual ao mockup** do Claude Design (`prototipo/Importar.dc.html`), com os passos **Enviar arquivo · Mapear colunas · Regras** (novo) **· Prévia · Carteira · Importar · Relatório**, alternância **Empresas / Contatos**, Excel e CSV e o botão **"Baixar modelo"**.
- **Limite: até 10.000 linhas e 10 MB** por arquivo (o mockup diz 5.000; vale este documento).
- **Mapear colunas: fonte dos dados**, uma escolha por importação:
  - **Usar os dados da planilha**;
  - **Buscar tudo na Receita** (basta a coluna CNPJ);
  - **Completar com a Receita só os campos vazios**.
- **Consulta à Minha Receita:** um CNPJ por vez, **no worker**, com intervalo **configurável (padrão 3 s)**, *retry* em 429 e 5xx e cache em `receita_consultas`. **Progresso visível** na tela.
- **Regras de importação, em perfis nomeados por empresa (tenant).** Nada fixo no código: o produto será vendido. Um perfil define:
  - **situação ativa** (liga/desliga);
  - **matriz, filial ou ambas**;
  - **excluir MEI** (liga/desliga);
  - **CNAE principal dentro de uma lista** (com a opção de aceitar também nos CNAEs secundários);
  - **ação para quem não passa:** *pular e listar no relatório* (padrão) ou *importar com a tag "Fora do perfil"*.
- Na importação se escolhe **um perfil ou "Sem regras"**. As regras são aplicadas **depois da consulta à Receita**. O **Relatório** oferece **"importar mesmo assim"** para os fora do perfil.
- A **lista de CNAEs do Ale** (`cnaes_interesse.md`: **126 códigos**, todos existentes na tabela `cnaes`) **vira o primeiro perfil dele**, não um padrão do sistema.
- **Lista de CNAEs do perfil:** aceita códigos **colados** com **6 ou 7 dígitos** (completa o zero à esquerda) e **com ou sem pontuação** (`0710-3/01`, `0710301`, `710301`), e **mostra os inválidos antes de salvar**.
- **Lote nomeado, filtrável e desfazível.** **Status** e as demais escolhas ficam no passo **Carteira** (*Cliente* para a carteira, *Lead* para leads; origem **"Importação"**). Os alertas de "sem contato/visita" valem, por padrão, **só para Cliente e Prospect**.
- **Deduplicação por CNPJ dentro do tenant.**
- Os **perfis serão reaproveitados na Prospecção**.

### Módulo 5 — Atividades
Formulário **Registrar atividade** (protótipo), situação, resultado, importante/urgente, **efeito na carteira** (tags Visitada/Contactada, última visita e último contato), **"Registrar e agendar próxima"**, atrasadas e linha do tempo na ficha.

### Módulo 6 — Oportunidades
**Kanban por funil**, arrastar entre fases, **diálogo de fechamento** (Conquistado/Perdido/Cancelado/Suspenso, motivo, *retomar em*, empresa vira Cliente), **valores digitados** (único, mensal, total), probabilidade sugerida pela etapa, histórico de fases e lista simples.
- **Regra de fase e funil (12/10 e 13/10/2026):** fase com oportunidades **ativas** só sai de uso depois de **mover** essas oportunidades. Com a regra geral de 13/10/2026 (só se exclui o que nunca foi usado), uma fase que **já teve** oportunidades, mesmo só fechadas, **só se inativa**: a decisão de 12/10 de poder excluí-la quando só há fechadas fica **substituída**, e o histórico de fases e a "fase em que parou" seguem intactos. O mesmo vale para o **funil**. A API de funis (Módulo 1) ainda não confere isso, porque ainda não há oportunidades: a verificação entra junto com a tabela `oportunidades`, com teste.

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
| **Prospecção** | **Fase própria logo após o MVP.** Exige a base completa de CNPJs; a API pública da Minha Receita não busca por CNAE + município. **Direção (12/10/2026):** instância **própria** da Minha Receita (código aberto), com a base completa da Receita, o que permite buscar por município (IBGE), CNAE principal, situação, matriz e porte/MEI direto no banco e tira a dependência da API pública. Também é o que permite escalar a importação com vários clientes. Reaproveita os perfis de regras do Módulo 4 |
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
