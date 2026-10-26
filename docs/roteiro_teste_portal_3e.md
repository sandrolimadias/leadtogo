# Roteiro de teste: Portal do Cliente, Fase 3E (avisos, preferências, push, PWA e busca)

> Para o Ale testar depois do push da Fase 3E (e das fases 3A a 3D). Regras em `funcionalidades.md` (seção 9G); tabelas e funções em `modelagem_banco.md` ("Portal do Cliente, Fase 3E"); catálogo de permissões em `packages/shared/src/permissoes.ts` (versão 9).
> **Antes de tudo:** **Backup Now** do banco. A migração **0037 só acrescenta** (5 tabelas, 2 funções e 1 coluna com valor padrão); nada existente some. Ela roda sozinha na subida da API.
> **O que muda para quem já usa:** só o **Administrador** recebe `portal.avisos`; os demais perfis ganham se você marcar em Configurações → Perfis de acesso. A **busca** e as **preferências** aparecem para todos os clientes. **O push só funciona depois da seção 1 (chaves VAPID).** Sem as chaves, tudo o mais funciona e o botão de push explica que ainda não está disponível.
> Para as seções 4 a 8 você precisa de **dois clientes de empresas-clientes diferentes** (e-mails seus), com acesso ao portal; um deles, de preferência, com o celular à mão.

## 1. Configurar o push (uma vez só)
1. No seu computador, na pasta do projeto: `npx web-push generate-vapid-keys`. Ele imprime uma **Public Key** e uma **Private Key**.
2. No **Coolify**, em **`leadtogo-api` e em `leadtogo-worker`** (os dois, com os mesmos valores), cadastre:
   - `VAPID_PUBLIC_KEY` = a Public Key
   - `VAPID_PRIVATE_KEY` = a Private Key (**segredo**: não coloque em chat nem no GitHub)
   - `VAPID_SUBJECT` = `mailto:contato@aledias.com.br` (um e-mail seu que o serviço de push possa usar)
3. **Reinicie/redeploy** a API e o worker. Confira em Perfil e empresa → Notificações (como cliente): o botão **Ativar avisos neste aparelho** aparece.
> Se trocar o par de chaves depois, todos os aparelhos precisam ativar o push de novo.

## 2. Verificação no servidor (terminal da VPS)
```sql
-- 1) As 5 tabelas com RLS habilitado e forçado (esperado: 5 linhas, as duas colunas true)
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('avisos','aviso_empresas','aviso_entregas','portal_preferencias','portal_push_inscricoes');

-- 2) As funções do worker existem (esperado: 2)
SELECT count(*) FROM pg_proc WHERE proname IN ('app_avisos_a_enviar','app_pushes_pendentes');

-- 3) A coluna do limite semanal (esperado: 3)
SELECT portal_avisos_limite_semanal FROM tenant_configuracoes LIMIT 1;
```

## 3. Enviar um aviso (CRM → Portal do Cliente → Avisos)
1. Aba **Avisos**. Em **Novo aviso**, escreva a **Mensagem** (até 140 caracteres; o contador conta) e veja a **prévia "Como chega no celular"** mostrar a mensagem inteira.
2. **Link (opcional):** teste `/agenda` (abre a Agenda do portal) e, depois, `https://exemplo.com.br` (abre em outra aba). `javascript:...` e `//site` são recusados.
3. **Para quem:** *Todos os clientes* ou *Empresas escolhidas* (busque e adicione uma a uma).
4. **Envio:** *Agora* ou *Agendar* (escolha um horário daqui a 3 ou 4 minutos). **Enviar aviso** abre uma janela de confirmação com o texto e o alcance; **Confirmar envio**.
5. O aviso aparece em **Enviados e agendados**. O agendado mostra "Sai em ..." e **Cancelar envio**; o enviado mostra **Entregues x de y**, **Lidos %**, **Push n** e **E-mail n**.

## 4. O que o cliente recebe
1. **Sino:** em até alguns segundos, um toast e uma notificação **Aviso** com a mensagem inteira. Clicar abre o link do aviso (tela do portal ou outra aba) e marca como lida; na equipe, **Lidos %** sobe.
2. **E-mail:** chega "Novo aviso" (ou "Aviso urgente") com a mensagem e o botão do link. Quem desligou o e-mail dos avisos não recebe (seção 6).
3. **Agendado:** o aviso agendado **não** sai antes da hora; na hora, o worker o entrega em até 1 minuto. **Cancelar envio** de um agendado impede a entrega; o já enviado não tem cancelar.
4. **Quem não tem o acesso ativo** (suspenso, revogado, convite pendente) não recebe.

## 5. Urgente, silêncio e limite semanal
1. **Limite:** envie 3 avisos **normais** na mesma semana (segunda a domingo). O contador mostra **"3 de 3"**, o botão fica desligado e a mensagem diz que só o urgente pode sair. Agendar para a **semana seguinte** usa o limite daquela semana. Para trocar o limite: Configurações → Portal → **Avisos normais por semana** (1 a 20).
2. **Por empresa:** 3 avisos só para a empresa A não impedem um aviso só para a empresa B; mas um aviso para *todos* conta para as duas.
3. **Urgente** (interruptor): sai mesmo com o limite estourado, **não conta no limite**, e o push chega **na hora, mesmo no horário de silêncio**.
4. **Silêncio:** como cliente, em Perfil e empresa → Notificações, ligue **Silenciar avisos normais** com um intervalo que inclua o horário atual (ex.: 1 hora antes até 1 hora depois) e salve. Um aviso **normal** chega no sino e no e-mail, mas o **push espera o fim do silêncio**; o **urgente** chega na hora.

## 6. Preferências do cliente (Perfil e empresa → Notificações)
1. **Silêncio** e **E-mail** (Chamados, Agenda, Avisos da equipe): desligue "Avisos da equipe" e salve. O próximo aviso chega só no sino. Desligue "Chamados" e responda um chamado pela equipe: só o sino avisa. Desligue "Agenda" e cancele um evento: idem.
2. O sino **sempre** mostra tudo. Os e-mails de entrada (link de acesso) e de segurança **não** dependem destas opções.
3. Fechar e abrir de novo mantém o que foi salvo; outra pessoa da mesma empresa tem as **próprias** preferências.

## 7. Push e instalação como app
1. **Computador/Android (Chrome):** Perfil e empresa → Notificações → **Ativar avisos neste aparelho** → o navegador pergunta; **Permitir**. O botão vira **Desativar neste aparelho**. Envie um aviso **urgente**: a notificação aparece mesmo com o portal fechado; clicar abre o link.
2. **Recusou a permissão ou bloqueou:** a tela explica que as notificações estão bloqueadas e como liberar nas configurações do navegador.
3. **iPhone/iPad:** no Safari, abra o portal → **Compartilhar → Adicionar à Tela de Início**. Abra **pelo ícone**; só então Perfil e empresa → Notificações → **Ativar avisos neste aparelho**. No Safari comum a tela explica que é preciso instalar primeiro.
4. **Instalar no Android/computador:** o navegador oferece "Instalar app" (ícone na barra de endereço ou menu). Abre em janela própria, sem barra do navegador.
5. **Desativar** revoga a inscrição daquele aparelho; o aviso seguinte não chega nele.
6. O mesmo aparelho não fica inscrito em duas contas ao mesmo tempo: se outra conta já usa, a tela avisa ("já recebe avisos de outra conta").

## 8. Busca global
1. No portal, o campo **Buscar no portal** no topo (no celular, a lupa) leva à tela **Busca**. Digite 2 letras ou mais.
2. Resultados por tipo: **Chamados** (assunto, descrição, código `CH-0042` ou o número), **Documentos**, **Agenda**, **Publicações**. Ignora acentos e maiúsculas ("conciliacao" acha "conciliação").
3. Clicar leva à tela do item. O cliente **nunca** acha: chamado de outra empresa, rascunho, documento ainda em verificação ou bloqueado, evento fora do alcance dele.

## 9. Permissões e isolamento
1. Perfil só com **`portal.ver`**: vê a lista de avisos e as estatísticas, mas **não** tem o formulário nem **Cancelar envio**.
2. Perfil só com **`portal.avisos`**: vê a aba Avisos e envia; não vê Chamados nem Acessos.
3. Sem nenhuma permissão do portal: o menu **Portal do Cliente** nem aparece.
4. O cliente só lê as **próprias** entregas, preferências e inscrições; outra empresa-cliente e outra empresa da equipe nunca veem as suas.

## 10. Se algo falhar
| Sintoma | Causa provável |
|---|---|
| "Ativar avisos" não aparece, e a tela diz "ainda não estão disponíveis" | Faltam as variáveis `VAPID_*` na **API** (a tela vem da API); cadastre e reinicie |
| Ativei, mas o push não chega | `VAPID_*` só na API e não no **worker** (o envio é do worker); ou o navegador bloqueou as notificações; no iPhone, o portal não foi instalado na tela de início |
| O aviso saiu no sino e no e-mail, mas não no celular | O horário de silêncio (aviso normal) ou o aparelho não está inscrito |
| Aviso agendado não saiu | O worker está parado (ele confere a cada minuto) |
| "Já há 3 de 3 avisos normais" | Limite semanal: use Urgente só se for urgente, escolha outra semana ou aumente o limite em Configurações → Portal |
| E-mail do aviso não chegou | `PORTAL_URL`/SMTP não configurados, ou a pessoa desligou o e-mail dos avisos |
| "Este aparelho já recebe avisos de outra conta" | Desative o push na outra conta (ou saia dela) e ative de novo |
