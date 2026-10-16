# Geolocalização e rotas: relatório do G0 (qualidade da geocodificação e consumo)

> **Etapa G0, só medição.** Nada vai para produção: sem migração, sem serviço novo no Coolify. Scripts, gabarito e números em `experimentos/geo-g0/` (os arquivos públicos baixados ficam fora do git). Medido em 16/10/2026 no WSL2 do Ale (x86_64, 12 CPUs, 7,6 GiB de RAM). **Nada foi rodado em ARM** (ver seção 6). **Esta etapa termina aqui; o G1+G2 só começa com a aprovação por escrito do Ale.**

## 0. Resumo e recomendação

1. **Geocodificador: usar duas fontes em camadas, não uma só.** O **IBGE CNEFE 2022** (2,22 milhões de endereços do ES, cada um com latitude e longitude) acha o número em **24 dos 51** endereços do gabarito (12 em 26 na Grande Vitória, 12 em 25 no interior) e é a única fonte que acha número no interior (o OSM quase não tem número fora da Grande Vitória: 0 a 1 em 25). O **Nominatim local** (OSM, só ES) completa onde o CNEFE não tem o número e acha a rua.
2. **Ordem das camadas para o G1:** (1) CNEFE com número exato → (2) Nominatim com número → (3) CNEFE com número interpolado → (4) Nominatim com a rua → (5) CNEFE com o centro da rua → (6) CEP ou cidade. Com ela, nos 51 endereços: **25 exatas** (mediana de erro 41 m), **3 por interpolação**, **20 só da rua**, **3 só CEP ou cidade**, **nenhum sem resposta**; erro mediano de todos **197 m**.
3. **O Photon não entra:** na cascata completa, somar o Photon ao Nominatim não muda o resultado (ordens A e H iguais), e o Nominatim sozinho já cobre o papel de OSM. Photon só vale se o G1 precisar de busca "digitando" (autocomplete) ou de tolerância a erro de digitação.
4. **O Nominatim exige a consulta limpa.** Com o endereço como vem do CRM (`RUA X, 123, BAIRRO, CIDADE - ES, 29100-000`) o Nominatim local achou **0 de 51**. Tirando o tipo da rua, o "- ES", o bairro e o CEP (`X, 123, Cidade`), achou **7 com número e 30 só a rua**. Esta normalização é obrigatória no G1.
5. **Completar pelo CEP ajuda na Grande Vitória e quase nada no interior:** o ViaCEP devolve a rua para 23 dos 26 CEPs da Grande Vitória, mas só para 2 dos 25 do interior (CEP único do município).
6. **Cabe na VPS com folga** (conferido com o comando do Ale em 16/10/2026: aarch64, 4 CPUs, 23 GiB de RAM com **17 GiB disponíveis**, **157 GB de disco livres**). A pilha recomendada (Nominatim + OSRM + VROOM + CNEFE + PMTiles) pede cerca de 1,4 GiB de RAM (2 GiB com folga, ~12% do disponível) e cerca de 5,3 GB de disco (~3,4% do livre). **O ponto de atenção é a CPU, não a memória ou o disco:** a carga média da VPS já está em ~2,0 de 4, então o preparo pesado continua **fora da VPS**.

## 1. Acesso do ambiente
Todos os sites necessários responderam: Geofabrik, IBGE (FTP e `servicodados`), Nominatim e Photon públicos, CNES/OpenDataSUS (`apidadosabertos.saude.gov.br`), ViaCEP, BrasilAPI, Docker Hub, ghcr.io, Protomaps (`build.protomaps.com`, `build-metadata.protomaps.dev`) e GitHub releases. **Nenhum domínio precisou ser liberado.** O único ponto sem solução automática foi o **INEP** (seção 2).

## 2. Gabarito (51 endereços)
- **Fonte: CNES** (estabelecimentos de saúde, API aberta do OpenDataSUS), com a coordenada declarada pelo estabelecimento. **As escolas do INEP não entraram:** o Catálogo de Escolas só sai por um painel interativo (Oracle Analytics, `anonymousdata.inep.gov.br`), sem arquivo para baixar por script, e o `download.inep.gov.br` (microdados) não traz endereço com coordenada. Se o Ale quiser escolas no gabarito, é preciso **exportar o CSV do ES pelo painel do INEP** (passo manual) e eu acrescento.
- **26 na Grande Vitória** (Vitória 5, Viana 5, Vila Velha 4, Guarapari 4, Fundão 3, Serra 3, Cariacica 2) e **25 no interior**, em **18 municípios com menos de 30 mil habitantes** (Censo 2022), espalhados por **12 microrregiões**.
- **Casos difíceis de propósito:** 13 com "S/N" (sem número), 8 de zona rural, 30 normais; "endereço incompleto" é testado de outro jeito: a consulta **só com CEP e número** (nenhuma rua) e a versão **completada pelo CEP**.
- **Limpeza das coordenadas** (de 2.523 estabelecimentos lidos): descartados 194 sem coordenada ou zero, 208 com coordenada repetida em mais de um estabelecimento, 125 fora do município (polígono do IBGE), 18 com coordenada arredondada e 1 no centroide do município.
- **A coordenada do CNES também tem erro** (é declarada). Conferência cruzada: nos 19 endereços em que o CNEFE achou o número exato, a distância até o CNES tem mediana de **33 m** (p90 217 m); só 1 passa de 300 m (a Avenida do Canal, em Vila Velha, que existe em mais de um bairro).
- **Mapa para o Ale conferir:** `experimentos/geo-g0/gabarito/mapa.html` (abra no navegador). **Confira estes 10** (laranja no mapa): **3** (Vila Velha), **11** (Fundão), **20** (Viana, S/N), **22** (Fundão, S/N), **24** (Guarapari, rural), **28** (Ibatiba), **35** (Vila Pavão), **41** (Vargem Alta, S/N), **47** (Sooretama, rural) e **49** (Itaguaçu, rural). Olhe se o ponto cai no estabelecimento do nome que aparece no balão.

## 3. Resultados
"Com número" = achou a casa (número exato, ou interpolado no CNEFE). "Erro" = distância em metros até a coordenada do gabarito, só entre os que acharam. As consultas públicas (Nominatim e Photon) foram limitadas ao ES, a 1 requisição por segundo, com User-Agent identificado e cache em disco. Os dados são os mesmos do OSM que rodaremos (o público é um pouco mais novo e completo: na Grande Vitória achou número em 9 contra 7 do local); o local responde com mediana de 19 a 32 ms.

**Grande Vitória (26 endereços)** (melhor consulta de cada um; erro só entre os que acharam)

| Geocodificador | Consulta | Com número | Só rua | Só bairro/cidade | Não achou | Erro mediano (m) | p90 (m) | Pior (m) | ≤ 200 m |
|---|---|---|---|---|---|---|---|---|---|
| IBGE CNEFE 2022 (local) | cheio | 12 (10 exato + 2 interp.) | 11 | 3 | 0 | 209 | 4025 | 5776 | 12/26 |
| Nominatim (local, só ES) | sem_tipo | 7 (7 exato) | 15 | 0 | 4 | 216 | 2183 | 10237 | 11/22 |
| Photon (local, só ES) | sem_tipo | 9 (9 exato) | 15 | 0 | 2 | 220 | 10902 | 28669 | 11/24 |
| Nominatim público | sem_tipo | 9 (9 exato) | 13 | 0 | 4 | 170 | 4361 | 21543 | 12/22 |
| Photon público | sem_tipo | 9 (9 exato) | 15 | 1 | 1 | 313 | 5181 | 8238 | 9/25 |

**Interior < 30 mil hab. (25 endereços)** (melhor consulta de cada um; erro só entre os que acharam)

| Geocodificador | Consulta | Com número | Só rua | Só bairro/cidade | Não achou | Erro mediano (m) | p90 (m) | Pior (m) | ≤ 200 m |
|---|---|---|---|---|---|---|---|---|---|
| IBGE CNEFE 2022 (local) | cheio | 12 (9 exato + 3 interp.) | 10 | 3 | 0 | 111 | 5794 | 12007 | 15/25 |
| Nominatim (local, só ES) | sem_tipo | 0  | 15 | 1 | 9 | 215 | 1303 | 5943 | 7/16 |
| Photon (local, só ES) | sem_tipo | 1 (1 exato) | 18 | 2 | 4 | 218 | 1695 | 7257 | 7/21 |
| Nominatim público | sem_tipo | 1 (1 exato) | 12 | 4 | 8 | 147 | 6278 | 107585 | 9/17 |
| Photon público | sem_tipo | 1 (1 exato) | 15 | 4 | 5 | 301 | 4625 | 107585 | 8/20 |

**Efeito do formato da consulta (51 endereços; Grande Vitória + interior)**

| Geocodificador | Consulta | Com número | Só rua | Só bairro/cidade | Não achou | Erro mediano (m) | p90 (m) | Pior (m) | ≤ 200 m |
|---|---|---|---|---|---|---|---|---|---|
| Nominatim (local, só ES) | cheio | 0  | 0 | 0 | 51 | – | – | – | 0/0 |
| Nominatim (local, só ES) | limpo | 0  | 0 | 0 | 51 | – | – | – | 0/0 |
| Nominatim (local, só ES) | sem_tipo | 7 (7 exato) | 30 | 1 | 13 | 215 | 2183 | 10237 | 18/38 |
| Nominatim (local, só ES) | sem_tipo_sem_numero | 1 (1 exato) | 36 | 1 | 13 | 278 | 5943 | 122182 | 14/38 |
| Nominatim (local, só ES) | cep_numero | 1 (1 exato) | 13 | 20 | 17 | 2935 | 37021 | 63890 | 2/34 |
| Nominatim (local, só ES) | cep_completado | 7 (7 exato) | 16 | 26 | 2 | 453 | 10815 | 24942 | 13/49 |
| Nominatim (local, só ES) | estruturada | 7 (7 exato) | 30 | 0 | 14 | 233 | 2183 | 10237 | 17/37 |
| Photon (local, só ES) | cheio | 9 (9 exato) | 15 | 1 | 26 | 191 | 2183 | 71561 | 15/25 |
| Photon (local, só ES) | limpo | 11 (11 exato) | 21 | 1 | 18 | 218 | 2183 | 146001 | 15/33 |
| Photon (local, só ES) | sem_tipo | 10 (10 exato) | 33 | 2 | 6 | 218 | 7257 | 28669 | 18/45 |
| Photon (local, só ES) | sem_tipo_sem_numero | 2 (2 exato) | 43 | 3 | 3 | 279 | 7257 | 28669 | 15/48 |
| Photon (local, só ES) | cep_numero | 0  | 4 | 47 | 0 | 2283 | 26760 | 141199 | 5/51 |
| Photon (local, só ES) | cep_completado | 8 (8 exato) | 15 | 27 | 1 | 461 | 10902 | 28669 | 13/50 |
| IBGE CNEFE 2022 (local) | cheio | 24 (19 exato + 5 interp.) | 21 | 6 | 0 | 180 | 4353 | 12007 | 27/51 |
| IBGE CNEFE 2022 (local) | limpo | 25 (19 exato + 6 interp.) | 20 | 4 | 2 | 165 | 4025 | 12007 | 27/49 |
| IBGE CNEFE 2022 (local) | cep_numero | 0  | 0 | 42 | 9 | 420 | 9514 | 24302 | 13/42 |
| IBGE CNEFE 2022 (local) | cep_completado | 11 (9 exato + 2 interp.) | 14 | 26 | 0 | 471 | 8818 | 24302 | 17/51 |

**Ordem das camadas (primeira que acha vale; 51 endereços)**

| Ordem | Exata (n; mediana; ≤100 m) | Número aprox. | Só rua | CEP/cidade | Todos: mediana / p90 / pior |
|---|---|---|---|---|---|
| A: CNEFE número → OSM número → CNEFE interpolado → rua OSM → rua CNEFE → CEP/cidade | 25; 41 m; 15 | 3; 220 m; 1 | 20; 290 m; 4 | 3; 402 m; 0 | 197 / 4025 / 10488 m (não achou: 0) |
| B: OSM número → CNEFE número → CNEFE interpolado → rua OSM → rua CNEFE → CEP/cidade | 25; 33 m; 15 | 3; 220 m; 1 | 20; 290 m; 4 | 3; 402 m; 0 | 197 / 4025 / 10488 m (não achou: 0) |
| C: só CNEFE (número → interpolado → rua → CEP) | 19; 33 m; 14 | 5; 220 m; 2 | 21; 336 m; 5 | 6; 909 m; 0 | 180 / 4353 / 12007 m (não achou: 0) |
| D: só OSM (Nominatim → Photon; número → rua → cidade) | 10; 216 m; 4 | 0 | 33; 233 m; 6 | 8; 13829 m; 2 | 263 / 10237 / 24942 m (não achou: 0) |
| E: Nominatim local sozinho (número → rua → cidade) | 7; 30 m; 4 | 0 | 30; 248 m; 6 | 14; 575 m; 2 | 287 / 10237 / 24942 m (não achou: 0) |
| G: CNEFE número → Photon número → CNEFE interpolado → Photon rua → CNEFE rua → CEP/cidade | 25; 41 m; 15 | 3; 220 m; 1 | 20; 290 m; 5 | 3; 402 m; 0 | 203 / 4353 / 28669 m (não achou: 0) |
| H: CNEFE número → Nominatim número → Photon número → CNEFE interpolado → Nominatim rua → Photon rua → CNEFE rua → CEP/cidade | 25; 41 m; 15 | 3; 220 m; 1 | 20; 290 m; 4 | 3; 402 m; 0 | 197 / 4025 / 10488 m (não achou: 0) |
| F: CNEFE número → Nominatim rua → CNEFE interpolado/rua → CEP/cidade | 23; 33 m; 15 | 4; 137 m; 2 | 20; 290 m; 5 | 4; 909 m; 0 | 165 / 2183 / 10488 m (não achou: 0) |

**Como ler**
- A consulta **"cheio"** é o endereço como a pessoa cola (com tipo da rua, bairro, "Cidade - ES" e CEP); **"limpo"** tira o "S/N"; **"sem_tipo"** tira o tipo da rua, o bairro, o CEP e o "- ES" (`rua, número, cidade`); **"cep_numero"** é só o CEP e o número; **"cep_completado"** completa rua e cidade pelo ViaCEP (ou BrasilAPI) e usa o número.
- **Nominatim:** 0 de 51 com "cheio" e com "limpo". O tipo da rua do CNES muitas vezes não é o do OSM ("RUA LUCIANO DAS NEVES" no CNES, "Avenida Luciano das Neves" no OSM), e o sufixo "- ES" ou ", Espírito Santo" derruba a busca nos municípios pequenos. A "estruturada" (campos separados) com a rua sem tipo chega ao mesmo resultado da "sem_tipo".
- **Photon** é mais tolerante que o Nominatim com a consulta "cheio" (público: número em 8 e rua em 14 dos 26 da Grande Vitória; local: número em 9 dos 51). Mas na cascata não acrescenta nada ao Nominatim.
- **CNEFE:** achou algo para os 51 (24 com número). A "interpolação" entre os vizinhos do mesmo lado melhora o erro quando o número exato não existe no Censo.
- **Interior:** o OSM só tem a rua (Nominatim 0 número, Photon 1); quem dá o número é o CNEFE (9 exatos e 3 interpolados em 25).
- **Rodar local em vez de usar o público** é decisão de **previsibilidade, velocidade (20 a 30 ms) e política de uso** (a API pública limita a 1 requisição por segundo e não serve para importar milhares de endereços), não de qualidade: os níveis de acerto são parecidos.
- **BrasilAPI (coordenada do CEP):** erro mediano de 5,6 km na Grande Vitória e 0,8 km no interior: só serve como "cidade/CEP", nunca como endereço.

### Erro por camada (ordem recomendada, 51 endereços)
| Camada que respondeu | n | Erro mediano | p90 | Pior | ≤ 100 m | ≤ 300 m |
|---|---|---|---|---|---|---|
| Exata (número casado, CNEFE ou OSM) | 25 | 41 m | 652 m | 4.353 m | 15 (60%) | 21 (84%) |
| Número interpolado (CNEFE) | 3 | 220 m | 4.025 m | 4.025 m | 1 | 2 |
| Só a rua (Nominatim ou CNEFE) | 20 | 290 m | 5.943 m | 7.711 m | 4 | 10 |
| CEP ou cidade | 3 | 402 m | 10.488 m | 10.488 m | 0 | 0 |

Por dificuldade (ordem recomendada): **normais** 30: 23 exatas (mediana 33 m), 3 interpoladas, 4 só rua; **S/N** 13: 12 só rua (mediana 237 m) e 1 só cidade; **rurais** 8: 4 só rua (816 m), 1 interpolada, 3 só CEP ou cidade (402 m).

## 4. Efeito do CEP e dos casos difíceis
- **CEP completa a rua na Grande Vitória, não no interior.** ViaCEP devolveu rua para **23 de 26** (Grande Vitória) e **2 de 25** (interior); BrasilAPI, o mesmo. Onde os dois trouxeram rua, **19 de 25 são iguais** (as diferenças são grafia).
- **Ganho de completar pelo CEP** (consulta só com CEP e número): Nominatim local, de **1 com número, 13 rua e 17 sem resposta (erro mediano 2,9 km)** para **7 com número, 16 rua e 2 sem resposta (453 m)**; Photon, de **0 com número e erro mediano 2,3 km** para **8 com número (461 m)**; CNEFE, de **0 com número** para **11 (9 exatos + 2 interpolados)**. **No interior o ganho é pequeno**: o CEP é do município inteiro e a consulta cai em "cidade".
- **"S/N":** deixar o "S/N" na consulta atrapalha o OSM (Nominatim 0 de 13; Photon 6 de 13 com rua). Tirando o "S/N" e o tipo, o Nominatim acha a rua em 10 de 13 e o Photon em 13 de 13 (12 com rua e 1 com número). **Sem número só dá para chegar na rua** (mediana 237 m, mas a rua pode ser longa: o p90 passa de 5 km).
- **Zona rural:** CNES escreve "ZONA RURAL DE X" ou "RUA PRINCIPAL" (sem nome único). O OSM não acha esses logradouros e o CNEFE devolve o centro da localidade: erro típico de **400 m a 4 km**. Tem que aparecer como "aproximada" para o vendedor confirmar no mapa.
- **Dados sujos do CNES (e da Receita):** o bairro vem truncado em 20 letras ("DIVINO ESPIRITO SANT"), o tipo da rua diverge do OSM, nomes com variação ("AV CESAR PEGORETTI" e "AV CEZAR PEGORETTI" na mesma rua). **Rua com o mesmo nome em mais de um bairro** é o maior risco de erro grande com "número casado" (o pior caso, 4,3 km).

## 5. Recomendação para o G1

**Geocodificador e camadas**
1. **CNEFE 2022** (carregado numa tabela do próprio Postgres ou num arquivo à parte, 2,22 milhões de linhas; ~380 MB): busca por **CEP + rua normalizada + número**, depois só rua + número no município. Sem o número exato: **interpolação entre o vizinho de baixo e o de cima do mesmo lado** (só se a diferença for de até 200 números), senão o centro da rua.
2. **Nominatim 4.5** só com o ES (extrato do Geofabrik recortado), **importado fora da VPS e congelado** (`nominatim freeze`), em **estilo `address`**, com a consulta normalizada (sem tipo da rua, sem UF, sem bairro e sem CEP: `rua, número, cidade`).
3. **Normalização obrigatória antes de qualquer consulta:** maiúsculas e acento, tipo da rua removido e abreviações expandidas (`AV`, `R`, `DR`, `PROF`...), "S/N" e número vazio tratados como "sem número", bairro e UF fora.
4. **Cascata, primeira que achar vale:** exata (CNEFE) → exata (Nominatim) → interpolada (CNEFE) → rua (Nominatim) → rua (CNEFE) → CEP → cidade.

**Limiar "exata" × "aproximada"** (sugestão; os números são do gabarito pequeno)
- **Exata** = número casado (CNEFE com `NV_GEO_COORD` 1 ou 2, ou casa do OSM) **e** sem ambiguidade de rua (CEP ou bairro batem, ou o nome da rua só existe uma vez no município). Neste teste: 60% a menos de 100 m, 84% a menos de 300 m, mediana 41 m. Raio de incerteza para mostrar no mapa: **100 m**.
- **Aproximada** = todo o resto, com o **tipo guardado** e o raio: **interpolada** (300 m), **rua** (1 km, a rua pode ser longa), **CEP ou cidade** (5 km). Rua com nome repetido em outro bairro **vira "aproximada"** mesmo com número casado.
- O vendedor **confirma ou arrasta o ponto no mapa**; só a coordenada exata ou confirmada entra na rota sem aviso.

## 6. Consumo e viabilidade na VPS

**Medido aqui (x86_64, 12 CPUs, 7,6 GiB), com preparação fora da VPS**

| Item | Tempo de preparo | RAM no preparo (pico) | RAM em consulta | Disco (dados) | Observação |
|---|---|---|---|---|---|
| Extrato do sudeste (Geofabrik) e recorte do ES (`osmium`) | 101 s | 4,1 GiB | – | sudeste 862 MB → **ES 183 MB** | polígono do ES do IBGE, `--strategy=smart` |
| **Nominatim 4.5** (estilo `address`, só ES) | **618 s** (importação até servir, 8 threads) | **3,64 GiB** | **1,0 GiB** (após `freeze`; 1,6 a 1,9 GiB antes) | 3,7 GB importado; **283 MB** de banco (1.043 MB do diretório, **427 MB** compactado) depois do `freeze` e do `VACUUM FULL` | `planet_osm_nodes` e `ways` (3,1 GB) só servem para atualização incremental; imagem Docker 2,35 GB |
| **Photon 1.3.0** (índice só do ES, a partir do banco do Nominatim) | 66 s (115.638 documentos) | 1,67 GiB | 0,4 a 0,85 GiB (JVM com `-Xmx2g`) | **51 MB** | só dá para gerar a partir de um banco do Nominatim (os índices prontos do Photon são do planeta inteiro); imagem do Java 472 MB + 98 MB do `.jar` |
| **IBGE CNEFE 2022** (ES) | 26 s para indexar | – | desprezível (consulta em milissegundos) | zip 41,6 MB; CSV 366,6 MB; **SQLite de 380 MB** | 2.221.348 endereços com coordenada (92,3% do nível 1, "coordenada original do Censo") |
| **OSRM** (perfil `car`, MLD, só ES) | extract 129 s + partition 8 s + customize 4 s | 1,87 GiB | **250 a 305 MB** | **346 MB** (+183 MB do `.pbf`) | matriz 40×40 em 60 ms; **`--max-table-size` precisa subir** (o padrão é 100 pontos); imagem 391 MB |
| **VROOM 1.14** (com o OSRM acima) | – | – | **47 MB** | – | 100 paradas e 3 veículos: 0,5 s; 200 e 5: 2,5 s; 400 e 10: 23 s (12 CPUs; em ARM será mais lento); imagem 447 MB |
| **PMTiles do ES** (Protomaps, build de 16/10/2026) | 78 s (extrai só a caixa do ES do build remoto, sem baixar o planeta) | – | – | **382 MB** até o zoom 15; **227 MB** até o 14; 129 MB até o 13; 65 MB até o 12 | para o MapLibre, **zoom 14** basta (amplia por cima); vai no Garage |

**Imagens `linux/arm64` (conferido nos manifestos dos registros):** `mediagis/nominatim:4.5` (amd64 e arm64), `ghcr.io/project-osrm/osrm-backend` (amd64 e arm64), `ghcr.io/vroom-project/vroom-docker:v1.14.0` (amd64 e arm64), `ghcr.io/protomaps/go-pmtiles` (amd64 e arm64) e `eclipse-temurin:21-jre` (amd64, arm64 e outras) para o Photon. **Não rodei nada em ARM.**

**Previsão na VPS (pilha recomendada: Nominatim + OSRM + VROOM + CNEFE + PMTiles no Garage)**
- **RAM em uso contínuo:** Nominatim ~1,0 GiB + OSRM ~0,3 GiB + VROOM ~0,05 GiB + CNEFE (tabela no Postgres que já existe) ≈ **1,4 GiB**; com folga para picos, **~2 GiB livres**.
- **Disco:** imagens ≈ 3,2 GB (Nominatim 2,35 + OSRM 0,39 + VROOM 0,45) + dados ≈ 2,0 GB (Nominatim 1,0 + OSRM 0,35 + PMTiles 0,23 + CNEFE 0,4) ≈ **5,3 GB**, mais o PMTiles no Garage (já contado) e margem para atualizar os dados (o dobro durante a troca).
- **Sem o Nominatim** (só CNEFE para endereço): ~0,4 GiB de RAM e ~2,5 GB de disco, **mas** o número exato cai de 25 para 19 e o erro das ruas piora (p90 4,35 km no lugar de 2,2 km).
- **CPU:** o preparo pesado (importação do Nominatim, `osrm-extract`, recorte do OSM) **fica fora da VPS**: no teste levou 10 min com 8 threads; num ARM pequeno tende a levar de 3 a 5 vezes isso. Para a VPS vão **só os arquivos prontos**: o diretório do Postgres do Nominatim (**427 MB** compactado), os arquivos do OSRM (346 MB), o CNEFE (380 MB) e o PMTiles (227 MB).
- **Se não coubesse** (não é o caso, ver a seção 9): aumentar a VPS, rodar Nominatim e OSRM numa segunda máquina pequena, ou trocar o Nominatim por serviço pago só para geocodificar.

## 7. O que estava na lista "A verificar" do plano
| Item | Resultado |
|---|---|
| **CNEFE traz coordenada por endereço?** | **Sim.** `LATITUDE` e `LONGITUDE` em cada linha, com `NV_GEO_COORD` (1 = coordenada original do Censo; 2 = modificada para apartamentos; 3 = estimada; 4 = face de quadra; 5 = localidade; 6 = setor). No ES: 2.221.348 endereços, 92,3% no nível 1, 5,7% no 2, 1,4% no 3, 0,5% no 4. |
| **Tamanho do arquivo do ES** | Zip **41,6 MB**; CSV **366,6 MB**; índice SQLite de **380 MB**. |
| **Como buscar** | Normalizar o logradouro (sem acento, tipo removido, títulos expandidos) e casar por município + rua normalizada + `NUM_ENDERECO` (sem número: `NUM_ENDERECO = 0` e `DSC_MODIFICADOR = SN`); desempate pelo CEP; sem o número exato, interpolar. Implementado em `experimentos/geo-g0/scripts/cnefe_busca.py` e `normalizar.py`. |
| **Imagens `arm64`** (geocodificador, OSRM, VROOM) | **Existem** (lista na seção 6). Não testei a execução em ARM. |
| **Limite de paradas do link do Google Maps** | Pela documentação oficial ("Maps URLs", ação `dir`): **até 3 pontos intermediários (`waypoints`) em navegador de celular e até 9 nos demais casos**, separados por `|`; URL limitada a **2.048 caracteres**. Não há parâmetro para otimizar a ordem. **Não testei em aparelho.** Rota de mais de 5 paradas no celular precisa ser **dividida em trechos**. |
| **Link do Waze** | Pela documentação oficial (`waze.com/ul`): **um destino só** (`ll=lat,lon&navigate=yes`, ou `q=` para busca); **não documenta paradas intermediárias**. Rota com várias paradas no Waze = **um link por parada** (vai de uma em uma). |
| **Sem confirmação** | (1) Escolas do INEP (seção 2). (2) A **licença de uso** do CNEFE (o IBGE publica como dados abertos, mas não li o termo: confirmar antes de embarcar o arquivo no produto). (3) **Desempenho real em ARM** (a VPS tem 4 CPUs ARM; os tempos medidos aqui são de x86 com 12 CPUs, e os números de RAM e disco não mudam muito, mas o tempo de resposta e o do VROOM sim). (4) Comportamento dos links do Google Maps e do Waze em aparelhos reais. (5) Qualidade com **muito mais endereços** (51 é pouco; as medianas são confiáveis, o p90 e o pior caso não). (6) Como atualizar o Nominatim depois do `freeze` (a recomendação é **recriar o banco por fora** a cada trimestre e trocar). |

## 8. Limites deste teste
- **51 endereços de saúde (CNES)**: endereços de empresa podem ser diferentes (salas, galpões, rodovias com km). A coordenada do gabarito também tem erro (mediana de 33 m contra o CNEFE).
- Todo o tempo e RAM foram medidos em x86 com 12 CPUs; **a VPS ARM pode ser bem mais lenta**.
- O OSM do ES tem **muito pouco número de casa no interior**: isso pode melhorar com o tempo, mas hoje quem dá o número é o CNEFE.

## 9. A VPS (resultado do comando do Ale, 16/10/2026)
| Item | Valor lido | Pilha recomendada | Folga |
|---|---|---|---|
| Arquitetura e CPU | **aarch64**, 4 CPUs, carga média **2,04 / 1,89 / 2,10** | consulta leve; preparo pesado fora | **CPU é o gargalo**: já está em ~50% |
| Memória | 23 GiB; em uso 5,6 GiB; **17 GiB disponíveis** (17 GiB de cache, reaproveitáveis); sem swap | ~1,4 GiB (2 GiB com folga) | ~12% do disponível |
| Disco | 193 GB; **157 GB livres** (19% usado); imagens do Docker 18,8 GB (4,9 GB recuperáveis) | ~5,3 GB (imagens 3,2 + dados 2,0) | ~3,4% do livre |
| Containers hoje | 28 rodando; os maiores: MySQL dos WordPress (578 e 652 MiB), n8n (440 MiB) e Coolify (441 MiB); o app Leadtogo (API, web, worker, Postgres e Redis) soma uns 0,9 GiB | – | – |
| Garage | limite de **512 MiB**, usando 5 MiB | o PMTiles de 227 MB fica nele | cabe; só conferir que o limite aguenta a leitura por faixas (range) do arquivo |

**Conclusão:** memória e disco **não são problema**. O risco é **CPU** (4 núcleos ARM já com carga de ~2): a importação do Nominatim (10 min com 8 threads no meu x86; num ARM com 4 núcleos disputando CPU, algo como 30 a 50 min) e o `osrm-extract` **não devem rodar na VPS**; rodar fora e subir os arquivos prontos (427 MB, 346 MB, 380 MB e 227 MB). Em consulta, o Nominatim, o OSRM e o VROOM respondem em milissegundos e usam pouca CPU. O tempo do VROOM com 400 paradas (23 s com 12 CPUs aqui) será bem maior em 4 núcleos ARM: **o G4 deve limitar o tamanho da rota** (por exemplo, 100 a 150 paradas por veículo e por pedido, 0,5 a 2,5 s medidos aqui) ou rodar o VROOM com tempo-limite.

O comando está em `experimentos/geo-g0/vps-conferir.sh`.

## 10. Commits
- `5382707` chore: experimento G0 da geolocalização (scripts, gabarito e resultados).
- O commit deste relatório (`docs: relatório do G0 da geolocalização`) vem logo depois; o hash está na resposta que acompanha o relatório.

Observação sobre o push: `experimentos/` não é classificado como documentação pelo `scripts/escopo.sh` (só `*.md` e `docs/`), então o push roda o gate completo e a esteira **reimplanta o mesmo código** (sem nenhuma mudança de comportamento no app). Se preferir, o G1 pode acrescentar `experimentos/` à regra de "só documentação".
