# Roteiro de teste: Central de chamados (Fase 2)

> Para o Ale testar em produção, depois do push da Fase 2. Regras em `funcionalidades.md` (seção 9B); tabelas em `modelagem_banco.md` ("Central de chamados"); catálogo de permissões em `packages/shared/src/permissoes.ts` (versão 4).
> **Antes de tudo:** confira as variáveis e o ClamAV no Coolify (seção 0) e rode a verificação no servidor (seção 1). Depois teste **como Administrador** (seções 2 a 11) e **como um segundo usuário** com um perfil criado por você (seção 12). Use duas janelas (uma anônima) com dois usuários seus.
> **O que muda para quem já usa:** nada. Só o **Administrador** recebe as permissões dos chamados; Gestor e Vendedor só ganham se você marcar nas Configurações → Perfis de acesso. A migração 0031 só **acrescenta** (nenhuma coluna ou tabela existente some).

## 0. Antes do deploy (Coolify)
1. **Backup Now** do banco (já feito para a 0031; repita se passou muito tempo).
2. Variáveis novas na API **e no worker** (a lista está no `.env.example`):
   - `S3_PUBLIC_ENDPOINT` = `https://files.crm.aledias.com.br` (endereço que o **navegador** alcança, para as URLs pré-assinadas de envio e download).
   - `CLAMAV_HOST` = nome do serviço do ClamAV na rede do Coolify; `CLAMAV_PORT` = `3310`; `CLAMAV_TIMEOUT_MS` = `120000`.
   Sem `CLAMAV_HOST`, **os anexos ficam desligados** ("Envio de anexos ainda não configurado") e o resto dos chamados funciona.
3. **ClamAV:** suba o serviço `clamav/clamav:1.4` (porta 3310, só rede interna) com `CLAMD_CONF_StreamMaxLength=30M` e `CLAMD_CONF_MaxFileSize=30M`. Precisa de **~1,5 GB de RAM** e, na primeira subida, baixa as assinaturas (alguns minutos): espere o healthcheck ficar verde antes de testar anexos.
4. **CORS do bucket de arquivos** (o navegador envia direto ao Garage): liberar `PUT` e `GET` para `https://crm.aledias.com.br` no bucket `leadtogo-arquivos` (mesmo procedimento do bucket do mapa, `roteiro_mapa_publico.md`). Sem isso o envio de anexo falha no navegador com erro de CORS.
5. Conferir a CSP do web (`docker/web.Caddyfile`): `connect-src` precisa incluir `https://files.crm.aledias.com.br`.

## 1. Verificação no servidor (terminal da VPS)
Conecte ao banco como no `runbook_e13.md`, seção 4.6:
```sql
-- 1) Empresas sem as 4 áreas padrão ou sem a marca (esperado: 0 linhas)
SELECT t.id, t.razao_social, c.chamados_padroes_criados_em,
       (SELECT count(*) FROM areas_atendimento a WHERE a.tenant_id = t.id AND a.chave_sistema IS NOT NULL) AS areas
FROM tenants t LEFT JOIN tenant_configuracoes c ON c.tenant_id = t.id
WHERE c.chamados_padroes_criados_em IS NULL
   OR (SELECT count(*) FROM areas_atendimento a WHERE a.tenant_id = t.id AND a.chave_sistema IS NOT NULL) < 4;

-- 2) Toda empresa com expediente (segunda a sexta) e feriados nacionais (esperado: 0 linhas)
SELECT t.id FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM calendario_expediente e WHERE e.tenant_id = t.id)
   OR NOT EXISTS (SELECT 1 FROM feriados f WHERE f.tenant_id = t.id);

-- 3) Triagem criada e desligada em todas (esperado: 0 linhas)
SELECT t.id FROM tenants t LEFT JOIN config_triagem g ON g.tenant_id = t.id WHERE g.tenant_id IS NULL OR g.ativa;

-- 4) Perfis de sistema atualizados para o catálogo v4 (esperado: Administrador com as 8 chaves chamados.*)
SELECT p.nome, count(*) FILTER (WHERE pp.permissao LIKE 'chamados.%') AS chaves_chamados
FROM perfis_acesso p LEFT JOIN perfil_permissoes pp ON pp.perfil_id = p.id
WHERE p.sistema GROUP BY p.id, p.nome ORDER BY 1;

-- 5) O histórico não pode ser alterado nem apagado pela aplicação (esperado: nenhum privilégio de UPDATE/DELETE)
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'chamado_eventos' AND grantee = 'leadtogo_app';
```
- Nos itens 1 a 3, o backfill roda no **start da API**; se aparecer linha, reinicie a API e repita.
- Item 4: Administrador com **8**; Gestor e Vendedor com **0**.
- Item 5: só `SELECT` e `INSERT` (e `REFERENCES`/`TRIGGER` se houver), **sem** `UPDATE` nem `DELETE`.
- No log da API (Coolify), **nenhum** "Aviso: padrões não criados para a empresa".

## Parte A: como Administrador

### 2. Menu e Configurações → Chamados
1. O menu lateral tem **Chamados** (ícone de boia). No celular, ele fica em **Mais**.
2. **Configurações → Chamados** abre com três abas: **Áreas**, **Triagem** e **Expediente e feriados**.
3. **Áreas:** Jurídico, Financeiro, Comercial e Administrativo, **sem metas** ("Resposta: —", "Resolução: —") e "Ninguém definido".
4. **Nova área** → "Suporte", metas em branco → **Salvar**. A área aparece. **Editar** → coloque meta de resposta **60** e de resolução **480** → Salvar (a lista passa a mostrar "1 h" e "8 h").
5. **Quem atende** (no Jurídico): marque você e uma segunda pessoa, marque uma delas como **Gestor da área**, e um **perfil inteiro** se quiser → Salvar.
6. Tente **Excluir** a área "Suporte" (nunca usada): sai. Depois que um chamado existir numa área, **Excluir** recusa ("já teve chamados; inative em vez de excluir") e a saída é editar e desmarcar **Ativa**.

### 3. Abrir e atender (triagem desligada)
1. **Chamados → Abrir chamado:** assunto "Revisar contrato", área **Jurídico**, prioridade Normal → **Abrir chamado**. Abre o detalhe com o estado **Pendente de atendimento**.
2. O número aparece como **CH-0001** (sequencial por empresa).
3. **Assumir** → o estado vira **Em atendimento** e você aparece como responsável. A linha do tempo (**Histórico**) mostra "aberto" e "assumido".
4. **Responder:** escreva "Recebi, começo hoje." → **Enviar**. A mensagem aparece em **Conversa**. O histórico registra a **primeira resposta** (uma vez só).
5. **Nova nota interna:** "Cliente costuma atrasar a documentação." → **Salvar nota**. A nota aparece em **Notas internas** (fundo de aviso) e **nunca** na Conversa.
6. **Mudar o estado → Aguardando cliente** (o prazo pausa), depois **Em atendimento**, depois **Resolvido**. Cada passo entra no histórico.
7. Em **Resolvido** aparece **Reabrir** (vale por **7 dias**). Reabra: o estado volta a **Em atendimento** e o contador de reaberturas sobe. Resolva de novo e passe para **Fechado**: não há mais ações.

### 4. Anexos e antivírus
1. No detalhe, em **Responder**, **Anexar arquivos**: escolha um PDF pequeno → **Enviar**. O anexo aparece com a marca "Em verificação" e, em segundos, vira baixável (**Baixar …**).
2. **Limites:** até **5 arquivos** por mensagem e **25 MB** cada. Um arquivo maior é recusado antes do envio.
3. **Infectado:** baixe o arquivo de teste **EICAR** (eicar.org, inofensivo, existe só para testar antivírus), anexe e envie. Ele fica **"Bloqueado: vírus"**, **não baixa** e o histórico registra o evento. Um anexo ainda em verificação também **não baixa** ("em verificação").
4. Se o ClamAV estiver fora do ar, o envio responde "Envio de anexos indisponível"; nada é aceito sem varredura.

### 5. Triagem ligada
1. **Configurações → Chamados → Triagem:** ligue **Triagem ligada**, escolha **você** em "Pessoas que fazem a triagem" (e/ou um **perfil**) → **Salvar**. Ligar sem ninguém é recusado.
2. **Abrir chamado** sem escolher a área ("Não sei"): ele entra em **Aguardando triagem** e só quem tria o vê, na aba **Triagem**. Em **Triar**, escolha a área (e, se quiser, o responsável): o estado vira **Pendente**.
3. Marque a área **Comercial** como **Pula a triagem** (Editar) e abra um chamado nela: vai **direto** para a área. Chamado sem área sempre passa pela triagem.
4. Desligue a triagem de novo: os próximos caem direto na área; os que já esperavam triagem continuam na aba **Triagem**.

### 6. Atribuir
1. Num chamado **Pendente**, **Atribuir…** → escolha uma pessoa da área → o responsável muda (o estado **não** muda: só **Assumir** coloca em atendimento) e o histórico registra "atribuído".
2. Quem só **atende** (sem permissão de atribuir) enxerga **Assumir**, mas não **Atribuir…**.

### 7. Notificações
1. O **sino** (cabeçalho) mostra o contador e a lista. Ao ser atribuído um chamado ou receber uma mensagem de outra pessoa, o contador sobe **sem recarregar a página** (tempo real).
2. Clicar numa notificação abre o chamado e a marca como lida; **Marcar todas como lidas** zera o contador. Você **nunca** é avisado do que você mesmo fez.
3. Chega também **e-mail** (confira a caixa e o Mailpit/Resend): atribuição, mensagem nova, aguardando cliente, resolvido e reaberto levam link direto ao chamado.
4. O **Web Push** (notificação no aparelho) **não** faz parte desta fase.

### 8. Lista e card do painel
1. A lista tem as abas **Triagem**, **Pendentes**, **Meus** e **Todos**, com a contagem em cada uma; busca por **número** (CH-0001 ou 1) ou parte do assunto; filtros de estado, área, prioridade e responsável; paginação.
2. O **Dashboard** tem o card **Chamados pendentes** (total e os primeiros, com a marca de **Urgente**) e o link **Ver todos**.

### 9. Métricas e CSV
1. **Chamados → Métricas:** período padrão dos últimos 30 dias. Veja: total, abertos, tempo até a 1ª resposta, tempo de resolução, dias em aberto, % de resposta e de resolução no prazo, e as tabelas **Por área** e **Por responsável**.
2. Os tempos contam **só o expediente** (segunda a sexta, 8h às 18h por padrão, sem feriados) e não contam o tempo em **Aguardando cliente**. Meta vazia na área = "—" no % de prazo.
3. **Exportar CSV:** abre o arquivo no Excel (separador `;`, acentos corretos). Uma célula que comece com `=`, `+`, `-` ou `@` vem como texto (proteção contra fórmula).
4. Confira o **dia da empresa**: um chamado aberto às 22h de Brasília entra no dia, não no seguinte.

### 10. Expediente e feriados
1. **Expediente e feriados:** segunda a sexta 08:00 às 18:00; sábado e domingo "Sem expediente".
2. Em **Segunda-feira**, **Faixa** → crie uma segunda faixa (12:00 às 13:00) e ajuste a primeira para 08:00 às 12:00 e a nova para 13:00 às 18:00; **Salvar expediente**. Faixas que se sobrepõem são recusadas.
3. A lista de feriados traz os nacionais ("todo ano" nos fixos). **Acrescentar feriado** (data, nome, "Todo ano" ou não); **Excluir** tira da lista.
4. **Gerar feriados móveis do ano** (Carnaval, Sexta-feira Santa, Corpus Christi): rodar de novo para o mesmo ano **não duplica**. **Faça isso uma vez por ano** (a geração automática anual está no backlog).

### 11. Sem prazo, sem alerta
1. Com as metas das áreas em branco (padrão), o detalhe **não** mostra prazo nem alerta de atraso.
2. Defina meta de resposta de 60 min no Jurídico, abra um chamado e veja o prazo de resposta no detalhe; ele só conta dentro do expediente.

## Parte B: outro perfil e isolamento

### 12. Permissões
1. **Configurações → Perfis de acesso:** crie o perfil **Atendimento** só com `chamados.ver`, `chamados.criar` e `chamados.atender` (alcance **Todas**), e associe a um segundo usuário.
2. Esse usuário vê **Chamados** no menu, abre chamados e assume os da área, mas **não** vê Configurações → Chamados, **Atribuir…**, **Triar** nem **Métricas**. Digitar `/configuracoes/chamados` ou `/chamados/metricas` volta para a tela anterior.
3. Um usuário **sem** `chamados.ver`: o menu **não** mostra Chamados, o endereço `/chamados` volta ao início e a API responde **403 `acesso_negado`**.
4. Quem **abre** um chamado e não atende só enxerga os **seus** (solicitante); o chamado de outra pessoa dá "não encontrado".
5. **Outra empresa** (conta de outro tenant, se tiver): nunca vê chamados, áreas, notas nem anexos desta.

## Se algo não bater
- Anexo "em verificação" para sempre: o worker não alcança o ClamAV (`CLAMAV_HOST`/porta, serviço fora do ar ou ainda baixando as assinaturas). Os anexos pendentes são varridos quando o serviço volta.
- Envio de anexo falha no navegador: CORS do bucket ou `S3_PUBLIC_ENDPOINT` errado.
- Sino não atualiza sozinho: o proxy está cortando a conexão `text/event-stream` (a rota é `/v1/notificacoes/fluxo`); o sino continua funcionando ao recarregar.
- Métricas vazias com chamados existentes: confira o período e o seu alcance em `chamados.ver_metricas` (própria, equipe ou todas).
