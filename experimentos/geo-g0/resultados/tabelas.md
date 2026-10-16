**Grande Vitória (26 endereços)** (melhor consulta de cada um; erro só entre os que acharam)

| Geocodificador           | Consulta | Com número                | Só rua | Só bairro/cidade | Não achou | Erro mediano (m) | p90 (m) | Pior (m) | ≤ 200 m |
| ------------------------ | -------- | ------------------------- | ------ | ---------------- | --------- | ---------------- | ------- | -------- | ------- |
| IBGE CNEFE 2022 (local)  | cheio    | 12 (10 exato + 2 interp.) | 11     | 3                | 0         | 209              | 4025    | 5776     | 12/26   |
| Nominatim (local, só ES) | sem_tipo | 7 (7 exato)               | 15     | 0                | 4         | 216              | 2183    | 10237    | 11/22   |
| Photon (local, só ES)    | sem_tipo | 9 (9 exato)               | 15     | 0                | 2         | 220              | 10902   | 28669    | 11/24   |
| Nominatim público        | sem_tipo | 9 (9 exato)               | 13     | 0                | 4         | 170              | 4361    | 21543    | 12/22   |
| Photon público           | sem_tipo | 9 (9 exato)               | 15     | 1                | 1         | 313              | 5181    | 8238     | 9/25    |

**Interior < 30 mil hab. (25 endereços)** (melhor consulta de cada um; erro só entre os que acharam)

| Geocodificador           | Consulta | Com número               | Só rua | Só bairro/cidade | Não achou | Erro mediano (m) | p90 (m) | Pior (m) | ≤ 200 m |
| ------------------------ | -------- | ------------------------ | ------ | ---------------- | --------- | ---------------- | ------- | -------- | ------- |
| IBGE CNEFE 2022 (local)  | cheio    | 12 (9 exato + 3 interp.) | 10     | 3                | 0         | 111              | 5794    | 12007    | 15/25   |
| Nominatim (local, só ES) | sem_tipo | 0                        | 15     | 1                | 9         | 215              | 1303    | 5943     | 7/16    |
| Photon (local, só ES)    | sem_tipo | 1 (1 exato)              | 18     | 2                | 4         | 218              | 1695    | 7257     | 7/21    |
| Nominatim público        | sem_tipo | 1 (1 exato)              | 12     | 4                | 8         | 147              | 6278    | 107585   | 9/17    |
| Photon público           | sem_tipo | 1 (1 exato)              | 15     | 4                | 5         | 301              | 4625    | 107585   | 8/20    |

**Efeito do formato da consulta (51 endereços; Grande Vitória + interior)**

| Geocodificador           | Consulta            | Com número                | Só rua | Só bairro/cidade | Não achou | Erro mediano (m) | p90 (m) | Pior (m) | ≤ 200 m |
| ------------------------ | ------------------- | ------------------------- | ------ | ---------------- | --------- | ---------------- | ------- | -------- | ------- |
| Nominatim (local, só ES) | cheio               | 0                         | 0      | 0                | 51        | –                | –       | –        | 0/0     |
| Nominatim (local, só ES) | limpo               | 0                         | 0      | 0                | 51        | –                | –       | –        | 0/0     |
| Nominatim (local, só ES) | sem_tipo            | 7 (7 exato)               | 30     | 1                | 13        | 215              | 2183    | 10237    | 18/38   |
| Nominatim (local, só ES) | sem_tipo_sem_numero | 1 (1 exato)               | 36     | 1                | 13        | 278              | 5943    | 122182   | 14/38   |
| Nominatim (local, só ES) | cep_numero          | 1 (1 exato)               | 13     | 20               | 17        | 2935             | 37021   | 63890    | 2/34    |
| Nominatim (local, só ES) | cep_completado      | 7 (7 exato)               | 16     | 26               | 2         | 453              | 10815   | 24942    | 13/49   |
| Nominatim (local, só ES) | estruturada         | 7 (7 exato)               | 30     | 0                | 14        | 233              | 2183    | 10237    | 17/37   |
| Photon (local, só ES)    | cheio               | 9 (9 exato)               | 15     | 1                | 26        | 191              | 2183    | 71561    | 15/25   |
| Photon (local, só ES)    | limpo               | 11 (11 exato)             | 21     | 1                | 18        | 218              | 2183    | 146001   | 15/33   |
| Photon (local, só ES)    | sem_tipo            | 10 (10 exato)             | 33     | 2                | 6         | 218              | 7257    | 28669    | 18/45   |
| Photon (local, só ES)    | sem_tipo_sem_numero | 2 (2 exato)               | 43     | 3                | 3         | 279              | 7257    | 28669    | 15/48   |
| Photon (local, só ES)    | cep_numero          | 0                         | 4      | 47               | 0         | 2283             | 26760   | 141199   | 5/51    |
| Photon (local, só ES)    | cep_completado      | 8 (8 exato)               | 15     | 27               | 1         | 461              | 10902   | 28669    | 13/50   |
| IBGE CNEFE 2022 (local)  | cheio               | 24 (19 exato + 5 interp.) | 21     | 6                | 0         | 180              | 4353    | 12007    | 27/51   |
| IBGE CNEFE 2022 (local)  | limpo               | 25 (19 exato + 6 interp.) | 20     | 4                | 2         | 165              | 4025    | 12007    | 27/49   |
| IBGE CNEFE 2022 (local)  | cep_numero          | 0                         | 0      | 42               | 9         | 420              | 9514    | 24302    | 13/42   |
| IBGE CNEFE 2022 (local)  | cep_completado      | 11 (9 exato + 2 interp.)  | 14     | 26               | 0         | 471              | 8818    | 24302    | 17/51   |

**Ordem das camadas (primeira que acha vale; 51 endereços)**

| Ordem                                                                                                                        | Exata (n; mediana; ≤100 m) | Número aprox. | Só rua       | CEP/cidade    | Todos: mediana / p90 / pior          |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------- | ------------ | ------------- | ------------------------------------ |
| A: CNEFE número → OSM número → CNEFE interpolado → rua OSM → rua CNEFE → CEP/cidade                                          | 25; 41 m; 15               | 3; 220 m; 1   | 20; 290 m; 4 | 3; 402 m; 0   | 197 / 4025 / 10488 m (não achou: 0)  |
| B: OSM número → CNEFE número → CNEFE interpolado → rua OSM → rua CNEFE → CEP/cidade                                          | 25; 33 m; 15               | 3; 220 m; 1   | 20; 290 m; 4 | 3; 402 m; 0   | 197 / 4025 / 10488 m (não achou: 0)  |
| C: só CNEFE (número → interpolado → rua → CEP)                                                                               | 19; 33 m; 14               | 5; 220 m; 2   | 21; 336 m; 5 | 6; 909 m; 0   | 180 / 4353 / 12007 m (não achou: 0)  |
| D: só OSM (Nominatim → Photon; número → rua → cidade)                                                                        | 10; 216 m; 4               | 0             | 33; 233 m; 6 | 8; 13829 m; 2 | 263 / 10237 / 24942 m (não achou: 0) |
| E: Nominatim local sozinho (número → rua → cidade)                                                                           | 7; 30 m; 4                 | 0             | 30; 248 m; 6 | 14; 575 m; 2  | 287 / 10237 / 24942 m (não achou: 0) |
| G: CNEFE número → Photon número → CNEFE interpolado → Photon rua → CNEFE rua → CEP/cidade                                    | 25; 41 m; 15               | 3; 220 m; 1   | 20; 290 m; 5 | 3; 402 m; 0   | 203 / 4353 / 28669 m (não achou: 0)  |
| H: CNEFE número → Nominatim número → Photon número → CNEFE interpolado → Nominatim rua → Photon rua → CNEFE rua → CEP/cidade | 25; 41 m; 15               | 3; 220 m; 1   | 20; 290 m; 4 | 3; 402 m; 0   | 197 / 4025 / 10488 m (não achou: 0)  |
| F: CNEFE número → Nominatim rua → CNEFE interpolado/rua → CEP/cidade                                                         | 23; 33 m; 15               | 4; 137 m; 2   | 20; 290 m; 5 | 4; 909 m; 0   | 165 / 2183 / 10488 m (não achou: 0)  |
