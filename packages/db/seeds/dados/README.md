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
