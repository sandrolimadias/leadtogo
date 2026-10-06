# Dados de referência dos seeds

Arquivos versionados lidos por `pnpm db:seed`. **O seed não baixa nada**: os dados abaixo foram
coletados uma vez e gravados aqui por `seeds/gerar-dados.mjs` (uso manual, só para atualizar).
Para atualizar: rode o gerador, confira o `git diff` e atualize a data na tabela.

| Arquivo               | Registros | Fonte                                                                                                             | Coletado em |
| --------------------- | --------: | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| `estados.json`        |        27 | IBGE, API de Localidades: <https://servicodados.ibge.gov.br/api/v1/localidades/estados>                           | 06/10/2026  |
| `paises.json`         |       193 | IBGE, API de Localidades (ISO 3166-1 alfa-2): <https://servicodados.ibge.gov.br/api/v1/localidades/paises>        | 06/10/2026  |
| `portes.json`         |         4 | Receita Federal, layout dos dados abertos do CNPJ (campo "porte da empresa"): 0, 1, 3 e 5                         | 06/10/2026  |
| `cnaes.json`          |     1.332 | IBGE/CONCLA, API CNAE v2, subclasses (7 dígitos) com seção, divisão, grupo e classe: <https://servicodados.ibge.gov.br/api/v2/cnae/subclasses> | 06/10/2026  |
| `municipios.json`     |     5.571 | Nome, UF e código IBGE: IBGE, API de Localidades <https://servicodados.ibge.gov.br/api/v1/localidades/municipios>. Código SIAFI/TOM: Tesouro Nacional, "Lista de municípios do SIAFI" (traz SIAFI e IBGE juntos): <https://www.tesourotransparente.gov.br/ckan/dataset/abb968cb-3710-4f85-89cf-875c91b9c7f6> (`tabmun.csv`, atualizada em 21/12/2021) | 06/10/2026  |
| `municipios_correcoes.json` | 1 | Correções manuais versionadas (ver nota abaixo) | 06/10/2026  |
| `qualificacoes_socio.json` |   79 | Tabela de qualificação do responsável/sócio da Receita, como publicada no projeto socios-brasil (ver nota abaixo) | 06/10/2026  |

## Notas

- **Qualificações do sócio:** o arquivo vem de
  <https://raw.githubusercontent.com/turicas/socios-brasil/HEAD/qualificacao-socio.csv>
  (última alteração do arquivo em 02/06/2020), que reproduz a tabela oficial da Receita. A lista
  "cresce com a API" (`docs/modelagem_banco.md`, seção 4): códigos novos devolvidos pela Minha Receita
  são acrescentados pelo worker. Conferido: 49 = Sócio-Administrador.
- Para a lista de países, o IBGE devolve 193 países reconhecidos; territórios e dependências não
  entram. `BR` (Brasil) está presente.
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
  é ignorada. `municipios.localizacao` fica vazia (carga futura dos centros).
- **Reproduzir:** `node packages/db/seeds/gerar-dados.mjs` (com internet). Com `DADOS_LOCAIS=<pasta>` o
  gerador lê respostas já baixadas (`estados.json`, `paises.json`, `subclasses.json`, `municipios.json`,
  `tabmun.csv`, `qualificacao-socio.csv`). Os arquivos acima foram gerados e reconferidos assim.
