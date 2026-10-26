# Plano do Portal do Cliente (Fase 3)

> **Status:** aprovado pelo Ale em 26/10/2026, com as recomendações deste documento para todas as perguntas em aberto. Telas de referência em `docs/prototipo-portal/` (regra do projeto: onde divergirem de `funcionalidades.md`, vale o documento).
> **Escopo:** o espaço do cliente (portal.aledias.com.br) e o hub "Portal do Cliente" no CRM. Reaproveita a central de chamados da Fase 2 (`funcionalidades.md`, seção 9B).

## 1. Fases

| Fase | Entrega | Migração |
|---|---|---|
| **3A** | Acesso do cliente (convite e link mágico), chamados no portal, avaliação, notificações do cliente, perfil/empresa/segurança, hub no CRM (aba Chamados, acessos, pedidos), app `apps/portal`, pacote `packages/ui` | 0032 |
| **3B** | Publicações: feed, reações, comentários, denúncia, moderação, alcance | 0033 |
| **3C** | Documentos | 0034 |
| **3D** | Agenda: eventos, confirmação, vagas por empresa, lista de espera, lembretes, `.ics` | 0035 |
| **3E** | **Avisos** (comunicado curto com push), busca global, preferências (horário de silêncio), PWA e Web Push | 0036 |

Cada fase termina em portão: gate verde, CI verde, deploy, roteiro de teste e aceite do Ale. Migração só de expansão; **Backup Now antes do deploy de cada fase**.

## 2. Decisões (todas aprovadas)

| # | Decisão |
|---|---|
| D1 | **Identidade própria** do portal, ligada ao contato: convite por e-mail, **link mágico, sem senha**, 2FA por aplicativo opcional. Não usa o Better Auth do CRM |
| D2 | **App separado** `apps/portal`, domínio `portal.aledias.com.br`, mesma API em `/v1/portal/*` |
| D3 | Componentes base do `apps/web` extraídos para `packages/ui` (primeiro commit, sem mudança visual) |
| D4 | A empresa é achada pelo e-mail no login (o convite já carrega a empresa; escolha se o e-mail estiver em mais de uma). Domínio próprio por empresa: backlog |
| D5 | O cliente vê **tudo da empresa-cliente** dele, com filtro "só os meus" |
| D6 | Papéis no portal: **Responsável** (pode pedir acesso para colegas) e **Colega**; ambos veem o mesmo |
| D7 | **A equipe libera** o acesso (convite pela ficha do contato ou aprovação de "pedido de acesso") |
| D8 | Anexos do cliente só ligam com o ClamAV e o CORS no ar; mesmo pipeline e limites (5 por mensagem, 25 MB) |
| D9 | Estados para o cliente em nomes simples (seção 6) |
| D10 | Cinco fases com portões |
| P6 | O cliente **não** escolhe prioridade |
| P7 | O cliente **não** envia documentos soltos (anexa em chamado) |
| P8 | Comentários abertos por padrão nas publicações, com denúncia, ocultar e chave geral |
| P9 | Do atendente, só o primeiro nome |
| P10 | Avaliação (1 a 5) opcional, pedida ao resolver, uma vez por chamado |
| P11 | O Responsável é escolhido no convite; o sistema sugere o contato `principal` da empresa |

## 3. Arquitetura e isolamento

- Um app estático novo (`apps/portal`) fala só com `/v1/portal/*`; o CRM continua em `/v1/*`. Cada lado tem domínio, cookie, CSP e guarda próprios. API, banco, worker e Garage são compartilhados.
- **Isolamento em duas camadas, no banco:** (1) empresa da equipe (`app.tenant_id`, RLS forçado, como hoje); (2) **empresa-cliente**: a sessão do portal preenche `app.portal_empresa_id` e `app.portal_acesso_id`, e **políticas restritivas** nas tabelas que o cliente enxerga só liberam as linhas daquela empresa. O CRM nunca preenche essas variáveis. As tabelas internas (notas internas, triagem, membros das áreas, histórico interno) **negam tudo** quando a sessão é do portal.
- O portal tem **DTOs próprios em lista de permissão** (nunca reaproveita o formato do CRM) e o teste "nenhuma rota sem decisão" cobre as rotas do portal.
- Tudo o que o cliente faz vai para a auditoria com ator do tipo `contato`.

## 4. Acesso e segurança do cliente

- **Convite:** quem tem `portal.acessos` abre a ficha do contato → "Dar acesso ao portal" (e-mail, empresa-cliente, papel). Token aleatório de 256 bits, só o **hash** no banco, vale 7 dias, uso único. O link abre uma página com o botão **Confirmar acesso**: o consumo é por `POST`, nunca pelo carregamento da página (verificadores de e-mail não queimam o link).
- **Entrada:** o cliente informa o e-mail; a resposta é **sempre a mesma**. Link mágico de 15 minutos, uso único, mesma página de confirmação.
- **Sessão:** cookie `__Host-portal`, `HttpOnly`, `Secure`, `SameSite=Lax`, sem `Domain`; 30 dias deslizantes, no máximo 90; só o hash do token no banco. Aba **Segurança**: lista de sessões, sair de uma ou de todas, 2FA, troca de e-mail (link para o e-mail novo). Revogar o acesso derruba as sessões.
- **Abuso:** limite por IP e por e-mail nas rotas de entrada, com espera crescente; texto puro e tamanhos máximos nos comentários; download por URL pré-assinada de 60 segundos, só de arquivo **limpo** e da empresa do cliente.
- **CSP do portal:** `default-src 'self'`; `connect-src` só com o próprio host e o Garage dos arquivos.

## 5. Modelo de dados

Regras do projeto: português, uuid v7, `tenant_id`, RLS forçado, colunas padrão, teste de isolamento, só expansão.

- **0032 (3A):** `portal_acessos`, `portal_links`, `portal_sessoes`, `portal_segundo_fator`, `portal_pedidos_acesso`, `chamado_avaliacoes`, `chamado_atividades`; colunas em `tenant_configuracoes` (`portal_ativo`, `portal_nome`, `portal_logo`, `portal_exige_2fa_responsavel`) e `notificacoes.acesso_id`; políticas restritivas nas tabelas dos chamados; funções `SECURITY DEFINER` para localizar link e sessão antes de saber o tenant.
- **0033 (3B):** `publicacoes`, `publicacao_empresas`, `publicacao_reacoes`, `publicacao_comentarios`, `publicacao_denuncias`, `publicacao_leituras`.
- **0034 (3C):** `documentos`, `documento_empresas`, `documento_acessos`.
- **0035 (3D):** `eventos`, `evento_empresas`, `evento_confirmacoes`.
- **0036 (3E):** `avisos`, `aviso_entregas`, `portal_preferencias` (e-mail por tipo, horário de silêncio), `portal_push_inscricoes`, índices de busca (`tsvector`).

## 6. Chamados

O cliente usa a mesma central da Fase 2 pela porta do portal.

| Estado interno | O cliente vê |
|---|---|
| Aguardando triagem, Pendente de atendimento | **Aberto** |
| Em atendimento | **Em atendimento** |
| Aguardando cliente | **Aguardando sua resposta** |
| Resolvido | **Resolvido** |
| Fechado | **Fechado** |

- **Abrir:** assunto, descrição e área (só as `visivel_no_portal`; "não sei" vai para a triagem). Empresa-cliente e solicitante vêm **da sessão**, nunca do corpo do pedido. Responder em "Aguardando sua resposta" devolve para "Em atendimento" (regra da Fase 2). Reabrir até 7 dias após Resolvido. Avaliar: nota 1 a 5 e comentário, uma vez.
- **Não aparecem ao cliente:** notas internas, triagem, prioridade interna, metas e prazos, e-mail do atendente.
- **No CRM (hub, aba Chamados):** reutiliza lista e detalhe da central com o filtro `origem = portal` e os indicadores **Em aberto**, **Prazo estourando**, **1ª resposta no prazo** e **Nota média**; a caixa **"Aguardar resposta do cliente"** envia e muda o estado numa ação só; **"Criar tarefa"** cria uma Atividade ligada ao chamado.

## 7. Publicações, documentos e agenda

- **Publicações:** rascunho, agendada (job), publicada; fixar (uma por vez); alcance "todos" ou empresas; Markdown restrito sem HTML; reações Curtir, Apoiar e Parabéns (uma de cada por pessoa, clicar de novo desfaz); comentários em texto puro, com limites, bloqueio por publicação e chave geral; **denúncia** (spam, ofensivo, outro); moderação Manter, Ocultar (com motivo; não apaga) ou Bloquear comentários; **alcance** medido por leituras (dado pessoal, vai para a LGPD).
- **Documentos:** a equipe publica (todas as empresas ou algumas) pelo pipeline de arquivos e antivírus; o cliente lista e baixa; cada download é registrado.
- **Agenda:** evento com vagas totais, vagas por empresa, prazo de confirmação e alcance; "Confirmar", "Você vai", "Confirme presença", "Lotado · lista de espera". Confirmar e cancelar em transação com trava de linha; o cancelamento promove o primeiro da fila da empresa com vaga livre. Lembrete 24 h antes e `.ics`.

## 8. Avisos (3E): comunicado curto com push

Definido pelas telas `05` e `06`. O aviso é diferente de publicação: é uma **notificação curta** que chega no celular.

- **Novo aviso:** mensagem (obrigatória, **até 140 caracteres**, aparece inteira na notificação), link opcional (uma tela do portal ou endereço externo), **audiência** (todos os clientes ou um segmento, por exemplo "Empresas com contrato vencendo"; mostra quantas pessoas têm acesso ativo), **envio** agora ou agendado, **urgência**.
- **Urgência:** *Normal* respeita o **horário de silêncio** de cada pessoa; *Urgente* chega na hora, mesmo no silêncio, e não conta no limite.
- **Limite:** no máximo **3 avisos normais por semana** por empresa (configurável); a tela mostra "2 de 3". Evita que o aviso vire ruído.
- **Canais:** push (quem instalou o portal), sino e e-mail. Quem não instalou o portal no iPhone recebe só sino e e-mail. Há uma prévia "como chega no celular".
- **Enviados e agendados:** lista com mensagem, urgência, data, audiência, **Entregues (x de y)** e **Lidos (%)**; os agendados mostram o número de destinatários e **Cancelar envio**.
- **Preferências do cliente (3E):** horário de silêncio, e-mail por tipo; avisos de segurança nunca desligam.

## 9. Notificações, busca e PWA

Tudo reaproveita `notificacoes` (destinatário `contato`) e o SSE da Fase 2. Busca global (chamados, documentos, eventos e publicações) por `tsvector` em português, **dentro da sessão do cliente**, então as mesmas políticas valem. PWA instalável e Web Push (VAPID) com consentimento explícito.

## 10. Permissões (catálogo v5, só o Administrador recebe)

`portal.ver`, `portal.acessos`, `portal.publicar`, `portal.moderar`, `portal.documentos`, `portal.agenda`, `portal.configurar`, e `portal.avisos` (acrescentada por causa da aba Avisos). O Gestor não herda o prefixo `portal.`. O enum `papel_conta` não muda.

## 11. Pré-requisitos, riscos e LGPD

- **Antes de produção:** anexos da Fase 2 no ar (ClamAV e CORS); DNS e certificado de `portal.aledias.com.br` e aplicativo novo no Coolify; SPF, DKIM e DMARC do remetente; marca (nome e logo); chaves VAPID para o push.
- **Riscos tratados:** vazamento entre empresas-clientes (políticas restritivas, DTOs, testes entre empresas do mesmo tenant); link mágico lido por verificador (consumo por `POST`); spam em comentários (limites, denúncia, ocultar, chave geral); arquivo malicioso (ClamAV, URL de 60 s); corrida nas vagas (trava e teste de concorrência); e-mail que não chega (SPF/DKIM/DMARC).
- **LGPD (`lgpd.md`):** o cliente final é o titular (nome, e-mail, telefone, cargo, foto, comentários e **leituras**); aviso de privacidade no primeiro acesso com registro do aceite; retenção proposta: links 30 dias, sessões expiradas 90 dias, leituras 24 meses; exportação e desligamento (revoga o acesso e anonimiza o nome nos comentários, mantendo o texto). A revisão jurídica continua pendente.

## 12. Commits previstos

- **3A (11):** `refactor(ui)`, `feat(db)` 0032, `feat(shared)`, `feat(api)` autenticação, `feat(api)` acessos no CRM, `feat(api)` chamados do portal, `feat(api)` indicadores do hub, `feat(portal)`, `feat(web)` hub, `chore(ci)`, `test(e2e)`+docs.
- **3B (5):** db 0033, api, portal, web, e2e+docs. **3C (4):** db 0034, api, telas, e2e+docs. **3D (5):** db 0035, api (com teste de concorrência), portal, web, e2e+docs. **3E (5):** db 0036, api (avisos, busca, preferências), push, portal, e2e+docs.
