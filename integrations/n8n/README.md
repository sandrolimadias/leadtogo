# n8n + Leadtogo

Workflows modelo para integrar o n8n ao Leadtogo pela **API pública** (`/v1/publica/*`) e pelos **webhooks de saída**.
Plano e regras: [`docs/plano_api_aberta.md`](../../docs/plano_api_aberta.md). Documentação da API, aberta no próprio
Leadtogo: `https://crm.aledias.com.br/v1/publica/docs`.

## Workflows

| Arquivo                                                                        | O que faz                                                                                                                             | Chave (modelo de permissões)              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [`leadtogo-receber-eventos.json`](workflows/leadtogo-receber-eventos.json)     | Recebe os eventos do Leadtogo, confere a assinatura e responde 200 (ou 401)                                                           | — (usa o segredo do webhook)              |
| [`leadtogo-formulario-site.json`](workflows/leadtogo-formulario-site.json)     | Formulário do site → empresa (Lead), contato e tarefa de retorno                                                                      | _Formulário do site_ + responsável padrão |
| [`leadtogo-listar-associados.json`](workflows/leadtogo-listar-associados.json) | Todo dia, lista as empresas com Status Cliente ("Associado"), todas as páginas, um CNPJ por item: o começo da integração com o Omie   | _Leitura da carteira_                     |
| [`leadtogo-listar-empresas.json`](workflows/leadtogo-listar-empresas.json)     | Lista as empresas cadastradas (filtros opcionais: status, tag, responsável, alteradas desde), todas as páginas, uma linha por empresa | _Leitura da carteira_                     |

Para importar: n8n → **Workflows** → **Import from File**. Cada workflow tem uma nota "Leia-me" com o que ajustar.

## Uma vez só, no n8n

1. **Credencial da chave de API.** Credentials → New → **Header Auth**:
   - nome da credencial: `Leadtogo API (chave)` (é o nome que os workflows procuram);
   - _Name_: `Authorization`;
   - _Value_: `Bearer ltg_live_…` (a chave criada em Configurações → Integrações → Chaves de API).
2. **Endereço do Leadtogo.** Nos nós **Configuração**, o padrão é `https://crm.aledias.com.br`. Com o n8n na mesma
   rede Docker do Coolify, prefira o endereço interno da API (ex.: `http://<container-da-api>:3000`).
3. **Conferir a assinatura dos webhooks.** O nó _Code_ usa o módulo `crypto` do Node: no container do n8n, defina
   `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (e reinicie).

## Chamar a API

- Cabeçalho `Authorization: Bearer ltg_live_…` (a credencial acima). Nunca ponha a chave na URL.
- Campos em português e `snake_case`; datas ISO 8601; dinheiro como texto (`"350.00"`).
- **Tags pela chave do sistema** (`lead`, `prospect`, `cliente`, `inativo`, `visitada`, `contactada`), não pelo nome:
  a empresa pode renomear "Cliente" para "Associado" sem quebrar o workflow.
- **Listas paginadas:** `limite` (até 200) e `cursor`. No nó HTTP Request, use _Pagination_ → _Update a Parameter in
  Each Request_ → `cursor` = `{{ $response.body.proximo_cursor }}` e _Complete When_ =
  `{{ !$response.body.proximo_cursor }}` (o workflow de associados já vem assim).
- **Não duplicar:** mande `Idempotency-Key` nos POST (repetir a mesma chave devolve a mesma resposta por 24 h) e
  `id_externo` nas atividades (repetir devolve a existente).
- **Limites por chave:** 120 requisições por minuto e 20.000 por dia. Passou: 429 com `Retry-After`. Em lotes, use
  `POST /v1/publica/empresas/lote` (até 500 empresas por chamada).
- **Erros:** trate pelo código em `erro` (`chave_invalida`, `escopo_insuficiente`, `responsavel_obrigatorio`,
  `empresa_nao_encontrada`...), não pela mensagem.

## Receber eventos (webhooks)

1. Importe `leadtogo-receber-eventos.json`, ative e copie a **URL de produção** do nó _Leadtogo: evento_.
2. No Leadtogo, Configurações → Integrações → Webhooks → **Novo webhook**: a URL, a descrição e os eventos.
3. Copie o segredo (`whsec_…`, mostrado uma vez) para o nó **Conferir assinatura**.
4. Use **Enviar teste** no Leadtogo e veja a execução no n8n (evento `webhook.teste`).

O corpo é o envelope:

```json
{
  "id": "0193…",
  "tipo": "empresa.tag_alterada",
  "versao": 1,
  "ocorrido_em": "2026-10-28T12:00:00.000Z",
  "empresa_tenant": { "id": "…", "nome": "…" },
  "ator": { "tipo": "integracao", "id": "…", "nome": "Integração: n8n — Omie" },
  "dados": {
    "empresa": { "id": "…", "documento": "…", "status": { "chave_sistema": "cliente" } },
    "alteracoes": { "adicionadas": [], "removidas": [] }
  }
}
```

- **Deduplique pelo `id`**: a entrega é "pelo menos uma vez" e sem ordem garantida.
- **Evite laço:** se o próprio workflow mexe no Leadtogo com a chave dele, ignore os eventos em que `ator.tipo` é
  `integracao` e `ator.id` é o membro dessa chave.
- Responda 2xx em até 10 s. Outro status (ou tempo esgotado) faz o Leadtogo tentar de novo em 1 min, 5 min, 30 min,
  2 h, 6 h, 12 h e 24 h; responder **410** desliga o webhook.
- O n8n na rede interna (`http://n8n:5678/...`) só é aceito se o host estiver em `WEBHOOK_HOSTS_INTERNOS` no Leadtogo;
  pelo domínio público, use `https`.

## Versionar

Os workflows deste diretório são o modelo. Ao mudar um workflow no n8n que pertence ao Leadtogo, exporte
(_Download_) e substitua o arquivo aqui, sem credenciais nem segredos (o export do n8n leva só o nome da credencial).
