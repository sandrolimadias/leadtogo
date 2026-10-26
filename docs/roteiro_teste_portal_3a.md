# Roteiro de teste: Portal do Cliente, Fase 3A (acesso e chamados)

> Para o Ale testar depois do push da Fase 3A. Regras em `funcionalidades.md` (seção 9C); tabelas em `modelagem_banco.md` ("Portal do Cliente, Fase 3A"); plano em `plano_portal_cliente.md`; catálogo de permissões em `packages/shared/src/permissoes.ts` (versão 5).
> **Antes de tudo:** faça a preparação (seção 0) e a verificação no servidor (seção 1). Depois teste **no CRM** (seções 2 e 3) e **no portal** (seções 4 a 10), com duas janelas: uma normal para o CRM e uma **anônima** para o cliente.
> **O que muda para quem já usa:** nada na operação. As migrações **0032 e 0033 só acrescentam** (nenhuma tabela ou coluna existente some). Só o **Administrador** recebe as permissões `portal.*`; os demais perfis ganham se você marcar em Configurações → Perfis de acesso.
> **Segurança do deploy:** enquanto `PORTAL_URL` não estiver configurada, as rotas do portal respondem `503 portal_indisponivel` e o CRM funciona normal.

## 0. Preparação (Coolify, DNS e GitHub)

1. **Backup Now** do banco antes do deploy (as migrações 0032 e 0033 rodam sozinhas na subida da API).
2. **DNS:** crie o registro `portal.aledias.com.br` (A/AAAA, igual ao do CRM, para o IP da VPS).
3. **Coolify, aplicativo novo do portal:**
   - origem: a imagem `leadtogo-portal` do GHCR (mesma esteira dos outros), porta **8080**, domínio `portal.aledias.com.br` (o Coolify emite o certificado);
   - **roteie `/v1` para a API** no mesmo domínio, como já é feito no CRM (rótulo do Traefik com `PathPrefix(/v1)` apontando para o container da API). O portal fala com a API só por caminho relativo; sem essa rota o portal abre, mas não entra.
4. **Variável nova na API e no worker:** `PORTAL_URL` = `https://portal.aledias.com.br` (sem barra no fim). É a origem que a API confere nas alterações do portal e a base dos links dos e-mails.
5. **GitHub:** crie o secret `COOLIFY_UUID_PORTAL` (UUID do aplicativo do portal no Coolify) e a variável do repositório `PORTAL_HOST` = `portal.aledias.com.br`. Sem eles a esteira simplesmente não faz o deploy nem a verificação do portal.
6. **E-mail:** o convite e o link de entrada saem pelo mesmo remetente dos outros e-mails. Confira **SPF, DKIM e DMARC** do domínio remetente; sem eles os links caem no spam do cliente.
7. **Chamados com anexos:** o portal usa o mesmo envio direto ao Garage. Ao ligar os anexos (`roteiro_garage_anexos.md`), **inclua `https://portal.aledias.com.br` na lista de origens do CORS do bucket**. Sem os anexos configurados, o portal funciona e o botão de anexar fica desligado.

## 1. Verificação no servidor (terminal da VPS)
Conecte ao banco como no `runbook_e13.md`, seção 4.6:
```sql
-- 1) As migrações entraram (esperado: 0032 e 0033)
SELECT hash IS NOT NULL AS ok FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 2;

-- 2) Tabelas do portal com RLS habilitado e forçado (esperado: 7 linhas, as duas colunas true)
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('portal_acessos','portal_links','portal_sessoes','portal_segundo_fator',
                   'portal_pedidos_acesso','chamado_avaliacoes','chamado_atividades');

-- 3) Nenhum acesso nem sessão ainda (esperado: 0 e 0)
SELECT (SELECT count(*) FROM portal_acessos), (SELECT count(*) FROM portal_sessoes);
```
Depois confira o portal: `https://portal.aledias.com.br/` abre a página "Entrar" e `https://portal.aledias.com.br/v1/portal/sessao` responde `401` com `nao_autenticado` (prova que a rota `/v1` chega na API).

## 2. Configurar o portal no CRM
1. Entre no CRM como Administrador → **Portal do Cliente** no menu. Abre o hub com os indicadores.
2. **Configurações → Portal do Cliente:** ligue **Portal ativo**, escreva o **nome de exibição** (aparece no cabeçalho do portal e nos e-mails) e, se quiser, marque **exigir verificação em duas etapas dos Responsáveis**. Salve.
3. Em **Configurações → Perfis de acesso**, crie um perfil de teste com só `portal.ver` e confirme que ele **não** vê Acessos nem Configurar (permissão por ação).

## 3. Dar acesso a um cliente
1. Cadastre (ou use) uma empresa-cliente com um contato que tenha **e-mail seu de teste** (use um segundo e-mail seu).
2. Na ficha do contato, ou em **Portal do Cliente → Acessos**, clique em **Dar acesso ao portal**: escolha a empresa-cliente e o papel **Responsável**. O acesso aparece como **Convidado**.
3. Confirme que chegou o e-mail de convite com o link `https://portal.aledias.com.br/acesso#...`.
4. Tente dar o mesmo acesso de novo: o CRM recusa ("já existe um acesso para este contato nesta empresa").
5. Mais tarde (seção 10): suspender, reativar, reenviar convite e revogar.

## 4. Primeiro acesso do cliente (janela anônima)
1. Abra o link do convite. Aparece a página **Confirmar acesso** (o link **ainda não foi usado**: atualize a página e ele continua valendo).
2. Leia o aviso de privacidade, marque o aceite e clique em **Confirmar acesso**. Você entra no portal (Início).
3. Tente abrir o **mesmo link** de novo: "Link inválido ou já usado". O link é de **uso único**.
4. Copie o link do e-mail para outra janela **sem clicar**: nada acontece até o botão ser apertado (verificadores de e-mail não gastam o link).

## 5. Entrar de novo (link mágico)
1. Saia (menu do usuário → Sair). Em **Entrar**, informe o e-mail do cliente: a tela diz "Se o e-mail tiver acesso, enviamos um link", **igual para qualquer e-mail**, inclusive um que não existe.
2. Abra o link do e-mail (vale 15 minutos), confirme e entre.
3. Peça links demais seguidos (mais de 5 em uma hora para o mesmo e-mail): a API passa a responder "tente mais tarde".

## 6. Chamados pelo cliente
1. **Abrir chamado:** Chamados → Novo. Escolha a área (ou "Não sei") e escreva assunto e descrição. O chamado nasce com número e estado **Aberto**.
2. **No CRM** (janela normal): o chamado aparece em Chamados (origem Portal); quem atende recebe o **sino** e o **e-mail**. Se a triagem estiver ligada, ele cai em **Aguardando triagem**.
3. **Conversa:** responda pelo CRM (mensagem normal) e pelo portal. As respostas aparecem dos dois lados. Escreva uma **nota interna** no CRM e confirme que ela **não aparece** no portal.
4. **Aguardando sua resposta:** no CRM, mude para Aguardando cliente. No portal o estado vira **Aguardando sua resposta** e o cliente recebe aviso. Quando ele responde, o chamado volta a Em atendimento.
5. **Resolver e reabrir:** resolva no CRM. No portal aparece **Resolvido** com o botão **Reabrir** (até 7 dias) e a **avaliação** de 1 a 5 com comentário. Reabra uma vez e avalie outra.
6. **Anexos** (só com os anexos ligados): anexe um arquivo na abertura e numa resposta; ele fica "em verificação" e depois baixa. Um arquivo de teste do antivírus (EICAR) deve ser bloqueado.
7. **O que o cliente nunca vê:** notas internas, prioridade, responsável e prazos internos, histórico de eventos e chamados internos da equipe, mesmo os que citam a empresa dele.

## 7. Notificações do cliente
- O sino do portal mostra "Resposta nova", "Chamado resolvido" etc., com contador, **marcar como lida** e **marcar todas**; chega na hora (sem recarregar) com o portal aberto.
- O mesmo evento gera um e-mail ao cliente. **Nunca** avisa quem fez a ação.

## 8. Perfil, empresa e segurança do cliente
1. **Perfil:** o cliente altera só o **nome** (o cargo vem do cadastro da empresa e é somente leitura).
2. **Sessões:** lista das sessões com aparelho e data; sair de uma e **sair de todas as outras**.
3. **Verificação em duas etapas (2FA):** ative com um aplicativo autenticador, guarde os **códigos de recuperação**, saia e entre de novo (o portal pede o código). Um código usado não vale uma segunda vez. Se você ligou "exigir 2FA do Responsável" na seção 2, o portal obriga a ativar.
4. **Trocar e-mail:** informe o novo endereço; o link de confirmação vai **para o e-mail novo** e só então o acesso passa a ele.
5. **Colegas (Responsável):** o Responsável **pede acesso** para um colega da empresa (nome, e-mail, cargo) e acompanha seus pedidos. O pedido chega ao CRM.

## 9. Hub do CRM: acessos e pedidos
1. **Portal do Cliente → Chamados:** os chamados abertos pelo portal, com a avaliação do cliente.
2. **Criar tarefa a partir do chamado:** no detalhe do chamado, "Criar tarefa" gera uma tarefa vinculada (com prazo opcional).
3. **Pedidos de acesso:** aprove (cria o acesso e manda o convite) ou recuse com motivo.
4. **Indicadores:** chamados abertos pelo portal, tempo de resposta, avaliação média e acessos ativos, com o filtro de período.

## 10. Revogar, suspender e isolamento
1. **Suspender** o acesso no CRM: a sessão aberta do cliente cai na próxima ação ("acesso suspenso") e ele não consegue entrar. **Reativar** devolve.
2. **Revogar**: derruba todas as sessões; não volta (só com um convite novo).
3. **Isolamento entre empresas-clientes:** com **dois contatos de empresas-clientes diferentes** (mesma empresa sua), confirme que cada um só vê os próprios chamados e que o link de um chamado do outro responde "não encontrado". O mesmo vale para o colega da mesma empresa (vê os chamados da empresa dele, mas não os de outra).
4. **Portal desligado:** em Configurações → Portal do Cliente, desligue "Portal ativo": o cliente deixa de entrar. Religue ao terminar.

## 11. Se algo falhar
| Sintoma | Causa provável |
|---|---|
| O portal abre mas o login dá erro | A rota `/v1` do domínio do portal não chega na API (seção 0, item 3) ou falta `PORTAL_URL` (503 `portal_indisponivel`) |
| "Origem não permitida" ao agir | `PORTAL_URL` diferente da origem real (http/https, barra no fim, subdomínio) |
| O e-mail não chega | SPF/DKIM/DMARC; o worker parado; veja o Mailpit/log do worker. A chave `TOKEN_ENCRYPTION_KEY` precisa existir no worker |
| O botão de anexar fica desligado | Anexos ainda não configurados (`roteiro_garage_anexos.md`); o resto funciona |
| Anexo falha no navegador | Falta o portal no CORS do bucket |
