# Roteiro de teste: Portal do Cliente, Fase 3B (publicações)

> Para o Ale testar depois do push da Fase 3B (e depois de testar a 3A). Regras em `funcionalidades.md` (seção 9D); tabelas em `modelagem_banco.md` ("Portal do Cliente, Fase 3B"); catálogo de permissões em `packages/shared/src/permissoes.ts` (versão 6).
> **Antes de tudo:** **Backup Now** do banco. A migração **0034 só acrescenta** (6 tabelas novas e 1 coluna com valor padrão em `tenant_configuracoes`); nada existente some. Ela roda sozinha na subida da API.
> **O que muda para quem já usa:** nada na operação. Só o **Administrador** recebe `portal.publicar` e `portal.moderar`; os demais perfis ganham se você marcar em Configurações → Perfis de acesso. **Nada novo para configurar no Coolify** (a publicação agendada usa o worker que já existe).
> Use duas janelas: uma normal para o CRM e uma **anônima** com um cliente do portal (a 3A já deve estar funcionando). Para a seção 5 você precisa de **dois clientes de empresas-clientes diferentes** (dois e-mails seus).

## 1. Verificação no servidor (terminal da VPS)
```sql
-- 1) A migração entrou (esperado: 0034 por último)
SELECT count(*) FROM drizzle.__drizzle_migrations;

-- 2) As 6 tabelas com RLS habilitado e forçado (esperado: 6 linhas, as duas colunas true)
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('publicacoes','publicacao_empresas','publicacao_reacoes',
                   'publicacao_comentarios','publicacao_denuncias','publicacao_leituras');

-- 3) A função do worker e o gatilho dos totais existem (esperado: 1 e 1)
SELECT (SELECT count(*) FROM pg_proc WHERE proname = 'app_publicar_agendadas'),
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'publicacao_reacoes_total');
```

## 2. Escrever e publicar (CRM → Portal do Cliente → Publicações)
1. Abra **Portal do Cliente** → aba **Publicações** (a primeira). Clique **Nova publicação**.
2. Preencha **Título** e **Texto**. Teste o Markdown: `**negrito**`, `*itálico*`, `[link](https://exemplo.com.br)`, listas com `- ` e subtítulo com `## `. Digite também `<b>teste</b>`: **não** pode virar negrito (HTML não é aceito). Use **Pré-visualizar**.
3. **Para quem:** "Todos os clientes". **Quando:** "Publicar agora". Clique **Publicar**.
4. A publicação aparece na lista (selo **Publicada**) e no **Início do portal** do cliente, com o texto formatado.
5. Crie outra com "Só guardar como rascunho": o selo é **Rascunho** e o cliente **não** a vê. Edite e mude para "Publicar agora": passa a aparecer.
6. **Editar uma publicada:** o botão Editar muda título e texto; a opção "Quando" some (uma publicada não volta a rascunho nem agenda).

## 3. Agendar
1. Nova publicação → **Quando: Agendar** → escolha um horário **daqui a 2 ou 3 minutos** → **Agendar**. Selo **Agendada**, "Agendada para ...". O cliente não vê.
2. Tente agendar para o passado: a tela recusa com "Escolha um horário no futuro".
3. Espere o horário (o worker confere **a cada minuto**): a publicação passa para **Publicada** sozinha e aparece no portal. Se não passar em 2 minutos depois do horário, veja o log do worker (job `publicar-agendadas`).

## 4. Fixar, alcance e excluir
1. **Fixar:** numa publicada, **Fixar**: ela vai para o topo do feed do cliente com o selo "Fixada". Fixe outra: a primeira desafixa (só uma por vez). Rascunho e agendada não fixam.
2. **Alcance por empresas:** nova publicação → **Para quem: Empresas escolhidas** → procure e adicione uma ou mais empresas (chips). Só os clientes dessas empresas veem; os demais, não. Salvar sem nenhuma empresa é recusado.
3. **Excluir:** a publicação some da lista e do portal (os dados ficam guardados).

## 5. O cliente: reagir, comentar e denunciar (duas janelas anônimas, dois clientes de empresas diferentes)
1. **Cliente A** abre o Início: vê o comunicado. **Curtir** (o botão fica marcado e o número sobe); clicar de novo desfaz. Teste **Apoiar** e **Parabéns**.
2. **Cliente B** vê o **total** das duas empresas (ex.: 2 curtidas). Ninguém vê **quem** reagiu.
3. **Cliente A** abre **comentários** e escreve um comentário. **Cliente B** abre os comentários e vê: **"Nome S."** (primeiro nome e inicial do sobrenome), **sem o nome da empresa**. Um comentário tem no máximo 1000 caracteres; HTML aparece como texto.
4. **Cliente B** clica **Denunciar** no comentário do A, escolhe o motivo e envia: passa a mostrar "Você denunciou este comentário". O cliente **não** consegue denunciar o próprio comentário.

## 6. A equipe: métricas e moderação
1. No hub (aba Publicações) aparece o aviso vermelho **"1 comentário denunciado aguarda análise"** e a publicação ganha a bandeira "1 denúncia".
2. No detalhe: **Alcance** (quantos clientes leram de quantos têm acesso), **Reações**, **Comentários** e **Empresas** (com ao menos 1 leitura). A leitura é registrada quando a publicação aparece na tela do cliente.
3. Em **Comentários e moderação**: o comentário denunciado fica destacado, com a empresa do autor e o motivo mais citado. **Manter** dispensa a denúncia (o comentário continua). **Ocultar** exige um motivo: o comentário **some para os outros clientes**, mas **não é apagado**: o **autor continua vendo** o próprio comentário com o aviso "A equipe ocultou este comentário" e o motivo. **Reexibir** desfaz.
4. **Bloquear comentários** (na publicação): ninguém mais comenta nela (os comentários existentes continuam visíveis); **Liberar comentários** desfaz.
5. **Chave geral:** Configurações → Portal do Cliente → desligue **"Permitir comentários nas publicações"**: ninguém comenta em nenhuma publicação. Religue ao terminar.

## 7. Permissões
1. Crie um perfil só com **`portal.moderar`**: ele vê a aba Publicações e a moderação, mas **não** vê "Nova publicação" nem "Editar".
2. Crie um perfil só com **`portal.publicar`**: escreve e edita, mas **não** vê os comentários nem a moderação, e não vê as abas Chamados e Acessos.
3. Sem nenhuma das três permissões do portal (`ver`, `publicar`, `moderar`): o menu não mostra o Portal e a tela volta ao início.

## 8. Isolamento
1. Com o cliente A, abra o endereço de uma publicação do **alcance só da empresa B** (peça o id ao banco ou ao detalhe): o portal responde "não encontrada".
2. Em uma publicação "Todos os clientes", o cliente vê **só os próprios** estados de reação (quais ele marcou), nunca os de outro.

## 9. Se algo falhar
| Sintoma | Causa provável |
|---|---|
| A publicação agendada não publica | O worker está parado ou sem o job `publicar-agendadas` (veja o log do worker); a função `app_publicar_agendadas` não existe (migração 0034 não rodou) |
| O cliente não vê a publicação | Ela está em rascunho/agendada, ou o alcance não inclui a empresa dele |
| "Comentários fechados" | Publicação bloqueada ou chave geral desligada |
| O botão Nova publicação não aparece | O perfil não tem `portal.publicar` |
