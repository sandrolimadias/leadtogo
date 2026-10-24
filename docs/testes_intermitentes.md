# Testes intermitentes

Registro de cada falha de teste que não se repetiu ao rodar de novo, sem relação com a mudança em
andamento. Serve para decidir o que estabilizar (esperar por condição, não por tempo fixo). Cada
linha: data, onde rodou, teste, erro e o que se fez.

| Data | Onde | Teste | Erro | Resultado |
|---|---|---|---|---|
| 22/10/2026 | Gate local (commit 4 da Fase 1, perfis de acesso) | `apps/api/src/worker/worker.test.ts` › encerramento gracioso (SIGTERM) › prazo esgotado: sai no prazo e o job NÃO se perde, outro worker o conclui | `o job 1 ficou "failed" (motivo: job stalled more than allowable limit; tentativas: 1)`; no log do worker: `could not renew lock for job 1`, `Lock mismatch for job 1`, `Missing lock for job 1` | Sozinho passou (9/9); gate completo seguinte, verde |
| 22/10/2026 | Gate local (commit 6a, cadastros) | `apps/api/src/worker/worker.test.ts` › encerramento gracioso (SIGTERM) › termina o job em andamento, grava o resultado e sai com 0 (nada se perde) | `o job 1 ficou "active" (motivo: nenhum; tentativas: 0)` | Suíte da API repetida: verde (918) |
| 22/10/2026 | Gate local (commit 6b, equipe e convites) | `apps/web/src/telas/mapa/mapa.test.tsx` › Mapa: chips, pins e legenda › filtros da gaveta: visitada, vendedor, cidade, região e precisão | `expected { oeste: -40.6, sul: -20.6, …(11) } to not have property "visitada"` | Sozinho passou (26/26); suítes do web e da API repetidas: verdes |

**Plano (Ale, 22/10/2026):** depois do commit 6 da Fase 1 e antes do 7, um commit `test:` separado
estabiliza os dois arquivos: em `worker.test.ts`, esperas por condição (estado do job, chave gravada,
saída do processo) no lugar de tempos fixos, levando em conta o lock do BullMQ; em `mapa.test.tsx`,
`waitFor`/`findBy` no filtro "visitada". Sem `--no-verify`.

## Correção (commit `test:` depois do commit 6, 22/10/2026)

- **`worker.test.ts`:** o lock dos jobs nos testes era de 3 s, com a verificação de travado a cada
  1,5 s, para jobs de 3 a 6 s. A renovação do lock (a cada metade dele) atrasa com a máquina ocupada:
  o job perdia o lock no meio (ficava `active` depois do `moveToFinished` recusado, ou era dado como
  travado até o limite). Agora o lock é de 15 s, com folga; só o worker que **precisa** perder o lock
  (o que sai no prazo esgotado) fica com 3 s, e o job desse teste dura 4 s. A espera fixa de 300 ms
  depois do SIGTERM virou espera pela linha de log "encerrando"; a espera pelo segundo worker tem
  prazo largo (40 s), por condição.
- **`mapa.test.tsx`:** a nova consulta de pontos depois de mudar ou limpar os filtros passava do 1 s
  padrão do `waitFor`. O teste espera primeiro a condição visível (a contagem no botão Filtros) e
  depois a consulta, com prazo explícito de 5 s.
- **`mapa.test.tsx` (24/10/2026, Fase 2; causa de verdade):** depois do "Limpar" da gaveta de filtros, a
  consulta volta à chave sem filtros, que o TanStack Query já tem em cache. Conforme a idade dela, o app
  refaz o pedido ou não: quando não refaz, a última chamada do mock continua a dos filtros (o teste via
  `visitada` onde não devia) e nenhuma chamada nova existe (a tentativa de 23/10, que exigia uma, falhou
  no hook de pré-push). Em vez de olhar as chamadas, o teste confere o **estado da gaveta** (todos os
  campos de volta ao padrão), que não depende de tempo. Três execuções seguidas verdes.
- **`convite.test.ts` (23/10/2026, Fase 2):** primeiro e-mail da suíte completa chegou depois dos 15 s com o
  Mailpit recém-subido. A espera já é por condição; a causa provável é a partida fria do worker de teste.
  Segue na tabela abaixo como **investigar depois**, sem mudança de código.
| 22/10/2026 | Gate local (G3a, migração 0028) | `apps/api/src/worker/encerramento-importacao.test.ts` › worker: SIGTERM com dois consumidores ativos › o job comum termina e é marcado; o bloco da importação fecha na linha e agenda o próximo | `expect(await jobsDoLote()).toBe(1)`: recebeu 2 (dois jobs do lote na fila) | Sozinho passou 3 de 3; gate completo repetido (decisão do Ale). **Investigar depois** a causa das 2 entradas (próximo bloco agendado em dobro ou corrida na contagem) |
| 22/10/2026 | Gate local (G3b, "levar para offline") | `apps/api/src/health/alertas.test.ts` (os 9 testes do arquivo) | `expected 429 to be 200/401/404/503`: o limite de requisições do IP local estourou no meio do arquivo | Sozinho passou 2 de 2; gate completo repetido. **Investigar depois:** o teste não isola o IP (os testes novos usam `X-Forwarded-For` próprio) |
| 23/10/2026 | Gate local (Fase 2, commit 1: migração 0031) | `apps/api/src/worker/outbox/convite.test.ts` › convite.enviar › envia o e-mail, grava o hash do token do link e o token não fica no outbox nem no Valkey | `Nenhum e-mail para conv-…@exemplo.com em 15000 ms` (primeiro teste do arquivo, na suíte completa da API, com Mailpit e S3 de teste recém-subidos) | Sozinho passou 5 de 5, três vezes seguidas; suíte da API repetida: verde (959). A espera já é por condição (`aguardarMensagem`); falta descobrir o que atrasou o primeiro e-mail da suíte (candidata: partida fria do worker do teste) |
| 23/10/2026 | Gate local (Fase 2, commit 2: catálogo v4) | `apps/web/src/telas/mapa/mapa.test.tsx` › Mapa: chips, pins e legenda › filtros da gaveta: visitada, vendedor, cidade, região e precisão | `expected { oeste: -40.6, sul: -20.6, …(11) } to not have property "visitada"` (de novo, depois da estabilização de 22/10/2026) | Sozinho passou 26 de 26, duas vezes; a suíte do web e a da API foram repetidas: verdes (web 687, API 960). **Reincidente:** estabilizar de novo no commit de testes da Fase 2 |
