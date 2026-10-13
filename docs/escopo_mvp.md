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
| 2 (Empresas) | tags e grupos de tags (`empresa_tags` e o histórico de Status), verticais | **Feito (13/10/2026):** excluir só se nunca usado, **nem no histórico de Status** (409 `tag_em_uso`, `grupo_em_uso`, `vertical_em_uso`); usado, só inativar. Empresa excluída continua contando como uso |
| 5 (Atividades) | tipos de atividade | Idem |
| 6 (Oportunidades) | funis, fases, motivos, origens, soluções | Idem. **Fases passam a poder ser inativadas** (a coluna `ativo` já existe; a API e a tela do Módulo 1 não oferecem, porque a fase só era excluível). A regra "fase com oportunidades **ativas** exige mover antes" continua valendo para tirar a fase de uso |


### Módulo 2 — Empresas
*Plano aprovado pelo Ale em 13/10/2026, com execução autônoma do módulo inteiro. Estado: **em desenvolvimento**.*

**Cadastro e API**
- Cadastro por **CNPJ, CPF ou sem documento**. Rotas em `/v1/carteira/empresas` (não colidem com `/v1/empresas`, as empresas do grupo) e `/v1/receita`.
- **Receita:** `GET https://minhareceita.org/{cnpj}`; cache de 30 dias em `receita_consultas` ("consultar de novo" ignora o cache); timeout de 8 s; em timeout, rede, 429 ou 5xx tenta a **BrasilAPI**; 400/404 são definitivos; as duas falhando = `503 receita_indisponivel`. URLs e timeout por variável (`MINHA_RECEITA_URL`, `BRASILAPI_URL`, `RECEITA_TIMEOUT_MS`), com padrões. Limite de 20 consultas/min por IP. Sócios **sem CPF**. CNAE desconhecido entra pela função `app_registrar_cnae`. Se a BrasilAPI depender da própria Minha Receita, ela fica como segunda tentativa e a limitação é registrada em `configuracao_tecnologia.md` (a alternativa real será uma instância própria).
- **Matriz/filial:** `cnpj_raiz` gerada; ao salvar uma filial, liga à matriz do tenant e vice-versa, na mesma transação.
- **Telefone:** normalizador próprio do Brasil em `packages/shared` (sem biblioteca); guarda o digitado e o E.164. Vendedor padrão = usuário logado.
- **Duplicado:** CNPJ repetido no tenant = 409 com a empresa existente ("Abrir ficha"), sem revelar o nome se for de vendedor que o usuário não vê.
- **Carteira por papel:** vendedor vê a própria (ou todas, se `vendedor_ve_todas_empresas`); gestor e admin veem tudo.
- **Exclusão lógica**, só admin e gestor, **sem lixeira** (lixeira e restauração = pendência pós-MVP).

**Empresa não ativa na Receita** (baixada, inapta, suspensa, nula): **não pode ser cadastrada**.
- Configuração por tenant `bloquear_empresa_nao_ativa`, padrão **ligada**, em Configurações (Segurança ou Preferências).
- Ligada: a tela mostra a situação e o motivo e desabilita Salvar; a API também recusa (`409 empresa_nao_ativa`).
- **Receita indisponível:** permite salvar com o selo "situação não verificada"; um job no worker reconsulta depois e, se não estiver ativa, avisa o responsável (**sem excluir**).
- Empresa já cadastrada que deixa de ser ativa **continua no CRM**, com o aviso de situação.
- CPF e "sem documento" não são afetados. **O mesmo bloqueio valerá na importação (Módulo 4).**

**Detalhes da API da empresa** (`/v1/carteira/empresas`, commit 4; decididos na implementação, dentro do plano aprovado)
- O **documento (CNPJ/CPF) não muda** depois do cadastro; o **Status** muda pelas tags (commit 6), não pelo `PATCH`.
- Para CNPJ, a API consulta a Receita **por conta própria** (situação, sócios e descrição de CNAE novo): o cliente manda os campos editáveis, mas **sócios e situação nunca vêm do cliente**. CNAE que não está na tabela só entra se a Receita o trouxe naquela consulta; senão, 400 `cnae_desconhecido`.
- **Vendedor** cadastra só na própria carteira e edita só a própria (mesmo com "ver todas"); **gestor e admin** escolhem o vendedor, passam a carteira e excluem. Empresa que o usuário não vê responde **404**.
- **Duplicado:** 409 `empresa_ja_cadastrada` com `dados.existente` (`id` e `nome` só se o usuário vê a empresa; senão só `visivel: false`). Documento de empresa excluída pode ser cadastrado de novo.
- Receita fora do ar: salva com `situacaoNaoVerificada` e agenda o evento `empresa.verificar_situacao` (reconsulta de hora em hora, até 24 vezes). Cache vencido conta como "não verificada".
- Excluir uma **matriz** solta as filiais (`matriz_id` nulo); cadastrar a matriz depois liga as filiais soltas.
- Fora do MVP, por ora: editar o documento de uma empresa cadastrada (ex.: "sem documento" que ganhou CNPJ).

**Lista `/empresas`**
- **Chips com contagem:** Todas, Minha carteira, Sem visita há 90 dias, Nunca visitadas, Sem próxima atividade. Os três últimos (e suas contagens) consideram por padrão só Status **Cliente e Prospect**, com a opção "Incluir leads"; "Todas" mostra tudo.
- **Filtros:** busca sem acento (nome, CNPJ, cidade), Status, Visitação, Vendedor, Cidade, Última visita; "Limpar filtros"; filtros na URL.
- Filtro Vendedor e chip "Minha carteira" ficam **ocultos** quando o tenant tem um único membro ativo.
- **Colunas:** Empresa (nome + CNPJ), Tags (**todas**, sem "+N", quebrando linha), Cidade, Última visita, Último contato, Próxima atividade. **Sem a coluna Vendedor.** A coluna "Em aberto" fica oculta até o Módulo 6. Alertas: visita a partir de 90 dias, contato a partir de 60.
- **Celular:** cards com Ligar, WhatsApp e Rota. **Aplicar tag em massa**, respeitando grupos de seleção única.

**Tags da empresa** (`PUT /v1/carteira/empresas/{id}/tags`, commit 6)
- Substitui as tags dos grupos **manuais** (Status, Interesse...): seleção única aceita uma, grupo obrigatório (Status) exige uma, tag inativa não se aplica de novo. As tags de grupo **automático** (Visitação) são do sistema e não mudam por aqui.
- Cada tag que entra ou sai grava uma linha em `empresa_tags_historico` (base da conversão Lead → Cliente) e um registro de auditoria (`alterar_tags`). O Status inicial do cadastro também entra no histórico.

**Detalhes da API da lista** (`GET /v1/carteira/empresas`, `/contagens` e `/opcoes`, commit 5)
- "Cliente e Prospect" dos chips é pelas **chaves do sistema** das tags (`cliente`, `prospect`), que sobrevivem a renomear. "Incluir leads" traz os demais Status.
- Filtro `tags`: a empresa precisa ter **todas** as tags pedidas (ex.: um Status e uma Visitação). Última visita "sem visita há 60/90 dias" **inclui quem nunca foi visitado**.
- A busca por documento aceita pedaço, com ou sem máscara. A ordenação padrão é por nome sem acento; por última visita, quem nunca foi visitado vem primeiro.
- `/opcoes` entrega equipe, cidades das empresas visíveis, `unicoMembro` (esconde o filtro Vendedor e o chip "Minha carteira") e os dias de alerta de contato da empresa.

**Nova empresa `/empresas/nova`** (3 passos do protótipo)
- **Documento** (CNPJ, CPF ou sem documento) com consulta e os estados: aguardando, encontrada, já cadastrada, não ativa (bloqueada), falha, CNPJ inválido.
- **Conferir dados da Receita** (editáveis). Sem faixas de funcionários e faturamento (fora do MVP).
- **Carteira:** Vendedor (oculto com um membro só), Vertical, Status (padrão Lead), Website, Observações.

**Ficha `/empresas/:id`** (mockup da ficha completa; o resto entra nos Módulos 3, 5 e 6)
- **Cabeçalho:** nome, Matriz/Filial, situação na Receita, razão social, CNPJ, tags + "Editar tags"; botões Ligar e WhatsApp com o telefone da empresa; "Mais ações" com Editar e Excluir.
- **Faixa de resumo:** Vendedor (oculto com um membro só), Vertical, Última visita, Último contato, Próxima atividade (os três últimos com "Nunca"/"—" até o Módulo 5).
- **Aba Resumo:** cards Dados cadastrais, CNAEs (principal marcado), Sócios (só nome e qualificação; "Converter em contato" entra no Módulo 3) e Observações. Sem campos personalizados nem faixas.
- **"Atualizar pela Receita"** no card Dados cadastrais: reconsulta ignorando o cache, atualiza situação e data e mostra um diálogo com o que mudou (atual × Receita), com "Aplicar alterações" ou "Manter como está"; gera auditoria. Mostra "Receita em DD/MM/AAAA" ao lado.
- **Aba Histórico** (auditoria legível).
- Abas **Contatos, Atividades e Oportunidades** e botões "Nova atividade"/"Nova oportunidade" ficam **escondidos** até o módulo de cada uma (nada de "chega no Módulo X").
- **Editar:** mesma tela do cadastro, sem o passo da Receita.

- **Regra das tags (decidida em 12/10/2026):** tag em uso por alguma empresa, **atual ou no histórico de Status** (`empresa_tags_historico`), **não pode ser excluída, só inativada**, para preservar o histórico de conversão (Lead → Cliente). O mesmo vale para excluir um **grupo** de tags com tags em uso. A conferência de uso já está na API de tags (commit 6 do Módulo 2), com teste.

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
