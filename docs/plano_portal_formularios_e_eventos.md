# Plano do Portal do Cliente, Fase 4: construtor de formulários, eventos e ajustes

> **Status:** proposta para aprovação do Ale (31/10/2026). Nada implementado ainda.
> **Base:** pedido do Ale (construtor de formulários, 23 itens de backend e 8 de frontend) e o portal já entregue nas fases 3A a 3E (`plano_portal_cliente.md`).
> **Regras que valem para todas as fases:** português, uuid v7, `tenant_id`, RLS habilitado e forçado, políticas restritivas do portal (`app.portal_empresa_id`, `app.portal_acesso_id`), teste de isolamento entre tenants **e** entre empresas-clientes do mesmo tenant, migração só de expansão (próxima livre: **0045**), DTOs do portal em lista de permissão, auditoria com ator `contato`, gate `pnpm lint && pnpm typecheck && pnpm test` antes de cada commit.

## 0. Como ler este plano

Cada pedido recebeu um código: **FB-n** (construtor de formulários), **B-n** (backend, numeração do pedido) e **F-n** (frontend, numeração do pedido). A seção 1 mostra em que fase cada um entra; as seções 3 a 11 detalham cada fase; a seção 12 traz as perguntas que dependem do Ale. Onde há recomendação, ela já está escrita como decisão proposta (**R-n**).

O que o diagnóstico do código já mostrou:

| Item | O que existe hoje | Causa / ponto de partida |
|---|---|---|
| B-2 | `apps/web/src/telas/portal/hub.tsx`: `aba = verHub ? 'chamados' : 'publicacoes'` | Troca de uma linha (e o teste do hub) |
| B-6 | Enum `tipo_reacao_publicacao` = curtir, **apoiar**, parabéns | Tirar "Apoiar" da tela e da API; o valor do enum fica (contrair depois) |
| B-7 | `publicacoes.service.ts → metricas()`: o **alvo** conta só acessos `ativo` e não excluídos; os **leitores** contam qualquer `acesso_id` de `publicacao_leituras` (inclusive acessos revogados, de empresas que saíram do alcance ou que deixaram de ser associadas) | Numerador e denominador em conjuntos diferentes: passa de 100% |
| B-10 | A nota de `chamado_avaliacoes` só entra na **média** dos indicadores do hub (`portal-hub.service.ts`) | Nenhuma tela mostra a nota de um chamado |
| B-23 | Entrada por **link mágico** de 15 min (`portal-entrada.service.ts`, `portal_links`) | Trocar por código de 6 dígitos |
| B-1 | `app_portal_acessos_por_email()` já acha todos os acessos do e-mail e manda **um link por acesso** | Falta a escolha da empresa e a troca dentro do portal |
| F-5 | Aba "Meu perfil" permite o cliente **trocar o próprio e-mail** (`trocarEmail`, link `troca_email`) | Precisa travar e-mail e telefone |
| F-7 | `packages/ui/src/tabs.tsx` já esconde a barra com `overflow-x-auto` + `scrollbar-width:none` | Aparece em algum navegador/casca do portal: reproduzir e corrigir na casca |
| F-8 | `tokens.css` já tem o tema escuro (`data-theme="dark"` ou preferência do sistema) | Falta o seletor e guardar a escolha |
| B-17 | Consulta à Receita (`apps/api/src/receita`), atividades com tipo Tarefa sem empresa obrigatória | Reaproveitar o fluxo normal de cadastro de empresa |
| FB-2 | Webhooks de saída já existem (outbox + worker BullMQ com HMAC, `apps/api/src/integracoes/webhooks`) e fila de e-mail (`apps/api/src/email`) | As ações dos botões usam essas duas filas |
| B-9/12/22 | Tags de contato em grupos próprios (`contato_tags`, `aplica_a = 'contato'`, migração 0043) | Base da segmentação por tag |
| "Associado" | Empresa com a tag de Status `chave_sistema = 'cliente'` (`funcionalidades.md`, seção do status de cobrança) | Base do alcance (B-7) e do "só associado" (B-19) |

## 1. Fases

| Fase | Entrega | Itens | Migração |
|---|---|---|---|
| **4A** | Ajustes rápidos do hub e do portal | B-2, B-4, B-5, B-6, B-7, B-10, B-14, F-5, F-6, F-7, F-8 | 0045 (pequena) |
| **4B** | Acesso por código de 6 dígitos e várias empresas | B-23, B-1 | 0046 |
| **4C** | Segmentação por tags de contato | B-9, B-12, B-22 | 0047 |
| **4D** | Imagem e vídeo nas publicações | B-3 | 0048 |
| **4E** | **Construtor de formulários** (núcleo) | FB-1, FB-2, FB-3, FB-4 | 0049 |
| **4F** | Pesquisa de satisfação do chamado | B-11 (e fecha B-10) | 0050 |
| **4G** | Eventos 2.0: inscrição por formulário, público/associado, CRM, QR, presença, avaliação | B-8, B-13, B-15, B-16, B-17, B-18, B-19, B-20, B-21, F-1, F-2 | 0051 e 0052 |
| **4H** | Página pública de eventos e "Seja um Associado" | F-3, F-4 | 0053 |

**Ordem e dependências:** 4A não depende de nada (valor imediato, risco baixo). 4B mexe na segurança da entrada e deve vir cedo porque o PWA instalado sofre com o link mágico. 4C cria a "audiência" que 4D, 4G e 4H reaproveitam. 4E é o pré-requisito de 4F, 4G e 4H. Cada fase termina em portão, como na Fase 3: gate verde, CI verde, **Backup Now**, deploy, roteiro de teste (`docs/roteiro_teste_portal_4x.md`) e aceite do Ale.

**Permissões (catálogo hoje na v11):** v12 (4E) `portal.formularios`; v13 (4G) `portal.eventos_presenca` (check-in manual e QR) e `portal.eventos_relatorios` (exportar inscritos). Só o Administrador recebe; o Gestor não herda o prefixo `portal.`.

## 2. Decisões propostas (para aprovação)

| # | Proposta |
|---|---|
| R-1 | **Alcance (B-7)** = pessoas **distintas** que leram ÷ pessoas que **podem** ler. As duas contas usam o **mesmo conjunto**: acessos ativos de empresas **associadas** dentro do alcance da publicação (todos, empresas ou tags). Leitura de quem está fora do conjunto não conta. Resultado nunca passa de 100%. Mostrar também o número bruto ("38 de 120 pessoas") |
| R-2 | **Reações (B-6):** só **Curtir** e **Parabéns**, mais comentários. "Apoiar" some da tela e a API passa a recusar; os totais antigos ficam no banco e o valor do enum sai numa contração futura |
| R-3 | **Entrada por código (B-23):** 6 dígitos numéricos, **10 minutos**, uso único, só o hash no banco, **5 tentativas** por código e limite por IP/e-mail (o que já existe). A resposta ao pedir o código continua **sempre a mesma**. O convite continua por link (é o primeiro contato e carrega a empresa); a troca de e-mail deixa de existir para o cliente (F-5) |
| R-4 | **Várias empresas (B-1):** um código vale para o **e-mail**, não para um acesso. Depois do código, se houver mais de um acesso ativo, a tela "Escolha a empresa" lista as opções. Dentro do portal, o seletor no cabeçalho troca de empresa **sem pedir código de novo** (a sessão guarda o e-mail verificado e troca o `acesso_id`), sempre conferindo no banco que aquele e-mail tem acesso ativo à empresa escolhida |
| R-5 | **Audiência única (4C):** publicações, eventos, documentos e avisos passam a ter o mesmo alcance: **todos**, **empresas** ou **tags de contato** (com várias tags, basta ter **uma** delas). A tag é do contato ligado ao acesso, conferida no momento da leitura (tirar a tag tira a visibilidade) |
| R-6 | **Vídeo (B-3):** só por link de **YouTube** e **Vimeo** (embed `youtube-nocookie.com` e `player.vimeo.com`), nada de `<iframe>` livre nem envio de arquivo de vídeo. Imagem: até 4 por publicação, JPG/PNG/WebP, 10 MB, mesmo pipeline e ClamAV dos anexos, com miniatura gerada no worker |
| R-7 | **Formulário = definição em JSON versionada.** Toda resposta guarda a **versão** com que foi preenchida, então editar um formulário nunca quebra respostas antigas nem relatórios |
| R-8 | **Ações dos botões (FB-2)** rodam **no servidor**, depois de gravar a resposta, pelo outbox (webhook com HMAC e e-mail pela fila). O navegador nunca chama o webhook. Falha na ação não perde a resposta: fica no log com nova tentativa |
| R-9 | **Evento vira publicação (B-8):** ao publicar um evento, nasce uma publicação ligada a ele (mesmo alcance, cartão com data, local e botão "Inscrever-se"). Editar o evento atualiza a publicação; cancelar o evento marca a publicação como "Evento cancelado". O quadro "Próximos eventos" do portal continua |
| R-10 | **Participante sem acesso ao portal (B-15, B-17, F-3):** a inscrição deixa de exigir `acesso_id`. A participação passa a guardar nome, e-mail, telefone, CNPJ e os vínculos opcionais (acesso, contato, empresa) |
| R-11 | **QR de check-in (B-18):** um QR **por evento**, que só a equipe vê e projeta na recepção. O participante lê com o celular e cai na página de check-in: logado no portal, um toque; sem login, informa o e-mail da inscrição e recebe o código de 6 dígitos. O QR só funciona da abertura do check-in (padrão: 2 h antes) até o fim do evento, e pode ser **regerado** (o antigo para de funcionar) |
| R-12 | **CNPJ no formulário (B-17):** só quando o formulário do evento tiver um campo do tipo **CNPJ**. Empresa existente: liga a participação. CNPJ novo: cadastra a empresa pela consulta normal à Receita (status inicial **Lead**), cria/acha o contato pelo e-mail e cria uma **Tarefa para o dia útil seguinte**. O trabalho roda no worker (a Receita pode demorar ou falhar; refaz com espera) |
| R-13 | **E-mail de avaliação para quem não é cadastrado (B-15):** chave por tenant em Configurações → Portal ("Enviar a avaliação por e-mail a participantes sem acesso ao portal"), **desligada por padrão**. O link é pessoal (token por participante, uso único para responder) |

## 3. Fase 4A: ajustes rápidos

**B-2. Aba inicial = Publicações.** `hub.tsx`: a aba padrão passa a ser `publicacoes` para todos; quem não tem `portal.publicar` cai na primeira aba que pode ver. Guardar a aba na URL (`?aba=`) para o voltar do navegador funcionar.

**B-4. Duplicar publicação.** `POST /v1/portal-gestao/publicacoes/:id/duplicar`: copia título ("Cópia de …"), corpo, alcance (empresas e tags) e mídia (4D); nasce **rascunho**, não fixada, sem reações, comentários nem leituras. Menu "⋯ → Duplicar" na lista e no editor. Teste: a cópia é do mesmo tenant e não leva métricas.

**B-5. Paginação das publicações.** A lista do hub ordena por `coalesce(publicada_em, agendada_para, criado_em) DESC` (mais recente primeiro), com seletor **5, 10, 20** (padrão 10) e o componente de paginação do design system. O tamanho escolhido fica no `localStorage`. A API já recebe `limite`/`pagina`; validar no Zod `limite ∈ {5,10,20}`.

**B-6. Só Curtir e Parabéns.** Zod de reação aceita `curtir | parabens`; portal e hub deixam de mostrar "Apoiar". Migração não é necessária agora (R-2).

**B-7. Alcance correto.** Reescrever `metricas()` com um único CTE `pode_ler` (acessos ativos, não excluídos, de empresas associadas, dentro do alcance) e contar `leitores` como `count(DISTINCT l.acesso_id) FILTER (WHERE l.acesso_id IN pode_ler)`. Na tela: "38%  ·  38 de 120 associados". Testes: leitura de acesso revogado não conta; empresa que saiu do alcance não conta; nunca > 100%. Atualizar `funcionalidades.md` com a definição.

**B-10 (parte 1). Estrelas da avaliação.** Mostrar a nota (1 a 5 estrelas) e o comentário: (1) no detalhe do chamado no CRM (cartão "Avaliação do cliente"); (2) coluna "Nota" na lista de chamados do hub, com filtro "com nota ≤ 2"; (3) no portal, no próprio chamado ("Sua avaliação"). A API dos chamados passa a devolver `avaliacao: { nota, comentario, avaliadoEm } | null`. A pesquisa completa vem na 4F.

**B-14. Paginação da Agenda.** Mesma regra da B-5 na aba Agenda do hub (5, 10, 20), ordenada por `inicio_em` (próximos primeiro; filtro "Passados" ordena do mais recente para o mais antigo).

**F-5. Meu perfil.** Mostra os dados do cadastro do contato: nome, cargo, área, e-mails, telefones, data de nascimento (se houver), foto. **E-mail e telefone travados**, com a frase "Para alterar, fale com a equipe" (e atalho para abrir chamado). Remover a troca de e-mail do portal (rota `POST /v1/portal/sessao/trocar-email` passa a responder 403 e sai na contração). Campos que o cliente pode editar: ver pergunta Q-6.

**F-6. Minha empresa.** Cadastro completo, **somente leitura**: razão social, nome fantasia, CNPJ, situação, endereço, telefones, e-mails, CNAE principal, porte, responsável na equipe (só primeiro nome). DTO próprio em lista de permissão (nada de campos internos: carteira, oportunidades, notas, tags internas).

**F-7. Barra de rolagem nas abas.** Reproduzir no Playwright (Chromium, desktop e celular, portal e hub). Correção provável: o `TabsList` estoura a altura da linha (foco/borda), gerando rolagem vertical na casca; garantir `overflow-y: hidden` no contêiner e `min-height` do item, e no celular quebrar as abas em rolagem horizontal **sem barra** com sombra indicando que há mais. Teste E2E: `scrollHeight === clientHeight` na barra de abas.

**F-8. Tema claro, escuro ou sistema.** Seletor no menu do usuário (CRM e portal): **Claro / Escuro / Sistema** (padrão Sistema). Grava em `localStorage` e aplica `data-theme` no `<html>` **antes** da primeira pintura (script inline no `index.html`, liberado na CSP por hash) para não piscar. No portal, também guarda em `portal_preferencias.tema` para seguir a pessoa entre aparelhos. Conferir o contraste das telas do portal no escuro (teste de design system).

**Migração 0045:** `portal_preferencias.tema varchar(10) NOT NULL DEFAULT 'sistema'` (check `claro|escuro|sistema`).

## 4. Fase 4B: código de 6 dígitos e várias empresas

**B-23. Código por e-mail.**
- Tabela nova `portal_codigos` (0046): `id`, `email citext`, `codigo_hash`, `expira_em`, `tentativas smallint`, `usado_em`, `ip inet`, colunas padrão. Fica **fora** do RLS por tenant (o e-mail pode estar em vários tenants), protegida como `portal_links`: só funções `SECURITY DEFINER` mexem nela.
- Fluxo: `POST /v1/portal/entrada/codigo {email}` → sempre 202; se houver acessos ativos, envia o e-mail "Seu código de acesso: 123 456" (válido 10 min). `POST /v1/portal/entrada/verificar {email, codigo}` → confere o hash em tempo constante, conta tentativas (5 e queima), consome e devolve a lista de empresas (ou cria a sessão direto se houver só uma).
- Tela: e-mail → código (6 caixas, `inputmode="numeric"`, `autocomplete="one-time-code"`, colar funciona, "Reenviar" após 60 s). 2FA por aplicativo continua depois do código para quem tem.
- O link mágico de entrada sai da tela; a rota fica respondendo por 30 dias (e-mails já enviados) e sai na contração.

**B-1. Escolher e trocar de empresa.**
- A sessão (`portal_sessoes`) ganha `email_verificado citext` (0046). Tela "Escolha a empresa" com nome, CNPJ e nome do portal de cada acesso. Acessos de **tenants diferentes** aparecem juntos (com o nome do portal de cada um).
- `GET /v1/portal/sessao/empresas` e `POST /v1/portal/sessao/trocar-empresa {acessoId}`: confere pela função `SECURITY DEFINER` que o acesso é do mesmo e-mail e está ativo; troca o `acesso_id` da sessão (e o tenant), registra na auditoria, recarrega o app. Seletor no cabeçalho só aparece se houver mais de uma.
- Testes: não troca para acesso de outro e-mail; não troca para acesso revogado; trocar não vaza dados da empresa anterior (cache do React Query limpo).

## 5. Fase 4C: segmentação por tags de contato

- Migração 0047: enums de alcance ganham o valor **`tags`** (`alcance_publicacao`, `alcance_evento`, e equivalentes de documentos e avisos); tabelas `publicacao_tags`, `evento_tags`, `documento_tags`, `aviso_tags` (`tenant_id`, `<item>_id`, `tag_id`, único por par, gatilho que confere `aplica_a = 'contato'`).
- Políticas restritivas do portal: além de "todos" e "empresas", libera quando existe `contato_tags` do contato do acesso da sessão com uma das tags do item. Função `app_portal_ve(alcance, item_id, tipo)` para não repetir a regra em quatro tabelas.
- Telas do hub: no editor, "Quem vê" com três opções; em "Tags", seleção múltipla agrupada pelos grupos de tags de contato, com contagem prévia "chega a N pessoas com acesso ativo".
- **B-9** publicações e eventos; **B-12** documentos (várias tags); **B-22** avisos (o limite semanal conta para as empresas dos contatos alcançados).
- Testes de isolamento: contato sem a tag não lê (nem pela busca global do portal, nem por URL direta, nem pelo download do documento); tirar a tag tira o acesso na hora.

## 6. Fase 4D: imagem e vídeo nas publicações

- 0048: `publicacao_midias` (`publicacao_id`, `tipo imagem|video`, `arquivo_id` (imagem, pelo pipeline de arquivos) ou `video_provedor youtube|vimeo` + `video_id`, `ordem`, `legenda`, `texto_alternativo` obrigatório para imagem).
- Imagem: envio por URL pré-assinada do Garage, ClamAV, conferência do tipo real (magic bytes), remoção de EXIF/GPS, miniatura e versão 1600 px no worker. Exibição por URL pré-assinada curta. Sem ClamAV, o envio fica desligado (como nos anexos).
- Vídeo: o editor aceita o link; a API extrai e valida o ID (regex por provedor) e guarda **só o ID**; o portal monta o embed. CSP do portal: `frame-src https://www.youtube-nocookie.com https://player.vimeo.com`; `img-src` com o Garage. O iframe só carrega ao tocar na capa (privacidade e dados móveis).
- Duplicar publicação (B-4) copia as mídias (a imagem é reaproveitada, não copiada).

## 7. Fase 4E: construtor de formulários (núcleo)

### 7.1 Modelo de dados (0049)

- `formularios`: `id`, `tenant_id`, `nome`, `finalidade` (`livre`, `inscricao_evento`, `avaliacao_evento`, `satisfacao_chamado`, `associacao`), `situacao` (`rascunho`, `publicado`, `arquivado`), `versao_publicada int`, `acesso` (`publico`, `logado`, `link_pessoal`), `slug` (para o endereço público), `mensagem_sucesso`, `redirecionar_para`, colunas padrão.
- `formulario_versoes`: `formulario_id`, `versao`, `definicao jsonb` (validada pelo Zod compartilhado), `publicada_em`, `publicada_por`. Imutável depois de publicada.
- `formulario_respostas`: `formulario_id`, `versao`, `respostas jsonb`, `origem` (`portal`, `publico`, `link_pessoal`, `crm`), `acesso_id`, `contato_id`, `empresa_id` (opcionais), `contexto_tipo` + `contexto_id` (evento, chamado…), `ip`, `user_agent`, `consentimento_lgpd_em`, colunas padrão. Índice por `(formulario_id, criado_em)` e por contexto.
- `formulario_acoes_execucoes`: log de cada ação disparada (tipo, situação, tentativas, resposta do destino resumida, erro).
- RLS: tenant como sempre; no portal, a pessoa só lê **as próprias** respostas. Respostas públicas entram por função `SECURITY DEFINER` que acha o tenant pelo `slug` (como o mapa público).

### 7.2 Definição do formulário (Zod em `packages/shared/src/formularios.ts`)

- **Estrutura:** páginas (etapas) → seções → campos. Cada campo tem `id` estável, `rotulo`, `ajuda`, `obrigatorio`, `largura` (1/1, 1/2, 1/3), `valorPadrao`, `preenchimento` (FB-3) e `visivelQuando` (FB-1).
- **Tipos de campo:** texto curto, texto longo, e-mail, telefone (máscara BR), **CNPJ** (validação alfanumérica nova, consulta opcional à Receita para preencher razão social), CPF, número, moeda, data, hora, data e hora, seleção única (rádio ou lista), múltipla escolha, sim/não, **avaliação (estrelas 1 a 5)**, escala NPS (0 a 10), arquivo (pipeline + ClamAV, limites por campo), aceite (termos/LGPD, obrigatório nos públicos), texto informativo (Markdown restrito), separador, campo oculto (valor vindo do contexto ou da URL).
- **Validações:** tamanho mínimo/máximo, faixa numérica, regex simples de uma lista fechada (sem regex livre, evita ReDoS), quantidade de opções.
- **Condicionais (FB-1):** regras `{ quando: [{ campo, operador, valor }], combinacao: 'todas'|'qualquer' }` com operadores `igual`, `diferente`, `contem`, `maior`, `menor`, `preenchido`, `vazio`. Aplicam-se a campo, seção e página (pular etapa). Campo escondido **não é validado nem gravado**. O mesmo avaliador (função pura em `packages/shared`) roda no navegador e no servidor; o servidor **revalida tudo** e descarta o que estiver escondido. O construtor recusa ciclos e referências a campos que vêm depois.
- **Botões e ações (FB-2):** o formulário tem botões de envio configuráveis (rótulo, estilo) e cada botão uma lista de ações em ordem:
  - **Webhook:** URL (https, conferida contra uma lista de bloqueio de IP interno/SSRF), método POST, corpo JSON com as respostas (mapeamento opcional de campos), assinatura HMAC com o segredo do webhook do tenant; entra no outbox e no worker de webhooks já existente (retry com espera, log).
  - **Enviar e-mail:** para endereços fixos, para o e-mail informado no formulário (confirmação ao participante) ou para o responsável da carteira; modelo com variáveis `{{campo}}`; sai pela fila de e-mail.
  - **Ações internas** (usadas pelas finalidades): inscrever no evento, registrar avaliação, criar empresa/contato/tarefa no CRM (4G), criar pedido de associação.
  - Condição opcional por ação (mesma regra de condicionais).
- **Preenchimento automático (FB-3):** cada campo pode apontar para uma fonte da sessão logada: `contato.nome`, `contato.email`, `contato.telefone`, `contato.cargo`, `empresa.cnpj`, `empresa.razao_social`, `empresa.nome_fantasia`, `empresa.cidade`… O servidor monta esses valores (o navegador não escolhe), e o campo pode ser **travado** (só conferência) ou **editável**. Para quem não está logado, o campo fica em branco.

### 7.3 Telas

- **Hub → nova aba "Formulários"**: lista (nome, finalidade, situação, respostas, última resposta), criar, duplicar, arquivar.
- **Construtor** (desktop; no tablet só leitura e respostas): três colunas: paleta de campos | tela do formulário (arrastar e soltar com `@dnd-kit`, já no padrão do kanban) | propriedades do campo selecionado (rótulo, validação, preenchimento, condição). Abas "Lógica" (lista de regras), "Botões e ações" e "Configurações" (acesso, mensagem final, LGPD). **Pré-visualizar** como logado/não logado e em celular. **Publicar** cria uma versão nova; rascunho não afeta quem está respondendo.
- **Respostas:** tabela paginada (5/10/20/50), filtros por data e por campo, detalhe da resposta, exportar **CSV, Excel e PDF** (o mesmo exportador da 4G).
- **Renderizador** (`packages/ui/src/formulario/`): um componente só, usado no portal, na página pública e na pré-visualização do CRM. Acessível (rótulos, erros ligados ao campo, navegação por teclado), responsivo.

### 7.4 Segurança

Limite por IP e por formulário nas respostas públicas, campo isca (honeypot) e tempo mínimo de preenchimento; captcha (Cloudflare Turnstile) opcional por formulário, se o Ale aprovar (Q-4). Tamanho máximo da resposta (64 KB sem arquivos). Respostas são dado pessoal: entram na `lgpd.md` (retenção proposta 24 meses, exportação e anonimização pelo titular).

## 8. Fase 4F: pesquisa de satisfação do chamado (B-11)

- Configurações → Portal: "Formulário de satisfação dos chamados" (formulário com finalidade `satisfacao_chamado`); o sistema já cria um modelo padrão (nota 1 a 5, "O que podemos melhorar?", NPS opcional).
- Ao **Resolver/Fechar** um chamado do portal: notificação no sino e (se a pessoa tiver push) no celular; no portal, faixa em **Início** e no chamado: "Como foi o atendimento do chamado #123? Responder pesquisa". Some quando respondida ou depois de 15 dias.
- A resposta grava em `formulario_respostas` (contexto = chamado) **e** alimenta `chamado_avaliacoes` (o campo de estrelas marcado como "nota principal"), para os indicadores e a B-10 continuarem iguais. Uma por chamado.
- Hub: aba Chamados mostra a nota (B-10) com link para a resposta completa; relatório de satisfação por período e por área.

## 9. Fase 4G: eventos 2.0

### 9.1 Modelo de dados (0051)

- `eventos` ganha: `publico boolean NOT NULL DEFAULT false` (B-19), `formulario_inscricao_id`, `formulario_avaliacao_id`, `encerrado_em`, `encerrado_por` (B-15), `checkin_token_hash`, `checkin_abre_minutos int DEFAULT 120` (B-18), `publicacao_id` (B-8), `avaliacao_por_email boolean` (herda a chave do tenant, R-13).
- `evento_confirmacoes` vira a **participação** (expansão, sem quebrar as funções da 3D): `acesso_id` passa a aceitar nulo; novas colunas `nome`, `email citext`, `telefone`, `cnpj`, `contato_id`, `empresa_id` (já existe, passa a aceitar nulo), `resposta_id` (inscrição), `presenca` (`nao_registrada`, `checkin_qr`, `manual`), `presenca_em`, `presenca_por`, `avaliacao_resposta_id`, `avaliacao_token_hash`, `avaliacao_pedida_em`, `avaliacao_lembretes int`. Índice único da inscrição ativa por `(evento_id, email)`. As funções `confirmar/cancelar/promover` ganham versões novas que trabalham pela participação (as antigas continuam até a contração).
- Situação da participação na tela: **Inscrito**, **Lista de espera**, **Presença cancelada** (F-2), **Presente**, **Ausente** (depois do encerramento).
- Tenant: `tenant_configuracoes.portal_avaliacao_email_nao_cadastrados boolean DEFAULT false` (R-13).

### 9.2 Comportamentos

- **B-8 Evento vira publicação:** R-9. Evento com tags/empresas → a publicação tem o mesmo alcance; evento público → publicação para todos.
- **B-19 Público ou só associados:** chave no editor do evento. Público: qualquer pessoa se inscreve (página pública, 4H). Só associados: aparece na página pública, mas o botão leva ao login e só **associado logado** (empresa com status Cliente) se inscreve.
- **B-13 Inscrição por formulário:** o evento escolhe um formulário com finalidade `inscricao_evento`. A ação interna "inscrever no evento" chama a função do banco (vagas e lista de espera continuam valendo). Relatório de inscritos por evento com as colunas fixas (nome, e-mail, empresa, CNPJ, situação, presença, avaliou) + uma coluna por campo do formulário; exportar **Excel (.xlsx, `exceljs`), CSV (UTF-8 com BOM, `;`) e PDF** (gerado no worker, com logo, nome e data do evento). Permissão `portal.eventos_relatorios`.
- **F-1 Confirmar presença com formulário:** no portal, "Inscrever-se" abre o formulário já preenchido com CNPJ, empresa, nome, telefone e e-mail da pessoa logada (travados para conferência; FB-3) + os campos do participante.
- **F-2 Cancelar:** a participação fica com **Presença cancelada** (dados mantidos, auditoria) e o botão **Inscrever-se** volta a ficar ativo. Nova inscrição reaproveita os dados (cria nova linha; a cancelada fica no histórico).
- **B-17 CNPJ → CRM:** R-12. Job `evento-vincular-empresa` no worker: (1) normaliza o CNPJ; (2) acha a empresa no tenant ou cadastra pela Receita (mesmo serviço do cadastro manual, mesmas regras de duplicidade); (3) acha o contato pelo e-mail na empresa ou cria e liga (`empresa_contatos`); (4) cria a atividade **Tarefa** "Contato pós-evento: <evento>" para o **dia útil seguinte** ao evento (ou à inscrição, Q-2), responsável conforme Q-3; (5) liga a participação a empresa e contato. Sem campo CNPJ no formulário: só grava a inscrição. Idempotente por participação.
- **B-18 QR de check-in:** R-11. Na aba Agenda do hub, "QR de check-in" abre a tela cheia para projetar e permite **baixar PNG/PDF** e **regerar**. URL `portal.../checkin/<token>`; o token aleatório só tem o hash no banco. Página de check-in: confirma "Presença registrada, <nome>". Quem não está inscrito e o evento é público: inscrição rápida ali (formulário do evento) e check-in em seguida.
- **B-20 Presença manual:** lista de participantes do evento com busca e botão "Marcar presença" / "Desfazer" (`portal.eventos_presenca`); também permite incluir quem não se inscreveu (nome, e-mail, CNPJ) já como presente (passa pela B-17).
- **B-15 Encerrar evento:** botão "Encerrar evento" (confirmação; disponível depois do início). Ao encerrar: quem não tem presença vira **Ausente**; para cada **presente**, envia o pedido de avaliação: **push + sino** se tiver acesso ao portal; **e-mail com link pessoal** se não tiver e a chave R-13 estiver ligada. Sem formulário de avaliação no evento, o botão avisa e não envia nada. Job em lote pelo outbox.
- **B-16 Acompanhar avaliações:** aba "Avaliações" do evento: totais (presentes, avaliaram, faltam, nota média), lista com filtro "Não avaliaram", e ações "Reenviar push" e "Reenviar e-mail" por pessoa ou para todos que faltam. Limite: no máximo 3 lembretes por pessoa e 1 por dia (contador na participação).
- **B-21 Aba "Eventos" na ficha da empresa (CRM):** lista as participações dos contatos da empresa: evento, dia e hora, participante, situação/presença, **avaliou (sim/não, nota)**. Também entra no Histórico da empresa como item "Participou do evento X". Contagem na aba, como as outras.

### 9.3 Telas do hub (aba Agenda)

Lista paginada (B-14) → evento com abas: **Dados** (editor, chave Público, formulários de inscrição e de avaliação, check-in), **Inscritos** (filtros, exportar, presença manual), **Check-in** (QR), **Avaliações** (B-16). Botões no topo: Publicar, Duplicar, Encerrar evento, Cancelar.

## 10. Fase 4H: página pública de eventos e "Seja um Associado"

- Rota pública no app do portal (sem login): `portal.../eventos` (e `/eventos/<slug>`). Dados por endpoint público `/v1/publico/portal/:tenant-slug/eventos` com DTO mínimo (título, data, local/online, imagem, descrição, público/associados, vagas restantes "Poucas vagas"/"Lotado", sem lista de participantes), cache curto e limite por IP.
- **F-3:** evento público → botão **Inscrever-se** (formulário público, com aceite LGPD; confirmação por e-mail com o código de 6 dígitos para evitar inscrição com e-mail alheio, Q-5). Evento só de associados → aparece com selo "Exclusivo para associados" e botão **Entrar para se inscrever**. Eventos com alcance por empresas/tags **não** aparecem na página pública.
- **F-4:** página simples, cartões em grade (1 coluna no celular, 2 no tablet, 3 no desktop), cabeçalho com nome/logo do portal, botões **Entrar** e **Seja um Associado**. Este abre o formulário de finalidade `associacao` escolhido em Configurações → Portal; a resposta cria um **pedido de associação** no hub (aproveita os pedidos de acesso) e pode criar a empresa como Lead pelo CNPJ (mesma regra da B-17).
- SEO básico (título, descrição, Open Graph por evento) e `.ics` para quem se inscreveu.

## 11. Testes, documentação e commits

- **Por fase:** testes de unidade (Zod, avaliador de condicionais, extração de ID de vídeo, cálculo de alcance), testes da API com banco (isolamento tenant A × B e empresa-cliente X × Y, tags, portal sem acesso às tabelas internas), teste de concorrência nas inscrições (vagas), E2E Playwright das jornadas (código de 6 dígitos, troca de empresa, construir e responder formulário com condição, inscrever → QR → encerrar → avaliar, página pública).
- **Documentos atualizados no mesmo commit:** `funcionalidades.md` (portal), `modelagem_banco.md` (tabelas novas), `lgpd.md` (respostas, inscrições, check-in), `configuracao_tecnologia.md` (exceljs, gerador de PDF, CSP do vídeo), `backlog_pos_mvp.md` (o que ficar de fora), `docs/prototipo/README.md` não muda (é cópia congelada).
- **Variáveis novas:** nenhuma prevista (Turnstile, se aprovado: `TURNSTILE_SECRET` no `.env.example` e aviso para cadastrar no Coolify).
- **Commits previstos (Conventional Commits, um propósito cada):**
  - **4A (7):** `fix(api)` alcance; `feat(web)` hub abre em Publicações e paginação de publicações e agenda; `feat` duplicar publicação; `feat` só Curtir e Parabéns; `feat` estrelas da avaliação no CRM e no portal; `feat(portal)` perfil e empresa somente leitura; `feat(ui)` tema claro/escuro/sistema e correção das abas.
  - **4B (4):** db 0046; api código; api troca de empresa; portal telas + e2e + docs.
  - **4C (4):** db 0047; api políticas e alcance; web/portal; e2e + docs.
  - **4D (3):** db 0048 + api; web/portal + CSP; e2e + docs.
  - **4E (6):** shared (Zod + avaliador); db 0049; api (CRUD, respostas, ações); ui renderizador; web construtor; e2e + docs.
  - **4F (3):** db 0050 + api; portal/web; e2e + docs.
  - **4G (7):** db 0051/0052; api participação e inscrição; job CNPJ → CRM; check-in e presença; encerrar e avaliações; exportações; web/portal + ficha da empresa + e2e + docs.
  - **4H (3):** api pública; portal página pública e associação; e2e + docs.

## 12. Perguntas para o Ale

| # | Pergunta | Recomendação |
|---|---|---|
| Q-1 | B-1: "duas empresas" são duas **empresas-clientes** do mesmo CRM, dois **CRMs** (tenants) diferentes, ou ambos? | Ambos (R-4 cobre os dois) |
| Q-2 | B-17: a tarefa é para o dia seguinte à **inscrição** ou ao **evento**? | Dia útil seguinte ao **evento** (para quem se inscreve sem ir, a tarefa sai no dia seguinte ao evento também) |
| Q-3 | B-17: quem fica responsável pela tarefa e pela empresa nova? | O dono da carteira da empresa, se houver; senão, quem criou o evento |
| Q-4 | Captcha (Turnstile) nos formulários públicos? | Sim, opcional por formulário, ligado na página pública |
| Q-5 | Inscrição pública confirma o e-mail com código? | Sim (evita inscrever terceiros e garante o envio da avaliação) |
| Q-6 | F-5: além de e-mail e telefone travados, o cliente pode alterar nome, cargo e foto? | Pode alterar foto e cargo; nome só pela equipe |
| Q-7 | B-7: o denominador do alcance é "pessoas com acesso ativo ao portal" ou "todos os contatos das empresas associadas" (mesmo sem acesso)? | Pessoas com acesso ativo (só elas podem ver) |
| Q-8 | B-15: avaliação só para quem teve **presença**, ou para todos os inscritos? | Só presentes |
| Q-9 | B-18: o QR é um por evento (projetado na recepção) ou um por participante (a equipe lê o do participante)? | Um por evento, como descrito; o por participante pode vir depois |
