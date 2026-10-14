# Vulnerabilidades de dependências conhecidas e não corrigidas

Regra (Ale, 14/10/2026): **toda vulnerabilidade que não for corrigida entra neste documento**, no mesmo commit em que aparece, com a avaliação do risco real no Leadtogo e quando rever.

A esteira (`pnpm audit --audit-level high`, job `security` em `.github/workflows/ci-cd.yml`) só barra severidade **alta ou crítica**. As **moderadas e baixas** não barram o deploy: por isso ficam registradas aqui.

Como rever: `pnpm audit` na raiz. Quando um item sair do `pnpm audit`, marque-o como **Resolvida** e deixe a linha no histórico (não apague).

## Abertas

Última conferência: **14/10/2026** (`pnpm audit`: 2 moderadas, 0 altas, 0 críticas).

### 1. esbuild ≤ 0.24.2: qualquer site pode enviar requisições ao servidor de desenvolvimento

| | |
|---|---|
| Gravidade | Moderada |
| Advisory | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| Versão afetada / corrigida | ≤ 0.24.2 / ≥ 0.25.0 (aqui: 0.18.20) |
| Caminho | `packages/db` → `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild` |
| Tipo | Só desenvolvimento (CLI do `drizzle-kit`); fora da imagem de produção (`docker/api.Dockerfile` instala só dependências de produção, sem o `drizzle-kit`) |

**Risco real no Leadtogo: baixo.** A falha está no servidor de desenvolvimento do esbuild (a função `serve`). O `@esbuild-kit/core-utils` usa só `transform` e `transformSync` (conferido no código do pacote em 14/10/2026), e nenhum script do projeto sobe um servidor do esbuild. Fica só na máquina de desenvolvimento e na esteira.

**Mitigação:** nada a fazer agora. **Saída:** ainda **não há versão corrigida**: o `drizzle-kit` mais recente (0.31.x, conferido em 14/10/2026) continua dependendo do `@esbuild-kit/esm-loader` (pacote legado), que arrasta o esbuild 0.18. Rever a cada atualização do `drizzle-kit` (o Dependabot abre o PR). Se demorar, a alternativa é um `pnpm.overrides` do `esbuild` interno para ≥ 0.25, testando antes `pnpm db:generate` e `pnpm db:migrate`.

**Origem:** já existia antes do Módulo 4.

### 2. uuid < 11.1.1: falta de checagem de limites no buffer (v3, v5 e v6 com `buf`)

| | |
|---|---|
| Gravidade | Moderada |
| Advisory | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| Versão afetada / corrigida | < 11.1.1 / ≥ 11.1.1 (aqui: 8.3.2) |
| Caminho | `apps/api` → `exceljs` → `uuid` |
| Tipo | Produção (a API lê a planilha da importação com o `exceljs`) |

**Risco real no Leadtogo: nenhum alcançável.** A falha só ocorre nas funções `v3`, `v5` e `v6` quando se passa o argumento `buf`. O `exceljs` 4.4.0 usa apenas `v4()` sem argumentos (para ids de formatação condicional), e o dado não vem do usuário. Verificado no código do pacote em 14/10/2026.

**Mitigação:** nada a fazer agora. **Saída:** trocar para a versão do `exceljs` que atualize o `uuid` ou, se for preciso zerar o aviso antes disso, usar `pnpm.overrides` para o `uuid` ≥ 11.1.1 (testar a leitura e a escrita de `.xlsx`, porque o `exceljs` pede `^8.3.0`). Rever a cada atualização do `exceljs`.

**Origem:** entrou com o `exceljs`, adicionado no Módulo 4 (commit de upload da planilha, `8eedcd9`).

## Resolvidas

Nenhuma ainda.
