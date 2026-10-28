# Roteiro de teste: API aberta (chaves de API, API pública e webhooks)

> Fases I1 a I4 de [`plano_api_aberta.md`](plano_api_aberta.md). Faça depois do deploy, com um usuário **Administrador**
> que tenha a verificação em duas etapas ativa. Onde aparece `https://crm.aledias.com.br`, use o endereço do ambiente.
> Ferramentas: o próprio n8n (ou `curl` no terminal).

## 0. Antes de começar (servidor)

1. No Coolify, confira que a API e o worker subiram na versão nova (migrações 0038, 0039 e 0040 aplicadas no start
   da API).
2. Variáveis (API **e** worker): `TOKEN_ENCRYPTION_KEY` (já existe) e, se o n8n for chamado pela rede interna,
   `WEBHOOK_HOSTS_INTERNOS=n8n:5678` (troque pelo nome e porta do container do n8n). Sem a lista, só `https` público.
3. Abra `https://crm.aledias.com.br/v1/publica/docs`: a documentação da API pública aparece **sem login**.

## 1. Chaves de API (I1)

1. Configurações → **Integrações** → aba **Chaves de API** → **Nova chave**: nome "n8n — teste", clique no modelo
   **Leitura da carteira**, marque também **Cadastrar empresas** e **Editar empresas**. Criar.
2. A chave aparece **uma vez** (`ltg_live_…`). Copie e clique em **Já guardei**. Na lista, só o prefixo.
3. Teste a chave:
   ```bash
   curl -s https://crm.aledias.com.br/v1/publica/eu -H "Authorization: Bearer ltg_live_COLE_A_CHAVE"
   ```
   Esperado: a empresa, o nome da chave, as permissões e os limites (120/min, 20.000/dia).
4. Sem a chave ou com uma chave errada: **401** `chave_invalida`.
5. Com a chave, chame uma rota interna (`/v1/carteira/empresas`): **401** (a chave não serve no app). Logado no app,
   abra `/v1/publica/eu` no navegador: **401** (a sessão não serve na API pública).
6. **Editar** a chave e tirar "Cadastrar empresas": `POST /v1/publica/empresas` passa a dar **403**
   `escopo_insuficiente`.
7. **IPs permitidos**: ponha um IP qualquer que não seja o seu; a chamada dá 401. Volte a lista ao vazio.
8. **Rotacionar** com prazo 1 dia: aparece uma chave nova; as duas funcionam; a antiga fica "Substituída".
9. **Revogar** a antiga: ela para na hora (401).
10. Configurações → Usuários e equipe: o membro "Integração: n8n — teste" **não** aparece (nem com inativos).

## 2. API pública (I2)

Com a chave do passo 1 (com cadastrar e editar empresas):

1. Defina o **responsável padrão** da chave (Editar) ou mande `responsavel_email` no corpo.
2. Criar uma empresa:
   ```bash
   curl -s -X POST https://crm.aledias.com.br/v1/publica/empresas \
     -H "Authorization: Bearer ltg_live_COLE_A_CHAVE" -H "Content-Type: application/json" \
     -H "Idempotency-Key: teste-1" \
     -d '{"documento":"COLE_UM_CNPJ_VALIDO","razao_social":"Teste da API Ltda"}'
   ```
   Esperado: **201**, `status.chave_sistema = lead`, `receita.situacao_nao_verificada = true` (a Receita é consultada
   pelo worker em seguida).
3. Repita o mesmo comando (mesma `Idempotency-Key`): a mesma resposta, sem empresa nova (cabeçalho
   `Idempotent-Replayed: true`). Mude o corpo e repita a chave: **409** `idempotencia_conflito`.
4. Na ficha da empresa, aba Histórico: o autor é "Integração: n8n — teste".
5. Aplique a tag Cliente pela chave do sistema (renomeada como "Associado" ou não):
   ```bash
   curl -s -X PUT https://crm.aledias.com.br/v1/publica/empresas/ID_DA_EMPRESA/tags/cliente \
     -H "Authorization: Bearer ltg_live_COLE_A_CHAVE"
   ```
   A empresa vira Cliente (Lead sai: seleção única). Tentar `visitada` dá **400** (grupo automático).
6. Liste os associados: `GET /v1/publica/empresas?status=cliente&limite=2` e siga o `proximo_cursor` até `null`.
7. Lote: `POST /v1/publica/empresas/lote` com 3 empresas, uma delas com CNPJ inválido: o resumo mostra 2 criadas e
   1 erro, e as boas entram.

## 3. Webhooks (I3)

1. No n8n, importe `integrations/n8n/workflows/leadtogo-receber-eventos.json`, ative e copie a URL de produção.
2. Leadtogo → Integrações → **Webhooks** → **Novo webhook**: a URL do n8n, eventos "Empresa criada" e "Tag da
   empresa alterada". O segredo (`whsec_…`) aparece uma vez: cole no nó **Conferir assinatura** do n8n.
3. **Enviar teste**: no n8n chega `webhook.teste` e a execução passa por "Assinatura válida? → Responder 200". No
   Leadtogo, **Entregas** mostra "Entregue" com HTTP 200.
4. Crie uma empresa (pela API ou pelo app): chega `empresa.criada` com `dados.empresa`. Aplique uma tag: chega
   `empresa.tag_alterada` com o que entrou e o que saiu.
5. Troque o segredo no n8n por um errado e envie teste: o n8n responde 401 e a entrega fica "Pendente" com nova
   tentativa em 1 min. Corrija o segredo e clique em **Reenviar**: "Entregue".
6. **Trocar segredo**: por 24 h as entregas levam as duas assinaturas; atualize o n8n com o novo.
7. Desative o workflow no n8n (a URL passa a dar 404) e crie empresas: as entregas falham e reagendam. Reative e
   use **Reenviar as falhas**.
8. URL interna (`http://10.0.0.5/...`) ao cadastrar: recusada (**422**).

## 4. Pacote do n8n (I4)

1. Credencial **Header Auth** "Leadtogo API (chave)": `Authorization` = `Bearer ltg_live_…`.
2. Importe `leadtogo-formulario-site.json`, ajuste a URL no nó **Configuração** e envie um POST de teste para a URL
   do nó *Formulário do site* com `cnpj`, `empresa`, `nome`, `email`, `telefone`, `mensagem`: a empresa (Lead), o
   contato e a tarefa "Retornar o contato do site" aparecem no Leadtogo.
3. Importe `leadtogo-listar-associados.json` e execute à mão: um item por associado (CNPJ), de todas as páginas.
4. Importe `leadtogo-listar-empresas.json` e execute à mão: uma linha por empresa da carteira. Ponha `status` = `lead`
   no nó **Configuração** e execute de novo: só os Leads.

## 5. Aceite

- [ ] Chaves: criar, usar, escopo, IP, rotacionar, revogar; membro de integração fora da equipe.
- [ ] API pública: criar com idempotência, histórico com o autor "Integração", tag pela chave do sistema, cursor, lote.
- [ ] Webhooks: teste, eventos reais, assinatura conferida no n8n, falha e reenvio, troca de segredo.
- [ ] n8n: credencial e os quatro workflows importados e funcionando.
