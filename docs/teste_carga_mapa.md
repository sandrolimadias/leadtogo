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
Três medições, todas com as mesmas 6.000 empresas e os mesmos gestos: **antes** (commit `460c5dd`, pins e bolhas em elementos DOM, agrupamento no navegador não existia), **Etapa 3** (pins em camadas do MapLibre; 2 execuções) e **níveis** (22/10/2026: bolha por município, depois por bairro, depois pins; contadas no servidor).

| | Antes | Etapa 3 (2 execuções) | Níveis (22/10) |
|---|---|---|---|
| Pedidos de pontos em 2 min | 76 | 65 a 68 | 64 |
| **Pedidos com erro** | **35 (46%): 400** | **0** | **0** |
| Servidor p50 / **p95** / p99 | 69 / **154** / 168 ms | 51–54 / **99–113** / 112–161 ms | 52 / **81** / 84 ms |
| Navegador p50 / **p95** / p99 | 74 / **167** / 176 ms | 59–64 / **108–130** / 118–179 ms | 57 / **87** / 95 ms |
| Peso da resposta | 2 KB | até ~207 KB (5.000 pontos) | 0,2 a 20 KB (bolhas) |
| Memória da API (início / fim / máximo) | 308 / 139* / 311 MiB | 308 a 309 / 306 a 309 / 314 a 325 MiB | 315 / 314 / 315 MiB |
| Sockets TCP estabelecidos (mín–máx) / CLOSE_WAIT | 7–8 / 0 | 7–9 / 0 | 6–8 / 0 |
| Descritores de arquivo (mín–máx) | 44–48 | 45–49 | 44–48 |
| Conexões do banco da API | 6 | 7 | 7 |
| Pico do pool (`/health/alertas`) | 10% | 10% | 10% |
| Elementos DOM de pin (máximo) | 19 | **0** | **0** |
| Quadros acima de 100 ms (de ~4.200) | 59 | 23 a 31 | 8 |

\* a queda final é o coletor de lixo do Node depois da carga; o máximo é o que importa.

Leitura:
- **O "antes" quebrava no afastamento:** com o mapa mais afastado que o mundo, o MapLibre devolve longitudes como -258 e 380 e a API respondia **400** (`oeste >= -180`). A área enviada agora é presa a ±180° / ±85,05° (`components/mapa/area.ts`). Por isso o "antes" tem só 41 pedidos bem-sucedidos para comparar.
- **A API fica estável nas três:** memória, sockets, descritores, conexões e pool planos durante os 2 minutos, e `/health` ok no fim.
- **Com os níveis o servidor trabalha menos por pedido:** o agrupamento é um `GROUP BY` (município ou município + bairro) sobre as empresas da caixa, e só o nível dos pins manda pontos. O peso da resposta cai de ~200 KB para poucos KB nos níveis de longe.
- **O mapa base do teste vem de um servidor HTTPS local** (`apps/web/scripts/mapa-de-teste.mjs`, com Range, CORS e `Cache-Control` como o Garage), e o Chromium resolve `mapa.crm.aledias.com.br` para ele. Uma versão anterior do teste atendia esse domínio com `route.fulfill` do Playwright: centenas de faixas pelo CDP atrasavam em ~600 ms o fim de TODA resposta pequena do navegador (o servidor respondia em 25–40 ms), e o p95 do navegador saía falso (617 ms). O número do servidor (log da API) nunca mudou.
- O critério do script usa o p95 do navegador (o que a pessoa vê) e mostra o do servidor ao lado.
