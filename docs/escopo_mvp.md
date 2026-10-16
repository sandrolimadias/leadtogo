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
| 5 (Atividades) | tipos de atividade | **Feito (16/10/2026, junto do Módulo 7):** 409 `tipo_em_uso`; a Tarefa continua protegida (`tipo_de_sistema`) |
| 6 (Oportunidades) | funis, fases, motivos, origens, soluções | **Funis e fases: feito no Módulo 6** (409 `funil_ja_usado`, `fase_ja_usada`, `fase_com_oportunidades_ativas`). **Motivos, origens e soluções: feito em 16/10/2026** (409 `motivo_em_uso`, incluindo o histórico de fechamentos; `origem_em_uso`, incluindo as importações; `solucao_em_uso`). **Fases passam a poder ser inativadas** (a coluna `ativo` já existe; a API e a tela do Módulo 1 não oferecem, porque a fase só era excluível). A regra "fase com oportunidades **ativas** exige mover antes" continua valendo para tirar a fase de uso |


### Módulo 2 — Empresas ✅ *concluído e aprovado pelo Ale (13/10/2026)*
*Plano aprovado pelo Ale em 13/10/2026, com execução autônoma do módulo inteiro. **Testado e aprovado pelo Ale em 13/10/2026: todos os itens do roteiro passaram** ([`roteiro_teste_modulo2.md`](roteiro_teste_modulo2.md), que também lista o que ficou de fora e por quê).*

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

**Configurações → Carteira** (`GET/PATCH /v1/configuracoes/carteira`; entrou como commit próprio depois da tela de nova empresa)
- Duas chaves, cada uma vale na hora, **só o administrador altera**: **Bloquear o cadastro de empresa não ativa na Receita** (padrão ligado; só cadastro novo) e **Vendedores podem ver todas as empresas** (padrão desligado; o vendedor vê tudo, edita só a própria). A mudança vai para a auditoria (antes e depois).

**Lista `/empresas`**
- **Chips com contagem:** Todas, Minha carteira, Sem visita há 90 dias, Nunca visitadas, Sem próxima atividade. Os três últimos (e suas contagens) consideram por padrão só Status **Cliente e Prospect**, com a opção "Incluir leads"; "Todas" mostra tudo.
- **Filtros:** busca sem acento (nome, CNPJ, cidade), Status, Visitação, Vendedor, Cidade, Última visita; "Limpar filtros"; filtros na URL.
- Filtro Vendedor e chip "Minha carteira" ficam **ocultos** quando o tenant tem um único membro ativo.
- **Colunas:** Empresa (nome + CNPJ), Tags (**todas**, sem "+N", quebrando linha), Cidade, Última visita, Último contato, Próxima atividade. **Sem a coluna Vendedor.** A coluna "Em aberto" fica oculta até o Módulo 6. Alertas: visita a partir de 90 dias, contato a partir de 60.
- **Celular:** cards com Ligar, WhatsApp e Rota. **Aplicar tag em massa**, respeitando grupos de seleção única.

**Tags da empresa** (`PUT /v1/carteira/empresas/{id}/tags`, commit 6)
- Substitui as tags dos grupos **manuais** (Status, Interesse...): seleção única aceita uma, grupo obrigatório (Status) exige uma, tag inativa não se aplica de novo. As tags de grupo **automático** (Visitação) são do sistema e não mudam por aqui.
- Cada tag que entra ou sai grava uma linha em `empresa_tags_historico` (base da conversão Lead → Cliente) e um registro de auditoria (`alterar_tags`). O Status inicial do cadastro também entra no histórico.

**Histórico da empresa** (`GET /v1/carteira/empresas/{id}/historico`, commit 7)
- A aba Histórico mostra a **auditoria em português** (quem, quando, o que mudou, com nomes no lugar de ids: vendedor, vertical, cidade, porte) e as **tags que o sistema aplicou ou tirou sozinho** ("Sistema"). Do mais recente ao mais antigo, paginado; segue a regra de carteira (404 para a empresa que o usuário não vê). Passar a carteira para outro vendedor aparece como "Carteira transferida".

**Atualizar pela Receita** (API, `POST /v1/carteira/empresas/{id}/receita/consultar` e `/aplicar`; entrou como commit próprio entre o 7 e o 8)
- Dois passos: **consultar** reconsulta ignorando o cache, grava a data e tira o selo "situação não verificada", e devolve a situação e o que difere (atual × Receita); **aplicar** grava tudo (ou só os `campos` pedidos). "Manter como está" é não aplicar.
- Só CNPJ (409 `sem_cnpj`) e só quem edita a empresa. As duas fontes fora do ar, ou só cache vencido: 503, e nada muda. Empresa que deixou de ser ativa continua na carteira.
- Telefones da Receita **só se somam** aos da equipe; sócios vêm sempre da Receita. A auditoria guarda a consulta e, ao aplicar, o antes e o depois ("Atualizado pela Receita" no Histórico).

**Tags em massa** (`POST /v1/carteira/empresas/tags-em-massa`, commit 12)
- Na lista (desktop e tablet), marcar empresas mostra a barra "N selecionadas · Aplicar tag · Limpar seleção". Aplica **uma tag** a até 200 empresas; tag de grupo de seleção única (**Status**) **substitui** a que a empresa tinha. Só mexe no que o usuário edita (o vendedor, nas dele); as outras ficam como estavam e o aviso conta quantas. Tags de grupo automático (Visitação) não se aplicam à mão. A seleção vale só para a página e os filtros que se vê. No celular não há seleção em massa. "Trocar vendedor" e "Exportar" do protótipo não entram nesta fase.

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
- **Aba Resumo:** cards Dados cadastrais, CNAEs (principal marcado), Sócios (só nome e qualificação; "Converter em contato" veio no Módulo 3) e Observações. Sem campos personalizados nem faixas.
- **"Atualizar pela Receita"** no card Dados cadastrais: reconsulta ignorando o cache, atualiza situação e data e mostra um diálogo com o que mudou (atual × Receita), com "Aplicar alterações" ou "Manter como está"; gera auditoria. Mostra "Receita em DD/MM/AAAA" ao lado.
- **Aba Histórico** (auditoria legível).
- Abas **Contatos, Atividades e Oportunidades** e botões "Nova atividade"/"Nova oportunidade" ficam **escondidos** até o módulo de cada uma (nada de "chega no Módulo X").
- **Editar:** mesma tela do cadastro, sem o passo da Receita.

- **Regra das tags (decidida em 12/10/2026):** tag em uso por alguma empresa, **atual ou no histórico de Status** (`empresa_tags_historico`), **não pode ser excluída, só inativada**, para preservar o histórico de conversão (Lead → Cliente). O mesmo vale para excluir um **grupo** de tags com tags em uso. A conferência de uso já está na API de tags (commit 6 do Módulo 2), com teste.

### Módulo 3 — Contatos ✅ *concluído e aprovado pelo Ale (13/10/2026; roteiro em `docs/roteiro_teste_modulo3.md`)*
Vínculo N:N com empresas, cargo por vínculo, telefones, e-mails, papel na decisão, aniversário, consentimento LGPD e **"converter sócio em contato"**. Lista e ficha.

**Ordem de entrega** (cada commit vai para produção, e o Ale testa na tela e responde "aprovado" antes do seguinte):
1. Migração 0018 (tabelas, RLS, isolamento) + Configurações → **Papéis na decisão** ✅ *no ar*.
2. Contato: schemas, API de CRUD (telefones, e-mails, consentimento, aviso de duplicado) + telas **Novo e Editar contato**.
3. **Lista de contatos** (`/contatos`): API com busca e filtros + tela (cartões no celular).
4. **Ficha do contato**: cabeçalho, Empresas vinculadas, Dados da pessoa, Consentimento.
5. **Vínculos**: vincular a outra empresa, cargo, principal, inativar + aba **Contatos** na ficha da empresa.
6. **Converter sócio em contato**, com o vínculo preservado no "Atualizar pela Receita".
7. **Histórico** legível do contato.
8. Docs e roteiro final.

**Andamento do Módulo 3 (atualizado em 13/10/2026; o Ale aprovou seguir do commit 2 ao 8 sem validar um por um, só parando em erro):**
- ✅ **No ar (esteira verde até o verify):** 1 `0cc6359` migração 0018 e Papéis na decisão · 2 `35ddb9a` Novo e Editar contato · 3 `cc60754` lista de contatos · 4 `89051fa` ficha do contato.
- ✅ **Commits `test:` de estabilidade, no ar:** `322c009` prazo maior nos 2 testes de convite · `cb83473` Valkey de teste zerado a cada execução e prazo padrão de 20 s por teste na API (a suíte da API passou de ~300 s para ~560 s sem causa achada: máquina/WSL mais lenta, sem código novo lento) · `6ae699c` prazo padrão de 15 s no `aguardarMensagem` (não há limpeza concorrente do Mailpit: arquivos rodam em sequência).
- ✅ **Commit 5 `290954a` (Vínculos + aba Contatos da empresa):** entregue (as decisões dele estão no bloco "Commit 5" abaixo). O teste que falhava nele (espera de e-mail de 5 s) e o do encerramento gracioso do worker foram tratados pelos commits `test:` de estabilidade (`6ae699c`, `5b40259`: prazo único de 15 s nas esperas e 20 s por teste).
- ✅ **Commit 6 `a9a0c5c` (Converter sócio em contato):** migração 0019 (`empresa_socios.contato_id`), botão na ficha da empresa e reconciliação dos sócios no "Atualizar pela Receita" (com teste).
- ✅ **Commit 7 `60bdaa7` (Histórico do contato):** aba Histórico na ficha do contato (`GET /v1/carteira/contatos/{id}/historico`), com testes.
- ✅ **Commit 8 (Docs e roteiro final):** `docs/roteiro_teste_modulo3.md`. **Os 8 commits foram testados e aprovados pelo Ale.**
- Regra de parada (já cumprida; fica de registro): teste falhando (não reexecutar nem mudar prazo sem consultar), deploy/verify falho, migração destrutiva, variável nova no Coolify, decisão de negócio fora deste documento.

**Decisões aprovadas pelo Ale (13/10/2026), ao aprovar o plano com as propostas:**
- **Fora até os Módulos 5 e 6:** "Última interação", abas Atividades e Oportunidades do contato e o botão "Nova atividade" (a coluna "Última interação" da lista também).
- **Papéis na decisão:** cinco padrões por empresa (Decisor, Influenciador, Usuário, Financeiro, Técnico), editáveis só pelo administrador, com a regra "só se exclui o que nunca foi usado".
- **Quem vê o contato:** o vendedor vê contatos ligados a empresas da carteira dele (ou de todas, com "Vendedores podem ver todas as empresas"); o contato sem nenhuma empresa vinculada ativa só é visível a gestor e administrador; o vendedor edita o contato que tem vínculo com empresa dele.
- **Consentimento:** "Pediu para não receber contato" desliga `aceita_whatsapp` e `aceita_email`, grava data e origem "manual" e mostra o selo "Não quer contato"; **não bloqueia** Ligar e WhatsApp (o bloqueio de envio fica para as fases de e-mail e WhatsApp).
- **Duplicados** (e-mail ou telefone igual): só avisa, com "Abrir contato"; **sem mesclar**.
- **Converter sócio:** cria o contato com o nome do sócio e o vínculo na empresa com cargo = qualificação, sem telefone nem e-mail; o sócio fica marcado como "Contato" e não converte duas vezes.
- **Principal:** um contato principal por empresa; marcar outro tira o selo do anterior.
- **Excluir contato:** exclusão lógica só de gestor e administrador, sem lixeira; o caminho comum é inativar o vínculo.
- **Fora do Módulo 3:** campos personalizados do contato, mesclar duplicados, importar planilha de contatos (pós-MVP), bloqueio efetivo de envio por consentimento, identificar contato pelo WhatsApp, alerta de aniversário e foto do contato.

**Decisões tomadas na implementação do Módulo 3** (dentro do plano aprovado; o Ale vê o resultado na tela de cada commit):
- *Commit 2 (Novo e Editar contato):*
  - **Vendedor precisa escolher a empresa** ao criar contato (só empresa da carteira dele): sem empresa vinculada ele não veria o contato. Gestor e administrador podem criar sem empresa e vincular depois.
  - **O que se vê na ficha:** o vendedor só vê os vínculos com empresas que ele vê; os outros não aparecem.
  - **Duplicado:** o aviso compara e-mail (sem diferença de caixa) e telefone (E.164) com qualquer contato da empresa; na edição só conta o e-mail ou telefone **novo**. Contato de carteira que o usuário não vê entra no aviso **sem nome e sem "Abrir contato"**.
  - **Consentimento:** só vai no corpo quando a pessoa mexe na chave; mudar o consentimento grava data e origem "manual".
  - **Aniversário** valida dia e mês reais (29/02 vale, 31/02 não). **LinkedIn** só aceita endereço do próprio LinkedIn.
  - **Vínculo e exclusão de empresa:** ao excluir uma empresa, todos os vínculos dela ficam **inativos** (e deixam de ser o principal), mantendo o histórico; o vendedor deixa de ver o contato que só tinha essa empresa, e admin e gestor continuam vendo.
  - **Até a ficha existir (commit 4)**, depois de criar o contato e no "Abrir contato" do aviso de duplicado a tela leva para a **edição** do contato; a lista (`/contatos`) existe desde o commit 3.
- *Commit 3 (Lista de contatos):*
  - **Colunas:** Contato (nome, papel na decisão e selo "Não quer contato") · Empresas (estrela no principal; vínculo inativo aparece riscado, com "(inativo)") · Cargo (um por empresa, na mesma linha) · Telefone (principal, com o ícone de WhatsApp se algum telefone for desse tipo) · E-mail (principal). **Sem "Última interação"** (Módulo 5) e **sem "Importar planilha"** (Módulo 4); o botão só aparece quando a importação existir.
  - **Busca:** nome (sem acento nem caixa), e-mail (pedaço) e telefone (pedaço dos dígitos, com ou sem máscara). Ordem por nome, 25 por página.
  - **Filtros:** Empresa, Cargo, Papel na decisão e Tag da empresa, todos na URL. **Empresa, cargo e tag valem para o mesmo vínculo ativo** ("Diretor na Usidantec"); o vínculo inativo não entra nesses filtros, mas o contato continua na lista. O cargo é comparado pelo texto inteiro, sem diferença de acento ou caixa, e a lista de cargos vem dos vínculos ativos que o usuário vê. O vendedor não descobre a carteira dos outros pelo filtro de empresa.
  - **Filtro de Empresa:** é um campo com **busca no servidor** (parte do nome ou do CNPJ; 8 resultados por vez, com o aviso "Mais N empresas: digite mais"), no lugar da lista fixa das 100 primeiras, porque depois da importação (Módulo 4) a carteira passa de 5.000 empresas. A empresa vem pelo id na URL e o nome dela é buscado se ainda não se conhece. Só aparecem empresas que o usuário vê. (Mudança de 13/10/2026, pedida pelo Ale ao aprovar o módulo.)
  - **Celular:** cartões com Ligar, WhatsApp e E-mail; filtros atrás do botão "Filtros · N". "Não quer contato" só **avisa**: Ligar e WhatsApp continuam ativos (decisão aprovada).
- *Commit 4 (Ficha do contato):*
  - **Cabeçalho:** nome, papel na decisão, selo "Não quer contato", linha "cargo · empresa" do vínculo ativo principal ("Sem empresa vinculada" ou "Sem vínculo ativo" quando for o caso) e as ações Ligar, WhatsApp, E-mail (usam o telefone e o e-mail principais), Editar e "Mais ações" (Excluir contato só para gestor e administrador, com confirmação). Sem "Nova atividade" e sem as abas Atividades e Oportunidades até os Módulos 5 e 6; as abas Resumo e Histórico (o Histórico veio no commit 7).
  - **Empresas vinculadas:** só leitura neste commit (nome com link para a ficha da empresa, cargo, "Principal", Ativo ou Inativo). **Vincular, trocar o principal e inativar chegam no commit 5.**
  - **Consentimento:** a chave "Pediu para não receber contato" **grava na hora** (sem passar pela edição), para quem pode editar o contato. Base legal exibida: "Legítimo interesse" (padrão do sistema; ver `docs/lgpd.md`, seção 3.1). Origem e data aparecem depois da primeira mudança.
  - **Depois de criar ou editar** o contato, a tela vai para a ficha (e "Abrir contato" do aviso de duplicado também).
- *Commit 5 (Vínculos e aba Contatos da empresa):*
  - **Quem mexe em vínculo:** quem **vê o contato** e **edita a empresa** do vínculo (o vendedor, só a própria carteira; gestor e administrador, todas). Mudar o cargo, o principal ou inativar **não exige editar o contato**, só a empresa. Cada vínculo da ficha traz `editavel`, e o menu "Ações do vínculo" só aparece para quem pode.
  - **Vincular:** só a empresa da carteira de quem vincula (vendedor: a dele). Contato que o vendedor só **vê** (porque a empresa dele "vê todas") pode ser ligado a uma empresa **dele**, e passa a ser editável para ele. Vínculo ativo repetido: 409 `vinculo_ja_existe`; vínculo **inativo** da mesma empresa é **reativado** com o cargo novo (não cria outro).
  - **Inativar:** tira o selo de principal (a tabela não aceita principal inativo), guarda a **data de saída** (`ate`) e o histórico fica; reativar limpa a data e **não** devolve o selo. Só vínculo ativo pode ser principal (400 `vinculo_inativo`). **Não existe excluir vínculo**, só inativar.
  - **Vendedor que inativa o último vínculo ativo:** a tela avisa antes ("o contato sai da sua carteira") e, depois, volta para a lista; a API devolve o contato naquela resposta, mas ele deixa de vê-lo (gestor e administrador continuam vendo, como "Sem empresa").
  - **Aba Contatos da empresa** (visível agora, com o número de ativos): cartões com cargo, "Principal", papel na decisão, "Não quer contato", telefone, e-mail e Ligar, WhatsApp e E-mail; **inativos ficam no fim**, apagados. Botões **Novo contato** (abre o cadastro já com a empresa, `?empresa=`) e **Vincular contato** (busca um contato existente), só para quem edita a empresa.
  - **Auditoria:** vincular, reativar e alterar vínculo gravam `empresa`, `cargo`, `principal` e `ativo` (antes e depois) na auditoria do contato; o Histórico legível (commit 7) mostra isso em português.
- *Commit 6 (Converter sócio em contato):*
  - **Reconciliação pelo nome:** o "Atualizar pela Receita" compara o nome do sócio sem acento nem caixa; o sócio existente é atualizado no lugar (e mantém o contato), o novo entra e o que saiu da Receita é removido, **menos o sócio já convertido**, que fica (sócios são somados, como diz `docs/modelagem_banco.md`).
  - **Quem converte:** quem edita a empresa (o vendedor, só a da carteira dele); empresa que o usuário não vê responde 404. Não há como desfazer a conversão: o contato se inativa pelo vínculo, como qualquer outro.
- *Commit 7 (Histórico do contato):*
  - **Fonte:** a auditoria do contato (`entidade = 'contato'`), no mesmo formato do histórico da empresa (quem, quando, o que mudou, nomes no lugar de ids). Títulos: Contato cadastrado · Criado a partir de sócio · Dados alterados · Consentimento alterado (quando só mudaram as chaves de WhatsApp e e-mail) · Vinculado a *empresa* · Vínculo com *empresa* alterado, inativado ou reativado · Contato excluído.
  - **Quem vê:** quem vê o contato vê o histórico dele, **menos as linhas que citam empresa que o usuário não vê** (o vendedor não descobre a carteira dos outros; o total da paginação também não as conta). Contato que o usuário não vê responde 404.
  - **Abas da ficha do contato:** Resumo e Histórico. Atividades e Oportunidades entram nos Módulos 5 e 6 (decisão aprovada).

### Módulo 4 — Importação de planilha (Excel/CSV) ✅ *concluído e aprovado pelo Ale (15/10/2026; roteiro em `docs/roteiro_teste_modulo4.md`)*
*As correções transversais pedidas depois do teste do Módulo 4 foram **testadas e aprovadas pelo Ale em 15/10/2026**: o **layout** (a página nunca rola; menu e barra do topo fixos; só a área central rola, com conteúdo de até 1440 px centralizado e cabeçalho das colunas grudado; regra em `design_system.md`, "Layout e rolagem"), a **paginação única** de 25, 50 ou 100 linhas, lembrada por tabela, e o **intervalo fixo de 3 s** da Receita na importação.*
*Decidido pelo Ale em 12/10/2026; **substitui** a descrição anterior. Vem depois dos Módulos 1 a 3. Detalhes de regra em `funcionalidades.md` (seção 3, "Importação por planilha").*

- **Tela igual ao mockup** do Claude Design (`prototipo/Importar.dc.html`), com os passos **Enviar arquivo · Mapear colunas · Regras** (novo) **· Prévia · Carteira · Importar · Relatório**, alternância **Empresas / Contatos**, Excel e CSV e o botão **"Baixar modelo"**.
- **Limite: até 10.000 linhas e 10 MB** por arquivo (o mockup diz 5.000; vale este documento).
- **Mapear colunas: fonte dos dados**, uma escolha por importação:
  - **Usar os dados da planilha**;
  - **Buscar tudo na Receita** (basta a coluna CNPJ);
  - **Completar com a Receita só os campos vazios**.
- **Consulta à Minha Receita:** um CNPJ por vez, **no worker**, com intervalo **fixo de 3 s** (decidido pelo Ale em 15/10/2026, depois do teste: a tela e a API não oferecem nem aceitam outro valor; a coluna `importacoes.intervalo_ms`, padrão 3000, é um ajuste interno só por SQL e pelos testes), *retry* em 429 e 5xx e cache em `receita_consultas`. **Progresso visível** na tela.
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
- **Precedência (decidida pelo Ale em 14/10/2026): o bloqueio de empresa não ativa (Configurações → Carteira) vence o perfil.** Com o bloqueio ligado, empresa não ativa na Receita **não entra**, mesmo que o perfil tenha "situação ativa" desligado, mesmo com a ação "importar com a tag Fora do perfil" e mesmo em "Sem regras"; ela aparece no relatório como *pulada: empresa não ativa*, sem a opção "importar mesmo assim". Com o bloqueio desligado, quem decide é o perfil. Implementada em `decidirPelaReceita` (`packages/shared/src/importacao-regras.ts`), com teste.
- **Perfil sem dados de cliente:** nenhum perfil é criado por seed ou por botão. Quem cria é o administrador, colando os códigos no campo de CNAEs (aceita centenas de uma vez). O lote guarda uma **cópia** das regras usadas.
- **CNPJ da planilha:** com ou sem pontuação; número de até 13 dígitos (o Excel perde os zeros à esquerda) é completado a 14 antes de conferir os dígitos verificadores; CPF, texto e notação científica são "sem CNPJ válido" (linha pulada e listada). **CNPJ que já existe na carteira:** a linha é pulada e listada, **sem sobrescrever**.
- **Quem importa:** administrador e gestor (o vendedor não vê o botão e a API recusa com 403). *Decisão do Claude, a confirmar com o Ale.*
- **Execução em blocos curtos (decidida pelo Ale em 15/10/2026, depois de o encerramento gracioso do worker se mostrar frágil com a máquina carregada).** A importação não é mais um job longo: cada job processa **um bloco de até 25 linhas ou 90 s** (o que vier primeiro), respeitando o intervalo da Receita, e agenda o próximo. Quem manda é o banco, não o job: o progresso fica nas linhas (`importacao_linhas`), o intervalo e as esperas em `importacoes.proxima_consulta_em` e o último avanço em `ultimo_progresso_em`. **Idempotência por linha:** a Receita é consultada fora de transação (o cache de 30 dias torna a repetição inofensiva); depois uma transação de milissegundos trava a linha (`FOR UPDATE SKIP LOCKED`), confere se ainda está pendente e grava empresa e resultado juntos. Dois executores no mesmo lote, ou um bloco repetido, nunca duplicam empresa nem perdem linha; o índice único `empresas_documento_uq` continua como barreira final, e a empresa que o próprio lote já criou vale como *criada*, não como repetida. **Recuperação:** job parado volta pelo mecanismo do BullMQ e, como rede de segurança, uma **varredura a cada minuto** reenfileira o lote em andamento, com linha pendente, **sem progresso e sem espera programada há mais de 2 minutos**; quem espera de propósito (intervalo, Receita fora do ar) só conta como parado depois de passada a espera mais a margem, e o id do job (lote + origem + número do bloco) não deixa a varredura criar job duplicado. Encerrar o worker (deploy) fecha o bloco na linha em curso e o seguinte é retomado por outro worker. Sem variável nova no Coolify.
- **Relatório, "importar mesmo assim" e desfazer (decididos na implementação, dentro do plano aprovado; o Ale vê o resultado na tela).**
  - **Relatório** (`GET /v1/importacao/lotes/:id/linhas`, filtro por resultado e página de 50): cada linha com o resultado, o motivo em português e o nome da empresa criada. **CSV do que não entrou** (`problemas.csv`: `;`, UTF-8 com BOM, texto que começa com `=`, `+`, `-` ou `@` vira texto para não virar fórmula no Excel), para corrigir e reimportar. Lista de lotes em `/importacao` (`GET /v1/importacao/lotes`).
  - **Importar mesmo assim** (`POST .../importar-fora-do-perfil`): só em lote `concluida`; as linhas escolhidas (ou todas as fora do perfil) voltam a `pendente` e o worker as cadastra com a tag "Fora do perfil". O bloqueio de empresa não ativa continua valendo. **A decisão fica na linha** (`importacao_linhas.motivo = 'importar_mesmo_assim'` enquanto pendente), no banco, e não no evento nem no job: sobrevive a retomada, varredura e troca de worker, e dispensa coluna nova.
  - **Desfazer** (`POST .../desfazer`; **regras decididas pelo Ale em 15/10/2026**): vale para lote `concluida` **e** `cancelada`, **até 7 dias** depois de terminar (a conclusão; no cancelado, a última linha resolvida). **O prazo mora numa constante só, `DIAS_PARA_DESFAZER`, em `packages/shared/src/importacao.ts`**: mudar o número muda a API, as telas e as mensagens. Tira da carteira, por exclusão lógica **como a manual** (vínculos de contato inativos e filiais soltas da matriz), **só as empresas que o lote criou e que ninguém alterou depois**. **Ficam** (e o resultado avisa quantas e quais, com "Ficou na carteira" no relatório) as que tiveram **qualquer registro de auditoria além da criação** (editar, tags, atualizar pela Receita) ou que têm **contato vinculado**; a que já estava na carteira antes nunca é tocada. O lote vira `desfeita`, as linhas e o relatório ficam, e um lote desfeito não volta nem aceita "importar mesmo assim". Passado o prazo: 409 `prazo_de_desfazer_vencido`. **Atividades contam como "alteração" desde o Módulo 5** (a empresa com qualquer atividade, mesmo já excluída, fica na carteira; com teste); **as oportunidades entram junto do Módulo 6** (mesma regra da tabela de exclusão de cadastros do Módulo 1). Risco conhecido: um cancelamento seguido de desfazer no mesmo instante pode deixar passar a empresa da linha que já estava em gravação (janela de milissegundos).
  - **Telas** (`/importacao/nova`, `/importacao/:id`, `/importacao`): os passos Enviar arquivo · Mapear colunas · Regras · Prévia · Carteira · Importar · Relatório, o assistente segue a situação do lote ao abrir o link de novo e só administrador e gestor entram. Botão "Importar planilha" na lista de Empresas. **Fora do Módulo 4:** atualizar a empresa que já existe, duplicado por nome ou telefone, relatório completo em Excel e notificação de conclusão (tabela em `roteiro_teste_modulo4.md`). **Importação de contatos por planilha (antes chamada Módulo 4b): foi para o pós-MVP** (decidido pelo Ale em 15/10/2026, depois do teste das empresas); o reaproveitamento do assistente fica registrado na tabela "Fora do MVP".
- **Deduplicação por CNPJ dentro do tenant.**
- Os **perfis serão reaproveitados na Prospecção**.

### Módulo 5 — Atividades ✅ *concluído e aprovado pelo Ale (16/10/2026; roteiro em `docs/roteiro_teste_modulo5.md`; plano aprovado em 15/10/2026, com as 7 decisões recomendadas)*
Formulário **Registrar atividade** (protótipo), situação, resultado, importante/urgente, **efeito na carteira** (tags Visitada/Contactada, última visita e último contato), **"Registrar e agendar próxima"**, atrasadas e linha do tempo na ficha.

**Entregue (commits na `main`; esteira verde até o verify):** `2245dcc` migração 0023 (tabela `atividades`, RLS, fuso da empresa, FK da próxima atividade) · `54c4380` schemas e regras de fuso, atraso e data no futuro · `a735a1e` API (registrar, listar com abas, editar, concluir, cancelar, excluir) com o efeito na carteira e o desfazer da importação · `4114f37` ajuste do teste da lista de empresas (a FK exige atividade real) · `e9d5b60` formulário Registrar atividade e abas nas fichas · `6a31003` tela Atividades, menu, E2E, roteiro e docs · `ce35a89` e o commit seguinte: campo de busca da empresa (ver abaixo).
- **Telas:** formulário **Registrar/Editar atividade** (janela no computador, folha no celular), abertura pelo botão da barra do topo, pelo "+" do cabeçalho do celular e por "Nova atividade" nas fichas; **Concluir** (resultado obrigatório, "Concluir e agendar próxima"), **Cancelar** e **Excluir** pelo menu ⋯ de cada atividade; tela **Atividades** (abas Agendadas, Atrasadas e Realizadas com contagem, busca, tipo, "Só as minhas", paginação 25/50/100 lembrada na tabela `atividades`); aba **Atividades** nas fichas da empresa e do contato (paginação lembrada à parte, em `atividades_ficha`); botão "Atividade" ao lado de Ligar, WhatsApp e Rota na ficha da empresa no celular.
- **Campo de busca da empresa no formulário (decidido pelo Ale em 16/10/2026, depois do primeiro teste):** a empresa se escolhe num **campo de pesquisa** (nome, razão social, CNPJ/CPF ou cidade, com ou sem máscara), no servidor, pelo mesmo índice da lista de Empresas. **Os resultados só aparecem depois de digitar** (ao abrir a janela não há lista) e abrem como **uma camada sobre os campos de baixo: a janela não muda de tamanho**. Escolhida a empresa, o campo vira o nome com **Trocar empresa**. A primeira versão usava uma lista suspensa (popover) que abria atrás da janela e parecia travada; a segunda mostrava a lista aberta e empurrava o conteúdo. Regra geral no `design_system.md` ("Escolha de registro em diálogo").
- **Testes:** 23 da API (efeito na carteira, tags, datas, fuso 22h × 00h30, permissões, isolamento entre empresas, auditoria), restrições e RLS no banco, 19 de tela do módulo e 3 E2E (`apps/web/e2e/atividades.spec.ts`, inclusive a busca por nome e por documento e a janela sem mudar de tamanho).

**Decisões do Ale (15/10/2026)**
1. **Um contato por atividade** (`contato_id`); a tabela N:N de participantes fica para depois.
2. **Atividade realizada não pode ter data no futuro**, com **tolerância de 5 minutos** (celular com o relógio adiantado). Constante `TOLERANCIA_RELOGIO_MINUTOS` em `packages/shared/src/atividades.ts`; erro `atividade_no_futuro`.
3. **Editar, cancelar ou excluir** uma atividade realizada **recalcula** última visita, último contato e próxima atividade; a **tag automática (Visitada ou Contactada) só sai se não restar nenhuma atividade realizada daquele tipo**.
4. O item **"Tarefas" do menu vira "Atividades"**, com a lista e as abas **Agendadas, Atrasadas e Realizadas**.
5. **"Registrar e agendar próxima"** reabre o formulário com a mesma empresa, o mesmo tipo e o mesmo contato, data vazia e situação Pendente.
6. A coluna **`origem`** entra agora (padrão `manual`); `id_externo` e check-in ficam para depois.
7. No formulário, situação padrão **Realizada** (Pendente vindo de "agendar próxima") e **responsável padrão = usuário logado**.
- **Fuso horário:** "hoje", "atrasada", "dia inteiro" e os agrupamentos por dia valem no fuso da empresa (`tenant_configuracoes.fuso_horario`, padrão `America/Sao_Paulo`), **nunca em UTC**; testado com atividades às 22h e às 00h30.
- **Visita conta como contato:** uma visita realizada atualiza `ultima_visita_em` **e** `ultimo_contato_em` (`funcionalidades.md`, "Campos calculados": último contato = última atividade concluída de tipo Contato **ou visita**). **As tags seguem o tipo**: visita aplica **Visitada**; ligação, WhatsApp, e-mail e reunião aplicam **Contactada** (a visita sozinha não aplica Contactada).

**Decisões do Claude na implementação** (dentro do plano aprovado; o Ale vê o resultado na tela)
- **Data de uma atividade realizada** é **quando aconteceu** (`realizada_em`) e é ela que vale para última visita e último contato. Registrar algo que já foi feito grava `data_inicio = realizada_em`; **concluir** uma agendada grava `realizada_em` (padrão: agora) e mantém `data_inicio` (a data planejada). Editar a data de uma realizada muda as duas.
- **Próxima atividade** da empresa = a **aberta** (pendente ou em execução) de **menor data**, inclusive uma atrasada (a lista a destaca em vermelho). Tarefa com empresa também conta.
- **Atrasada** (calculada, nunca gravada): aberta com a data passada; a de **dia inteiro** só atrasa quando o dia termina no fuso da empresa.
- **Cancelar** vale para atividade aberta e para realizada (a realizada deixa de contar; o resultado fica guardado); **cancelada não se edita** nem volta. **Excluir** é lógico (`excluido_em`).
- **Quem vê e quem edita:** admin e gestor, tudo. O vendedor vê a atividade da empresa que ele vê e edita a da própria carteira; **atribui atividade só a si mesmo**. A **Tarefa sem empresa** só o responsável, o gestor e o administrador veem.
- **Contato** precisa ter vínculo ativo com a empresa da atividade; trocar de empresa sem dizer o contato tira o contato.
- **Desfazer importação:** empresa com qualquer atividade fica na carteira.
- **Fora do Módulo 5, para depois do MVP:** registrado na tabela da seção 3 ("Fora do MVP"), na linha de cada item, e em `roteiro_teste_modulo5.md`. A tela do formulário **não tem** o bloco "Mais opções" do desenho com Oportunidade, Lembrete e Repetir (só o Responsável, para administrador e gestor).

### Módulo 6 — Oportunidades ✅ *concluído e aprovado pelo Ale (16/10/2026; roteiro em `docs/roteiro_teste_modulo6.md`; plano aprovado em 16/10/2026)*
**Kanban por funil**, arrastar entre fases, **diálogo de fechamento** (Conquistado/Perdido/Cancelado/Suspenso, motivo, *retomar em*, empresa vira Cliente), **valores digitados** (único, mensal, total), probabilidade sugerida pela etapa, histórico de fases e lista simples.
**Entregue (commits na `main`; esteira verde até o verify):** `72102c8` migração 0024 (`oportunidades`, `oportunidade_historico`, `atividades.oportunidade_id`, RLS, total e ponderado gerados pelo banco) · `1e5d231` schemas compartilhados · `116d11a` API (cadastro, mover, fechar, reabrir, excluir, Kanban, lista) e regra de fase e funil · `fd34da6` ajuste das fixtures da web e do "vira Cliente" padrão na oportunidade · `9485aad` coluna "Em aberto" da lista de Empresas · `629af85` Kanban com arrastar e soltar, lista, fechamento, formulário, ficha, aba na empresa, oportunidade na atividade e inativar fase · e o commit do grupo 3 (E2E, roteiro e docs).
- **Telas:** `/oportunidades` com **Kanban | Lista** (resumo, funil, responsável, busca, "Suspensas · N"), card (valor total e mensal, previsão, próxima atividade, alerta de parada), **arrastar pela alça** (mouse, toque e teclado) e zonas de fechamento; **Fechar oportunidade**; **Nova/Editar oportunidade** (empresa por campo de pesquisa; total e ponderado na hora); **ficha** (dados, atividades, histórico); aba **Oportunidades** na ficha da empresa; coluna **Em aberto** na lista de Empresas; campo **Oportunidade** no formulário de atividade; **Inativar/Reativar fase** em Configurações → Funis.
- **Testes:** 26 da API (valores, probabilidade, mover, fechar, retomada, "Associado" pela chave, permissões, Kanban, alerta de parada, regra de fase e funil, isolamento, auditoria, "Em aberto"), 5 do banco (restrições e colunas calculadas), 6 dos schemas, 28 de tela do módulo (Kanban, fechar, formulário, ficha, funis) e 2 E2E (`apps/web/e2e/oportunidades.spec.ts`, com arrastar de verdade pelo mouse e pelo teclado).

**Decisões do Ale (16/10/2026), ao aprovar o plano**
1. **Arrastar e soltar com `@dnd-kit`** (teclado e toque); no celular continua também o menu do card.
2. **Fora do MVP:** itens e catálogo de produtos, campos personalizados e filtros salvos.
3. **Valores:** a pessoa digita **valor único**, **valor mensal** e **meses** (coluna `meses`, inteiro ≥ 0; padrão 12 quando há valor mensal). O **total é calculado** (`único + mensal × meses`), no banco (coluna gerada): nunca digitado. **Ponderado** = total × probabilidade (também coluna gerada). A coluna **"Em aberto"** da lista de Empresas = soma do total das oportunidades ativas da empresa. Dinheiro em `numeric(15,2)`.
4. **Probabilidade:** começa com a da fase e é editável. Ao mover de fase assume a da nova fase **a menos que tenha sido editada à mão** (marca `probabilidade_manual` na oportunidade); nesse caso mantém e mostra aviso com a sugestão.
5. **Data prevista de fechamento é opcional:** sem data aparece como "sem previsão" e fica fora da previsão do mês (Módulo 7).
6. **Vendedor** cria, edita e move só nas empresas da própria carteira; admin e gestor, em todas.
7. **Reabrir** uma Conquistada **não desfaz** o "empresa vira Cliente"; fica só o registro no histórico.
- **"Empresa vira Cliente"** ao conquistar: a tag é achada pela **`chave_sistema = 'cliente'`**, nunca pelo nome (na empresa do Ale ela se chama "Associado").
- **Excluir** oportunidade: só exclusão lógica, só admin e gestor.
- **Suspenso:** a atividade de retomada é criada **na data "retomar em"**, com a mesma empresa e o mesmo responsável (implementada como **Tarefa de dia inteiro**, ligada à oportunidade; reabrir ou excluir a oportunidade cancela a que estiver aberta). "Retomar em" é obrigatório no Suspenso e não pode ser no passado (no fuso da empresa).
- **Layout:** o Kanban rola na horizontal **dentro da área do quadro** quando as colunas não cabem, sem rolagem horizontal na página; a Lista usa a paginação 25/50/100.

**Decisões do Claude na implementação** (dentro do plano aprovado)
- **Status:** Ativo, Conquistado, Perdido, Cancelado e Suspenso; só uma Ativa muda de fase ou se fecha (409 `oportunidade_nao_ativa`); para mudar de um fechamento para outro, reabre-se antes.
- **Fase em que parou** = a fase atual no instante do fechamento (`fase_parou_em_id`), preenchida se e somente se o status não é Ativo; vale também para Suspenso. **Data de fechamento** é gravada ao sair de Ativo (inclusive no Suspenso).
- **Fases inativas:** `ativo` entra nas fases (o Kanban e as escolhas só mostram as ativas). Fase com oportunidades **ativas** não se inativa nem se exclui (409 `fase_com_oportunidades_ativas`); fase que **já teve** oportunidade (atual, "em que parou" ou no histórico) **só se inativa** (409 `fase_ja_usada`); o funil precisa de uma fase ativa (409 `ultima_fase`). Funil com oportunidades ativas não se inativa (409 `funil_com_oportunidades_ativas`) e funil que já teve oportunidade **só se inativa** (409 `funil_ja_usado`).
- **Mover** só dentro do mesmo funil (mudar de funil: depois do MVP).
- **Alerta de parada:** dias desde o maior entre a entrada na fase e a última atividade realizada ligada à oportunidade; passou do "dias para alerta" da fase, o card é destacado.
- **Kanban:** cada coluna traz até 100 oportunidades (o resto é contado em "e mais N"); ordem por data prevista (sem previsão por último) e depois a mais nova.
- **Atividade** ganha a **oportunidade** (campo opcional, só as da mesma empresa); a oportunidade guarda a última atividade realizada e a próxima atividade aberta.

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
| ~~Atividade: oportunidade vinculada~~ | **Entregue no Módulo 6**: `atividades.oportunidade_id` e o campo "Oportunidade" em "Mais opções" do formulário |
| Oportunidade: itens e catálogo de produtos e serviços | Decisão do Ale (16/10/2026): o MVP usa valores digitados (único, mensal e meses); `oportunidade_itens`, `produtos` e `valor_manual` seguem só na modelagem |
| Oportunidade: campos personalizados (`campos_extras`) e filtros salvos | Decisão do Ale (16/10/2026): fora do MVP |
| Oportunidade: exportação da lista | Fora do MVP (a exportação em geral) |
| Oportunidade: mudar de funil | Só se move de fase dentro do funil; trocar de funil fica para depois |
| Oportunidade: mais de um contato | Só o contato principal; os outros (`oportunidade_contatos`) ficam para depois |
| Oportunidade: previsão do mês, conquistadas × perdidas e motivos de perda | Módulo 7 (Dashboard) |
| Oportunidade: e-mail e WhatsApp, comentários e notificação de parada | Fases de integração e central de notificações |
| Oportunidade: acima de 100 cards por coluna no Kanban | O quadro traz 100 por fase e avisa "e mais N"; a busca e a Lista alcançam o resto |
| Oportunidade: probabilidade 100% ao conquistar | Não pedido; a conquistada guarda a probabilidade que tinha |
| Atividade: vários contatos (tabela `atividade_contatos`) | Decisão do Ale em 15/10/2026: um contato por atividade (`contato_id`); o N:N fica para depois do MVP |
| Atividade: lembretes ("Notificar em"), recorrência ("Repetir"), checklist, etiquetas e anexos | Dependem da central de notificações, do worker e do Kanban de Tarefas; as tabelas `atividade_lembretes`, `atividade_recorrencias`, `atividade_checklist` e `atividade_etiquetas` seguem só na modelagem |
| Atividade: `id_externo` e check-in com GPS | Adiados pelo Ale em 15/10/2026 (WhatsApp, e-mail, agenda e visita com localização); `origem` já existe, com padrão `manual` |
| Atividade: situação "Em execução" na tela | Existe no banco e na API; a tela usa Realizada, Pendente e Cancelada |
| Atividade: reabrir cancelada ou realizada | Não pedido; para refazer, registra-se outra atividade |
| Atividade: validade da tag de visita (`dias_validade_tag_visita`) | Opcional na regra, sem tela de configuração; hoje a tag só sai quando não resta atividade realizada do tipo |
| Atividade: fuso da empresa editável pela tela | O fuso é `America/Sao_Paulo` (`tenant_configuracoes.fuso_horario`); a tela de escolha vem quando houver empresa em outro fuso |
| Atividade: fuso do aparelho × fuso da empresa nas telas | As datas aparecem no fuso do aparelho; "hoje" e "atrasada" são do servidor, no fuso da empresa. Mostrar tudo no fuso da empresa fica para quando houver mais de um |
| Atividade: "Próxima atividade" em vermelho nas listas de Empresas e fichas | A API informa a data; a tela da lista e da ficha não destaca a atrasada (a tela Atividades destaca) |
| Atividade: aviso na empresa de que há atividade atrasada, e notificação de atraso | Central de notificações fora do MVP |
| Atividade: criação de atividade em lote e exportação | Não pedido |
| Atividade: ações em massa na tela Atividades (concluir, cancelar, transferir) | Não pedido; vem junto com a visão de Equipe |
| Atividades no Histórico da empresa | O Histórico mostra as tags aplicadas pelo sistema; cada atividade tem linha própria na aba Atividades |
| Conclusão rápida no Dashboard e "Minhas atividades" | Módulo 7 (Dashboard) |
| Central de notificações e push | Um usuário só; o Dashboard mostra o que está atrasado |
| Filtros salvos personalizados | Os chips fixos da lista de Empresas bastam |
| Visão Equipe e transferência de carteira | Só há um usuário |
| Painel consolidado | Só há uma empresa em uso |
| Copiar configurações entre empresas | Só há uma empresa em uso |
| Offline | Complexidade alta; o PWA exige conexão no MVP |
| Atualização campo a campo pela Receita e rotina mensal | A consulta inicial e o enriquecimento da importação cobrem o MVP |
| Faixas de funcionários e de faturamento (cadastros e campos na empresa) | Decidido em 12/10/2026: não entram no MVP; a empresa não tem esses campos até uma fase posterior (`faixas_*` ficam só na modelagem) |
| Importação de contatos por planilha (ex-Módulo 4b) | Decidido em 15/10/2026, depois do teste do Módulo 4: o contato entra pela ficha e pela conversão de sócio. Quando vier, reaproveita o assistente do Módulo 4 (enviar, mapear, prévia, carteira, importar, relatório e desfazer), ligando o contato à empresa pelo CNPJ ou pelo nome; o envio recusa `tipo` diferente de empresas até lá |
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
