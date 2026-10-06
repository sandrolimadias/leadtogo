# Handoff: Leadtogo CRM — MVP (gestão de carteira)

## Visão geral
Protótipo clicável do CRM **Leadtogo**, focado em gestão de carteira: a empresa é o centro; contatos, atividades e oportunidades giram em torno dela. Cobre 7 fluxos do MVP em **desktop (1440px)** e **celular (390px)**, nos temas **claro e escuro**, com navegação lateral recolhível e seletor de empresa (multiempresa).

Regras de negócio e campos: `docs/funcionalidades.md` e `docs/modelagem_banco.md` são a fonte da verdade. Este README descreve **a interface**.

## Sobre os arquivos de design
Os arquivos em `prototipo/` são **referências de design feitas em HTML** — mostram aparência e comportamento pretendidos, **não são código de produção**. A tarefa é **recriar estas telas no stack do projeto: React + Tailwind CSS v4 + shadcn/ui**, usando os tokens de `design-system/tailwind-theme.css` (já compatível com shadcn). Os componentes de referência (`window.Leadtogo`, classes `lt-`) devem virar componentes shadcn com os mesmos tokens e comportamento — veja `design-system/componentes.md` e `design-system/components.d.ts` (props).

Para abrir o protótipo: na pasta `prototipo/`, rode `npx serve` (ou `python -m http.server`) e acesse `Leadtogo CRM.dc.html`. A barra superior do protótipo alterna Tema (Claro/Escuro) e Dispositivo (Desktop/Celular) — essa barra **não faz parte do produto**.

## Fidelidade
**Alta fidelidade.** Cores, tipografia, espaçamentos, estados e textos são finais. Recrie fielmente. Os dados de exemplo (empresas do ES) são fictícios.

---

## Shell da aplicação

### Desktop (≥ 1024px)
- **Layout:** `flex` horizontal, altura 100vh. Sidebar + coluna principal (topbar + `main` com rolagem própria, fundo `--bg`).
- **Sidebar** (`--surface`, borda direita 1px `--border`, padding 16px 12px, gap 4px):
  - **Expandida 248px** (`--sidebar-width`): marca (logo 24px + "Leadtogo" Instrument Sans 700 17px) + botão recolher (IconButton sm, `chevron-left`, "Recolher menu").
  - **TenantSwitcher** (logo com iniciais na cor da tag do tenant, nome, papel, `chevron-down`). Abre `Menu` (264px, `--shadow-md`): heading "Suas empresas", empresas com check na ativa (`Nome · Papel`), separador, "Painel consolidado", "Criar empresa". Trocar mantém a tela atual e mostra Toast info "Empresa ativa trocada".
  - **Itens** (altura 36px, raio 6px, ícone 17px, gap 10px): Dashboard, Empresas, Contatos, Oportunidades (contador "2 paradas"), Tarefas (contador 7). Ativo: fundo `--surface-selected`, texto `--accent`, peso 600. Hover: `--surface-hover`.
  - Grupo "Carteira" (overline 11px/600, `--ink-subtle`): Prospecção, Rotas (Badge "Fase 3").
  - Rodapé (borda superior): Avatar + nome/papel + IconButton Configurações.
  - **Recolhida 64px:** só ícones centralizados com `title`/`aria-label`; logo e botão `chevron-right` ("Expandir menu") empilhados; tenant vira quadrado 40px com iniciais (abre o mesmo menu à direita, `left:48px`); divisor 1px no lugar do rótulo "Carteira"; rodapé só Avatar. Transição de largura 150ms. **Persistir** a preferência por usuário.
- **Topbar** 56px (`--topbar-height`), `--surface`, borda inferior: busca global 420px (TextField com ícone search, placeholder "Buscar empresas, contatos e oportunidades"); à direita Button secundário "Registrar atividade" (+), IconButton sino com contador vermelho (`--danger`, 16px, texto `--on-danger` 10px/700). O sino abre painel 360px: itens com ícone de estado + título + texto + "Empresa · quando" (notificações de várias empresas identificadas pela empresa).
- **Toast:** canto inferior direito, 380px, some em ~4,5s.

### Celular (< 768px)
- Header 56px: logo (ou "Voltar" em Ficha/Nova empresa) + título da tela (18px/600) + IconButtons busca e sino (44px) + Avatar (abre folha de perfil).
- **Folha de perfil** (sobe do rodapé, raio 16px no topo, alça 40×4px): usuário, "Empresa ativa" com lista de empresas (linha 52px, ativa com borda `--accent` + "Ativa" com check), Painel consolidado, Configurações, Sair. *O seletor de empresa no celular fica aqui.*
- Conteúdo com `data-density="touch"` (controles 44px, fonte 16px).
- **Barra inferior** 68px, 5 itens (ícone 20px + rótulo 11px): Início, Empresas, Funil, Tarefas, Mais (abre perfil). Ativo em `--accent`/600.
- **FAB "+"** (IconButton variant `fab`) canto inferior direito, 16px da borda, acima da barra: abre "Registrar atividade". Oculto em Nova empresa e com a folha aberta.
- Toast acima da barra inferior, largura total − 24px.

### Tema
- `data-theme="light" | "dark"` no `<html>`; mesmos nomes de token. Logo: `leadtogo-mark.svg` (claro) / `leadtogo-mark-dark.svg` (escuro). Persistir a escolha; padrão = preferência do sistema.

---

## Telas

### 1. Dashboard
**Propósito:** saber o que fazer hoje e como está o mês.
- Padding 24px (celular 16px), gap 20px, largura máx. 1400px.
- **Cabeçalho:** data (13px `--ink-muted`, "Segunda, 5 de outubro de 2026") + "Bom dia, Alessandro" (`display` 30/36 600; celular 22px). À direita: SegmentedControl "Minha visão | Equipe" (só gestor/admin, só desktop) e período "Mês atual | Mês anterior | Trimestre" (celular: "Mês | Anterior | Trimestre").
- **StatTiles** (4 colunas; celular 2×2): Previsão do mês (soma do valor ponderado com previsão no mês, hint "valor ponderado, N oportunidades"), MRR conquistado (delta "+18%" "vs. mês anterior" + sparkline), Taxa de conversão (contagem, "4 conquistadas × 2 perdidas"), Sem contato há 60 dias (contagem).
- **Grade** `1.5fr / 1fr` (celular 1 coluna):
  - **Minhas atividades** (card `--surface`, borda, raio 8px): título `title-md` + Button ghost "Ver agenda". Tabs: **Hoje · Atrasadas · Próximos 7 dias** (com contadores de pendentes; celular "7 dias"). Linha: ActivityIcon + título 600 + PriorityMarks; meta 13px (quando — vermelho/600 se atrasada —, empresa sublinhada que abre a ficha, contato); Badge de situação (Pendente neutro / Atrasada danger + `triangle-alert` / Realizada success + `circle-check`); IconButton secundário `check` "Concluir atividade". **Conclusão rápida:** expande na própria linha (fundo `--surface-sunken`) com TextField "Resultado" (multiline) e botões "Cancelar" (ghost), "Concluir e agendar próxima" (secundário; abre Registrar atividade com a empresa), "Concluir atividade" (primary). Resultado vira nota sob o título. Rodapé do card (`--surface-sunken`): "Quadro de tarefas: **2 atrasadas** (danger) · 3 para hoje · 7 nesta semana" → Tarefas.
  - **Funil e previsão:** Select de funil (160px). Por fase: ponto da cor da fase, nome, "N oportunidades", total (tabular); barra 8px proporcional ao maior total, na cor `--tag-<cor>-fg`. Clique → Oportunidades. Bloco 2 colunas: **Conquistadas** (ícone `circle-check` `--success`, valor 20px/600, "4 oportunidades · R$ 3.450/mês") × **Perdidas e canceladas** (`circle-x` `--danger`). "Principais motivos de perda": nome + barra 90×6px `--tag-red-fg` + contagem.
- **Carteira** (card largura total, grade `1fr / 1.4fr`; celular empilhado): "Carteira" + "148 empresas"; barra empilhada 12px pelas cores das tags (Lead teal, Prospect amber, Cliente green, Inativo gray); 4 botões Tag + contagem (→ Empresas filtrada); "**9 novos leads** no mês, 6 vindos da prospecção". À direita **Sem contato há 60 dias**: linhas clicáveis (→ ficha) com nome, "cidade · vendedor", Tag de status (só desktop), Badge warning com `clock` "N dias" ou neutro "Nunca"; Button ghost "Ver as 23".

### 2. Empresas (lista)
**Propósito:** encontrar e agir sobre a carteira.
- Desktop: título "Empresas" + "N empresas na carteira/com estes filtros"; Buttons "Importar planilha" (upload) e **"Nova empresa"** (primary).
- **Filtros salvos** (chips pílula 30px; celular 36px, rolagem horizontal sem barra): Todas, Minha carteira, Sem visita há 90 dias, Nunca visitadas, Sem próxima atividade — com contagem. Selecionado: borda + texto `--accent`, fundo `--surface-selected`, ícone check.
- **Barra de filtros** (desktop: card, `data-density="compact"` 28px): busca 280px "Nome, CNPJ ou cidade" (sem acento, também por dígitos do CNPJ) + 5 Selects: Status, Visitação, Vendedor, Cidade, Última visita (últimos 30 dias / sem visita há 60 / há 90 / nunca). "Limpar filtros" (ghost, x) aparece com qualquer filtro. Celular: busca + Button "Filtros · N" (abre os selects em 2 colunas) + IconButton "+" Nova empresa.
- **Ações em massa** (desktop, aparecem ao selecionar): barra com borda `--accent` e fundo `--surface-selected`: "N selecionadas", **Aplicar tag** (Menu: Status — substitui a atual — Lead/Prospect/Cliente/Inativo; Interesse — Monitoramento/Retrofit), **Trocar vendedor** (Menu com a equipe), **Exportar**, "Limpar seleção". Toasts confirmam ("Tag aplicada", "Carteira transferida", "Exportação iniciada").
- **Tabela** (sem rolagem horizontal; células quebram linha): cabeçalho `--surface-sunken` 36px 12px/600 `--ink-muted`. Colunas: checkbox (selecionar tudo no cabeçalho) · **Empresa** (nome 600 + CNPJ em mono 12px) · Tags (máx. 3 + "+N") · Cidade · Vendedor (Avatar sm + "Nome I.") · Última visita (data + relativo; warning/600 se ≥ 90 dias ou nunca) · Último contato (warning se ≥ 60 dias) · Próxima atividade (ActivityIcon sm + quando; ou "**Sem próxima atividade**" warning com `calendar`) · Em aberto (R$ à direita + "N oportunidades"). Linha selecionada `--surface-selected`; hover `--surface-hover`; clique abre a ficha.
- **Vazio:** EmptyState "Nenhuma empresa com esses filtros" + "Limpar filtros".
- **Celular — cards:** nome 16/22 600 + chevron; tags; `map-pin` "Cidade/ES · Vendedor"; `clock` "Última visita há N dias (dd/mm)" ou "Nunca visitada"; próxima atividade. Rodapé com 3 botões 48px separados por borda: **Ligar** (`phone` azul), **WhatsApp** (`message-circle` verde), **Rota** (`navigation` laranja; abre o Maps).

### 3. Ficha da empresa
- **Cabeçalho** (`--surface`, borda inferior): breadcrumb "Empresas › Nome" (desktop). Nome `title-lg` 22/28 + Badges "Matriz" (outline) e "Ativa na Receita" (success, `circle-check`). Razão social + CNPJ mono. Tags + Button ghost "Editar tags". Ações (desktop): IconButtons Ligar e WhatsApp, Button "Nova oportunidade", **"Nova atividade"** (primary), "Mais ações". Faixa de metadados (5 colunas; celular 2): Vendedor (Avatar), Vertical, Última visita (+ "há N dias"), Último contato, Próxima atividade (ou "Sem próxima atividade" warning). Celular: 4 botões 64px Ligar / WhatsApp / Rota / Atividade. **Tabs:** Resumo · Contatos (N) · Atividades (N) · Oportunidades (N) · Histórico (rolam na horizontal no celular).
- **Resumo** (grade `1.7fr / 1fr`; celular 1 coluna):
  - **Dados cadastrais** (dl 3 colunas; celular 1): razão social, fantasia, CNPJ (mono), matriz/filial, início das atividades, porte, regime tributário, MEI, endereço (`tipo + logradouro, número – complemento, bairro`), cidade/UF, CEP (mono), telefones (+ WhatsApp), website, funcionários (faixa + nº), faturamento (faixa), data de registro, origem do cadastro. Cabeçalho: "Receita em dd/mm/aaaa" + Button ghost **"Atualizar pela Receita"** (`repeat`) → loading "Consultando Receita…" → painel de comparação: Alert info "A Receita tem N valores diferentes" + grade Campo / No CRM / Na Receita, com Checkbox por campo; "Manter como está" / **"Aplicar selecionados"**. Telefones e sócios são somados, nunca substituídos.
  - **CNAEs:** código mono (88px) + descrição; Badge outline "Principal".
  - **Sócios:** Avatar + nome + qualificação; Button "Converter em contato" → Badge success "Contato" + Toast. (Sem CPF — LGPD.)
  - **Campos personalizados** (rótulo × valor) e **Observações**.
- **Contatos:** grade de cards (auto-fill ≥ 280px): Avatar, nome, cargo (do vínculo), Badge "Principal" (`star`), Badge outline papel na decisão, telefone/e-mail, Buttons Ligar, WhatsApp, IconButton e-mail. "Vincular contato".
- **Atividades:** ActivityTimeline com **Agendadas** no topo e **Histórico** abaixo (overlines). Itens: tipo, título, Badge de situação, PriorityMarks, quando · contato · responsável · recorrência (`repeat`), nota do resultado.
- **Oportunidades:** linhas título + "Solução · Fase", StatusPill (Ativo/Conquistado/Perdido…), total + MRR (ou "Motivo: …" se perdida), data de previsão/fechamento.
- **Histórico:** log de auditoria — ícone em círculo 28px `--surface-sunken`, texto, "dd/mm/aaaa hh:mm · autor" (Sistema para automações: tags Visitada/Contactada, Status → Cliente).

### 4. Nova empresa
- Largura máx. 980px. Passos numerados (círculo 24px `--accent`/`--on-accent`):
  1. **Documento** — SegmentedControl CNPJ | CPF | Sem documento. TextField "CNPJ" obrigatório, mono, máscara `00.000.000/0000-00` **aceitando letras** (CNPJ alfanumérico), hint "Aceita o CNPJ alfanumérico. Os dados vêm da Minha Receita.", sufixo Button primary sm **"Consultar"** (Enter também consulta). Validação: 14 caracteres → erro "Informe os 14 caracteres do CNPJ, como 12.424.587/0001-45.". Loading: botão "Consultando…" + Skeletons. **Duplicado:** Alert warning "Esta empresa já está no CRM" + "Abrir ficha". **Falha:** Alert danger "A Receita não respondeu. Tente de novo em alguns minutos ou preencha à mão."
  2. **Conferir dados da Receita** — Alert success "Dados preenchidos pela Receita · situação cadastral". Badges Ativa/Matriz. Campos editáveis pré-preenchidos (hint "Da Receita"): razão social, fantasia, regime tributário (Select), início das atividades, porte/MEI; Endereço (CEP mono, logradouro, número, complemento, bairro, cidade); Telefones (Checkbox por telefone, tipo); Sócios (Checkbox "converter em contato ao salvar"); CNAEs (principal marcado).
  3. **Carteira** — Vendedor*, Vertical, Status* (padrão Lead), Funcionários, Faixa de faturamento, Website, Observações.
- Rodapé fixo (sticky): "Cancelar" (ghost) + **"Salvar empresa"** (primary, `check`; celular largura total). Ao salvar: Toast + volta para a lista.

### 5. Oportunidades
- Barra: título (desktop), Select de funil, SegmentedControl **Kanban | Lista** (ícones `square-kanban` / `list`), Select responsável, Button "Suspensas · N", **"Nova oportunidade"** (primary). Resumo: N ativas · Total · Mensal · Ponderado (tabular).
- **Kanban (desktop):** colunas `KanbanColumn` 296px (raio 12px, `--surface-sunken`) com ponto da cor da fase, nome, contagem e soma R$. Só status **Ativo**. Cards `DealCard`: título, empresa, valor total + MRR "/mês", Avatar responsável, previsão (vencida: danger + `triangle-alert`; hoje: âmbar), próxima atividade (ActivityIcon + rótulo) ou **"Sem próxima atividade"**, alerta de parada (contorno warning + `hourglass` "Parada há N dias nesta fase"). **Arrastar e soltar** entre fases (coluna-alvo com contorno tracejado `--accent` 2px; card arrastado 40% opacidade). Ao mover: Toast com a probabilidade sugerida da fase. **Zona de soltura** fixa no rodapé (4 áreas tracejadas 52px): Conquistado (`--success`), Perdido (`--danger`), Cancelado (neutro), Suspenso (`--warning`); ao passar por cima o fundo vira `-soft` → abre o diálogo de fechamento.
- **Menu do card** (clique): "Mover para" (fases), "Fechar": Marcar como conquistada / perdida / cancelada / Suspender, "Abrir empresa". *É o jeito de mover no celular.*
- **Celular:** chips das fases (pílula 40px, rolagem horizontal), uma coluna por vez, cabeçalho "Fase · N" + total; cards empilhados com menu inline.
- **Suspensas:** painel com StatusPill Suspenso, linhas "título · empresa · parou em Fase · motivo", "Retomar em dd/mm/aaaa", Button "Reabrir" (volta a Ativo, registra no histórico).
- **Lista:** tabela Oportunidade (+ empresa) · Fase (ponto) · Status (StatusPill) · Total · Mensal · Prob. · Previsão (vencida em danger) · Responsável · Próxima atividade (ou "Sem próxima atividade" warning).
- **Diálogo "Fechar oportunidade"** (desktop 520px centralizado; celular folha inferior, raio 16px no topo): descrição "título · empresa". Radiogroup 2×2 (52px; celular 56px): **Conquistado** "Ganhou o negócio" · **Perdido** "Cliente não fechou" · **Cancelado** "Não deveria seguir" · **Suspenso** "Pausa com data de volta" (selecionado: borda 2px `--accent`, fundo `--surface-selected`). **Motivo** (Select obrigatório, lista por status — ver `motivos` em `modelagem_banco.md`) para Perdido/Cancelado/Suspenso; erro "Escolha um motivo para fechar." / "…para suspender.". Suspenso: **"Retomar em"** (date; cria atividade de retomada). Conquistado: bloco `--success-soft` com Valor total e MRR + Switch "Mudar o Status da empresa para Cliente" (ligado). "Detalhe" (multiline). Nota `flag` "Fica registrado que parou na fase X.". Rodapé: "Cancelar" + botão que repete o verbo: **Marcar como conquistada** (primary) / **Marcar como perdida** (danger) / **Marcar como cancelada** (danger) / **Suspender oportunidade** (primary).

### 6. Tarefas (Kanban pessoal)
- Barra: título, Select de quadro (Meu dia a dia, Pós-venda, Equipe comercial), Select prioridade (Toda / Importantes / Urgentes), Switch "Exibir atividades com clientes", Button "Personalizar quadro" (`settings`; celular "Quadro").
- **Colunas** (modelo padrão): A fazer (cinza) · Fazendo (azul, limite 3 → contador "N/3", vermelho ao estourar) · Aguardando cliente (âmbar) · Feito (verde, **coluna de conclusão**, nota "Coluna de conclusão: marca como Realizada"). "Adicionar tarefa" no rodapé da coluna → criação rápida: TextField "Título e Enter" (Esc cancela).
- **TaskCard:** ActivityIcon do tipo (Tarefa cinza ou tipo da atividade), título, empresa (`building-2`), PriorityMarks (**Importante** estrela âmbar, **Urgente** raio vermelho), etiquetas (Tag sem ponto), progresso do checklist (barra + "2/5"), prazo (vencido danger/`triangle-alert`, hoje âmbar), recorrência (`repeat`). Arrastar entre colunas. **Atividade de cliente** solta em coluna de conclusão → diálogo "Concluir atividade" (Resultado + "Concluir e agendar próxima" / "Concluir atividade"); tarefa interna conclui direto.
- **Painel da tarefa** (desktop: lateral direita 440px, altura total; celular: folha inferior 92%): "Tipo · Coluna", título; Prazo (cor por estado), Empresa ("Sem empresa (tarefa interna)"), Responsável, Recorrência; **Prioridade**: Switches Importante e Urgente + texto do quadrante ("Importante e urgente: faça agora." etc.); **Checklist**: "N de M", barra `--success`, Checkboxes marcáveis, "Adicionar item e Enter"; Etiquetas; "Mover para" (Select). Rodapé: "Converter em atividade" (só Tarefa) + **"Concluir"** (primary).
- **Personalizar quadro** (Dialog 600px): por coluna — alça `grip-vertical`, nome, limite (number), remover (`trash-2`), 10 amostras de cor (paleta de tags, selecionada com anel `--ink`), Checkbox "Coluna de conclusão" (só uma); "Adicionar coluna"; Switch "Exibir atividades agendadas com clientes". "Salvar quadro". Cards de colunas removidas vão para a primeira.
- **Celular:** chips das colunas (com "N/limite"), uma coluna por vez, EmptyState "Nada nesta coluna".

### 7. Registrar atividade
- **Celular:** folha que sobe do rodapé (raio 16px no topo, alça, máx. 92% de altura, `data-density="touch"`), aberta pelo FAB "+". **Desktop:** modal 560px pelo botão da topbar ou "Nova atividade" da ficha (empresa pré-preenchida).
- Campos:
  - **Tipo** — radiogroup 3×2 (52px no celular): Ligação, WhatsApp, E-mail, Visita, Reunião, Tarefa, cada um com ActivityIcon. Padrão: Visita.
  - **Empresa*** (obrigatória exceto Tarefa) — busca "nome, CNPJ ou cidade" com sugestões da carteira do usuário (nome, "Cidade/ES · vendedor", Tag de status); escolhida vira um campo fixo com "Trocar". Erro: "Escolha a empresa. Só a Tarefa pode ficar sem empresa."
  - **Contato** — Select só com contatos da empresa escolhida ("Sem contato" padrão).
  - **Título** — placeholder varia por tipo.
  - **Data** (date) + **Hora** (time).
  - **Situação** — radiogroup 4 colunas: Pendente (`clock`), Em execução (`circle-pause` info), Realizada (`circle-check` success), Cancelada (`ban`). Padrão: Realizada.
  - **Resultado*** (só Realizada) — multiline; hint explica o efeito: "Conta como visita: aplica a tag Visitada." / "Conta como contato: aplica a tag Contactada." / "Tarefa interna: não altera a carteira."; erro "Conte o que aconteceu para concluir a atividade."
  - Switches **Importante** e **Urgente**.
- Rodapé: "Cancelar" (desktop), "Registrar e agendar próxima" (só Realizada), **"Registrar atividade"** (primary; celular largura total, padding inferior 24px para a área segura). Toast: "Atividade registrada — Tag Visitada aplicada e última visita atualizada." ou "Atividade agendada".

---

## Interações e comportamento (geral)
- Movimento 120–150ms só em cor, opacidade e posição; respeitar `prefers-reduced-motion`.
- Hover muda fundo (`--surface-hover`), não tamanho. Foco: anel 2px `--focus-ring`, offset 2px.
- **Azul-petróleo (`--accent`) só para ação principal e seleção.** No máximo um botão primary por área.
- Estados **sempre** com palavra ou ícone (nunca só cor): atrasada, parada, sem próxima atividade, vencida, perdida…
- Datas relativas até 7 dias ("Hoje, 14:00", "Ontem", "Qua"); depois `dd/mm`. Moeda `R$ 24.600`, `R$ 1.300/mês`; números tabulares em colunas.
- Atrasada = situação Pendente/Em execução com data passada (calculado).
- Concluir atividade de tipo Visita/Contato atualiza `ultima_visita_em`/`ultimo_contato_em` e aplica a tag automática.
- Trocar tag de grupo de seleção única (Status) substitui a anterior e registra no histórico.
- Celular: nada depende de arrastar — mover sempre pelo menu do card.
- Offline (futuro): ações na fila → Toast "Salvo no aparelho. Será enviado quando voltar a conexão."

## Estado (sugestão)
- Sessão: tenant ativo (`activeOrganizationId`), papel do usuário no tenant, tema, sidebar recolhida, visão do dashboard (minha/equipe).
- Empresas: filtros (busca, status, visitação, vendedor, cidade, última visita), filtro salvo ativo, seleção em massa — idealmente na URL.
- Oportunidades: funil, visão Kanban/Lista, filtros; mutações de fase (com histórico) e status (com motivo, fase em que parou, `suspensa_ate`).
- Tarefas: quadro ativo, colunas (nome, cor, limite, `situacao_vinculada`), posição dos cards (`posicao` fracionária), checklist.
- Registrar atividade: tipo, empresa, contato, título, data/hora, situação, resultado, importante, urgente.
- Consulta CNPJ: idle → loading → preenchido | duplicado | falha (cache `receita_consultas`, fallback BrasilAPI/ReceitaWS).

## Tokens de design
Fonte completa: `design-system/tokens.json`, `tokens.css` e `tailwind-theme.css` (Tailwind v4 + shadcn).

**Claro / Escuro (principais)**
| Token | Claro | Escuro |
|---|---|---|
| bg | #f5f7f7 | #0b1416 |
| surface | #ffffff | #111d20 |
| surface-sunken | #edf1f1 | #0d171a |
| surface-hover | #eef3f3 | #17262a |
| surface-selected (= accent-soft) | #e0eff1 | #0f3239 |
| border | #d8e0e1 | #24363b |
| border-strong | #6f8387 | #5e797e |
| ink | #0f2428 | #e4eef0 |
| ink-muted | #4a5f63 | #a5b7bb |
| ink-subtle | #56696d | #8ea2a6 |
| accent | #0b5f70 | #5ec2d6 |
| accent-hover | #084c5a | #7dd0e0 |
| on-accent | #ffffff | #04191d |
| success / -soft | #17703f / #e3f3e9 | #5fd18f / #0f2a1b |
| warning / -soft | #8a5300 / #fbf0dc | #f0b45a / #2d200b |
| danger / -soft | #b42318 / #fce9e6 | #ff8a7a / #36140f |
| info / -soft | #2f55a4 / #e7edf9 | #8fb0f5 / #152240 |
| overlay | rgba(8,20,23,.48) | rgba(0,0,0,.6) |

**Tags** (`tag-<cor>-bg` / `-fg`, claro): gray #eef1f2/#3d4f53 · red #fde8e6/#a3231a · orange #fdeedd/#9a4a06 · amber #fbf3d0/#7c5800 · green #e3f4e8/#17693b · teal #dff1f3/#0b5f70 · blue #e5eefc/#2350a6 · indigo #ebebfc/#4338a8 · purple #f3e9fb/#7a2f9e · pink #fce8f1/#a3245d (escuro em `tokens.css`).
Padrões: Lead teal · Prospect amber · Cliente green · Inativo gray · Visitada orange · Contactada blue. Tipos: Ligação blue · WhatsApp green · E-mail indigo · Visita orange · Reunião purple · Tarefa gray. Fases do funil de exemplo: Qualificação teal · Diagnóstico blue · Proposta indigo · Negociação amber.

**Tipografia:** Instrument Sans (400–700) + IBM Plex Mono (CNPJ, CPF, CEP, códigos).
display 30/36 600 −0.015em · title-lg 22/28 600 −0.01em · title-md 18/24 600 · title-sm 15/20 600 · body-lg 16/24 · body 14/20 · body-strong 14/20 600 · body-sm 13/18 · caption 12/16 500 · overline 11/16 600 +0.06em caixa-alta · kpi 28/32 600 tabular · mono 13/18.

**Espaço:** grade de 4px — 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64. Cards/painéis 16px; cards do Kanban 12px; diálogos 24px; páginas 24px (desktop) / 16px (celular).
**Cantos:** 4 / 6 (controles) / 8 (cards, menus) / 12 (diálogos, colunas) / pílula (tags, avatares, chips, switch). Folhas no celular: 16px no topo.
**Sombras:** sm `0 1px 2px rgba(15,36,40,.06)` · md `0 4px 12px rgba(15,36,40,.10), 0 1px 3px rgba(15,36,40,.06)` · lg `0 16px 40px rgba(15,36,40,.16), 0 2px 6px rgba(15,36,40,.08)`. Sombra só no que flutua.
**Controles:** compacto 28px (tabelas, filtros) · padrão 36px · toque 44px (`data-density`).
**Layout:** sidebar 248px (recolhida 64px) · topbar 56px · coluna Kanban 296px · breakpoints 640 / 768 / 1024 / 1280.

## Assets
- `prototipo/ds/logos/leadtogo-mark.svg` e `leadtogo-mark-dark.svg` — marca (quadrado petróleo, ponto + seta).
- Ícones **Lucide** (ISC), traço 1.75, 14–17px na interface, 20–22px em vazios e FAB. Use `lucide-react`. Nomes usados: layout-dashboard, building-2, users, handshake, square-kanban, target, route, search, bell, plus, settings, phone, message-circle, mail, map-pin, navigation, calendar, clock, check, circle-check, circle-x, circle-pause, ban, triangle-alert, hourglass, star, zap, repeat, flag, pencil, user, upload, download, list, layout-grid, grip-vertical, trash-2, chevron-left/right/down, ellipsis, x, sun, moon, log-out, trending-up. SVGs avulsos em `design-system/icons/`.
- WhatsApp usa `message-circle` verde (não usar o logotipo oficial).
- Fontes em `prototipo/ds/fonts/` (Instrument Sans variável, IBM Plex Mono 400/500).

## Arquivos
```
prototipo/
  Leadtogo CRM.dc.html     shell: sidebar recolhível, topbar, multiempresa, tema, celular (header, barra inferior, FAB, perfil)
  Dashboard.dc.html        tela 1
  Empresas.dc.html         tela 2
  FichaEmpresa.dc.html     tela 3
  NovaEmpresa.dc.html      tela 4
  Oportunidades.dc.html    tela 5 (Kanban, lista, diálogo de fechamento)
  Tarefas.dc.html          tela 6 (quadro, painel, personalização)
  RegistrarAtividade.dc.html tela 7
  dados.js                 dados de exemplo (empresas do ES, fases, oportunidades, motivos)
  ds/                      tokens.css, bundle.css/js (componentes de referência), fontes, logos
  support.js               runtime do protótipo (não usar em produção)
design-system/
  manual-da-marca.md, componentes.md, components.d.ts, tokens.json, tokens.css, tailwind-theme.css, icons/
docs/
  funcionalidades.md, modelagem_banco.md
```

Em cada `.dc.html`, a marcação está entre `<x-dc>` e `</x-dc>` (estilos inline com `var(--token)`), e a lógica de estado/interação na classe `Component` do `<script data-dc-script>` — leia ambos para regras de exibição (ex.: quando mostrar "Sem próxima atividade", cores de atraso, validações).
