# Teste de carga do mapa (21/10/2026)

> Critério de pronto da Etapa 3 da trava do mapa (`runbook_observabilidade.md`, seção 9): **6.000 empresas fictícias** geocodificadas, **2 minutos** de arrastar e dar zoom sem parar, contra as **imagens de produção**, com a API estável (memória, sockets e pool planos), nenhum erro e **p95 do `GET /v1/mapa/pontos` abaixo de 300 ms**.

## Como rodar
```bash
pnpm imagens:testar --carga antes     # constrói as imagens do commit atual e roda
pnpm imagens:testar --sem-build --carga depois   # reaproveita as imagens
# CARGA_SAIDA=/caminho/resultado.json grava o resultado completo; CARGA_SEGUNDOS (120) e CARGA_EMPRESAS (6000) ajustam
```
O script (`apps/web/scripts/carga-mapa.mjs`) cria uma conta pelo primeiro acesso, ativa o 2FA pela API, insere as 6.000 empresas por SQL (8 "cidades" em volta de um ponto do arquivo de mapa de teste, 60% Cliente e 40% Prospect, um terço com visita) e abre o `/mapa` num Chromium 1366×768. Os gestos (arrastar de até 300 px, roda do mouse de 1 a 4 vezes, e a cada 25 gestos um afastamento até mostrar mais que o mundo) saem de uma sequência fixa (semente `20261021`): o "antes" e o "depois" fazem exatamente os mesmos movimentos. A API é observada a cada 10 s (cgroup do container, `/proc/net/tcp`, `pg_stat_activity`, `/health/alertas`); o tempo de cada pedido vem do navegador (`resposta completa`) e do log `request completed` da própria API.

## Resultado (mesma máquina, WSL2, Chromium com WebGL por software competindo pela CPU)
| | Antes (commit `460c5dd`) | Depois (Etapa 3) |
|---|---|---|
| Pedidos de pontos em 2 min | 76 | 65 a 68 |
| **Pedidos com erro** | **35 (46%): 400** | **0** |
| Tempo no servidor, p50 / p95 / p99 | 69 / 154 / 168 ms | 51 a 54 / **99 a 113** / 112 a 161 ms |
| Tempo no navegador, p50 / p95 / p99 | 74 / 167 / 176 ms | 59 a 64 / **108 a 130** / 118 a 179 ms |
| Peso médio da resposta | 2 KB | 207 KB (até 5.000 pontos) |
| Memória da API (início / fim / máximo) | 308 / 139* / 311 MiB | 308 a 309 / 306 a 309 / 314 a 325 MiB |
| Sockets TCP estabelecidos da API (mín–máx) | 7–8 | 7–9 |
| CLOSE_WAIT | 0 | 0 |
| Descritores de arquivo (mín–máx) | 44–48 | 45–49 |
| Conexões do banco da API | 6 | 7 |
| Pico do pool (`/health/alertas`) | 10% | 10% |
| Elementos DOM de pin (máximo) | 19 | **0** (camadas na GPU) |
| Quadros acima de 100 ms (de ~4.200) | 59 | 23 a 31 |

\* a queda final é o coletor de lixo do Node depois da carga; o máximo é o que importa.

Leitura:
- **O "antes" quebrava no afastamento:** com o mapa mais afastado que o mundo, o MapLibre devolve longitudes como -258 e 380 e a API respondia **400** (`oeste >= -180`). Era o mesmo bug que deixava os pins parados na tela anterior; agora a área enviada é presa a ±180° / ±85,05° (`components/mapa/area.ts`). Por isso o "antes" tem só 41 pedidos bem-sucedidos para comparar.
- **O servidor ficou mais barato por pedido, apesar de mandar até 100 vezes mais dados**, porque (1) a consulta parte da caixa pelo índice espacial quando ela é pequena, (2) os totais e os pontos saem de uma consulta só e (3) o `jit` do Postgres está desligado (`runbook_observabilidade.md`, "Planos da consulta de pontos").
- A API continua estável: memória, sockets, descritores, conexões e pool planos durante os 2 minutos, e `/health` ok no fim. Os pedidos de faixa do PMTiles pela API (18 a 20 no teste) vão embora quando o mapa passar a ser lido do bucket público (Etapa 2).
- O peso de 207 KB vem de a carteira de teste ter 6.000 empresas numa área só (a resposta chega no limite de 5.000 pontos): cada ponto leva ~45 bytes (`id` de 36 caracteres, posição com 6 casas, estado como posição numa lista curta e o visto).
