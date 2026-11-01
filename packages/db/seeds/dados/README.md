# Dados de referência dos seeds

Arquivos versionados lidos por `pnpm db:seed`. **O seed não baixa nada**: os dados abaixo foram
coletados uma vez e gravados aqui por `seeds/gerar-dados.mjs` (uso manual, só para atualizar).
Para atualizar: rode o gerador, confira o `git diff` e atualize a data na tabela.

| Arquivo               | Registros | Fonte                                                                                                             | Coletado em |
| --------------------- | --------: | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| `estados.json`        |        27 | IBGE, API de Localidades: <https://servicodados.ibge.gov.br/api/v1/localidades/estados>                           | 06/10/2026  |
| `paises.json`         |       255 | Receita Federal, dados abertos do CNPJ, arquivo `Paises`, pasta `2026-09` (código numérico da Receita e nome). Cópia em `seeds/fontes/paises_receita_2026-09.csv` | 06/10/2026  |
| `portes.json`         |         4 | Receita Federal, layout dos dados abertos do CNPJ (campo "porte da empresa"): 0, 1, 3 e 5                         | 06/10/2026  |
| `cnaes.json`          |     1.332 | IBGE/CONCLA, API CNAE v2, subclasses (7 dígitos) com seção, divisão, grupo e classe: <https://servicodados.ibge.gov.br/api/v2/cnae/subclasses> | 06/10/2026  |
| `municipios.json`     |     5.571 | Nome, UF e código IBGE: IBGE, API de Localidades <https://servicodados.ibge.gov.br/api/v1/localidades/municipios>. Código SIAFI/TOM: Tesouro Nacional, "Lista de municípios do SIAFI" (traz SIAFI e IBGE juntos): <https://www.tesourotransparente.gov.br/ckan/dataset/abb968cb-3710-4f85-89cf-875c91b9c7f6> (`tabmun.csv`, atualizada em 21/12/2021) | 06/10/2026  |
| `microrregioes.json`  |       558 | Microrregiões do IBGE (código, nome e UF), da mesma API de Localidades (`municipios[].microrregiao`); usadas como regiões prontas da geolocalização | 16/10/2026  |
| `municipios_correcoes.json` | 1 | Correções manuais versionadas (ver nota abaixo) | 06/10/2026  |
| `municipio_contornos.json` | 78 | Contornos dos municípios do **ES** (só as UFs de `CONTORNOS_UFS`), simplificados (Douglas-Peucker, 0,002°) e com 4 casas, para os mapas de densidade do Dashboard. Fonte oficial do gerador: IBGE, API de Malhas <https://servicodados.ibge.gov.br/api/v3/malhas/estados/32?intrarregiao=municipio&qualidade=intermediaria&formato=application/vnd.geo+json>. **Esta versão** foi gerada com `DADOS_LOCAIS` a partir de `geojs-32-mun.json` do projeto geodata-br (<https://github.com/tbrugz/geodata-br>, derivado da malha municipal do IBGE), porque a API do IBGE não estava acessível no ambiente da geração (ver nota) | 01/11/2026 |
| `qualificacoes_socio.json` |   79 | Tabela de qualificação do responsável/sócio da Receita, como publicada no projeto socios-brasil (ver nota abaixo) | 06/10/2026  |

## Notas

- **Qualificações do sócio:** o arquivo vem de
  <https://raw.githubusercontent.com/turicas/socios-brasil/HEAD/qualificacao-socio.csv>
  (última alteração do arquivo em 02/06/2020), que reproduz a tabela oficial da Receita. A lista
  "cresce com a API" (`docs/modelagem_banco.md`, seção 4): códigos novos devolvidos pela Minha Receita
  são acrescentados pelo worker. Conferido: 49 = Sócio-Administrador.
- **Países:** vêm da tabela da própria Receita, com o **código numérico que a Receita usa** (Brasil =
  105), porque é esse código que a Minha Receita e os dados de sócios estrangeiros trazem. A lista de 193
  países da ONU/IBGE não cobre territórios e códigos especiais que aparecem em sócios estrangeiros, e por
  isso foi descartada. O arquivo vem do `Paises.zip` da pasta `2026-09` de
  <https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9>, baixado em 06/10/2026; o nome
  original do arquivo dentro do zip era `F.K03200$Z.D60912`. Formato: separador `;`, Latin-1, código e
  nome entre aspas, sem cabeçalho. O gerador lê esse CSV (não vai à internet para países). São 255 códigos
  de 3 dígitos, todos únicos; os nomes ficam como na Receita (maiúsculas, sem acento). Os códigos
  997 e 999 têm o mesmo nome ("NAO DECLARADOS"), como na fonte. O código ISO de 2 letras **não** é
  guardado por enquanto (a tabela da Receita não o traz).
- **CNAEs:** o código é guardado como inteiro, como a Minha Receita o devolve: as 167 subclasses das
  seções A e B que começam com zero têm 6 dígitos (ex.: `0111301` → `111301`). Descrições em
  maiúsculas, como na fonte. A API do IBGE ficou fora do ar ao final da coleta; o arquivo foi gerado
  da resposta já baixada em 06/10/2026 com a mesma transformação do `gerar-dados.mjs`.
- **Municípios:** o cruzamento IBGE × SIAFI é feito pelo **código IBGE** (exato), então não foi preciso
  casar nomes nem normalizar grafias ("D'Oeste", "do Oeste"). Dos 5.571 municípios da lista do IBGE,
  5.570 estão na tabela do Tesouro e **1 precisou de correção manual**: Boa Esperança do Norte (MT,
  IBGE 5101837), município instalado em 2025, ficou com o TOM **1182**, confirmado na página oficial
  da prefeitura (fonte em `municipios_correcoes.json`). **Nenhum município ficou sem `codigo_siafi`**
  e o gerador falha se isso acontecer. 33 municípios têm grafia diferente entre as fontes (ex.: Paraty ×
  PARATI, Assú × ACU), mas o mesmo código IBGE e a mesma UF; vale o nome do IBGE. Conferido o exemplo de
  `docs/modelagem_banco.md`: Serra, IBGE 3205002, SIAFI 5699. A linha "DEMAIS MUNICIPIOS" (IBGE 0) do Tesouro
  é ignorada. **Desde 16/10/2026** o arquivo também traz `microrregiao_codigo` (da API de Localidades) e o centro de cada município (`latitude` e `longitude`, o centroide ponderado pela área do maior polígono da malha do IBGE: <https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=minima&formato=application/vnd.geo+json>), que o seed grava em `municipios.localizacao`. Boa Esperança do Norte (MT, instalado em 2025) não está na malha nem na lista de microrregiões: fica sem centro e sem microrregião.
- **Contornos dos municípios:** um registro por linha (`codigo_ibge`, `uf`, `poligonos` = MultiPolygon do
  GeoJSON). O gerador separa as **ilhas** que algumas cópias da malha gravam como "buracos" fora do contorno
  (Vitória, Vila Velha, Guarapari, Ibiraçu), para não ficar geometria inválida. Para trocar pela malha oficial
  mais recente: `CONTORNOS_UFS=ES node packages/db/seeds/gerar-dados.mjs contornos` (com internet) e conferir o
  `git diff`. Outra UF entra acrescentando a sigla (`CONTORNOS_UFS=ES,MG`). O seed grava em
  `municipio_contornos` a cada start da API, só o que mudou.
- **Reproduzir:** `node packages/db/seeds/gerar-dados.mjs` (com internet). Com `DADOS_LOCAIS=<pasta>` o
  gerador lê respostas já baixadas (`estados.json`, `subclasses.json`, `municipios.json`,
  `tabmun.csv`, `qualificacao-socio.csv`, `malha_municipios.json`). Os arquivos acima foram gerados e reconferidos assim.
