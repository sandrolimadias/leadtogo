# packages/db

Schema Drizzle, migrações (padrão expandir/contrair), políticas RLS e seeds (tags padrão, funil padrão, CNAEs, municípios).
Fonte: `docs/modelagem_banco.md`.

## Estrutura

| Caminho             | Papel                                                                         |
| ------------------- | ----------------------------------------------------------------------------- |
| `src/schema/`       | Tabelas Drizzle (um arquivo por grupo, reexportado em `index.ts`). Hoje vazio |
| `src/index.ts`      | `criarConexao(url)` (postgres.js + Drizzle) e o `schema`                      |
| `src/seed.ts`       | Seeds de desenvolvimento (por enquanto não faz nada)                          |
| `sql/papeis.sql`    | Papéis `leadtogo_owner` e `leadtogo_app` (idempotente, senhas por variável)   |
| `scripts/`          | `garantir-bancos.sh`: cria bancos e aplica `papeis.sql` (dev e CI)            |
| `src/testes/`       | Conexões e setup global dos testes (banco `leadtogo_test`)                    |
| `migrations/`       | SQL gerado pelo `drizzle-kit` — **nunca editar uma migração já aplicada**     |
| `drizzle.config.ts` | Usa `DATABASE_MIGRATION_URL` (usuário dono das tabelas) do `.env` da raiz     |

## Scripts (também disponíveis na raiz)

- `pnpm db:generate`: gera a migração a partir do schema
- `pnpm db:migrate`: aplica as migrações pendentes
- `pnpm db:seed`: popula dados de desenvolvimento
- `pnpm db:studio`: abre o Drizzle Studio

## Testes

`pnpm test` roda em `leadtogo_test` (criado por `pnpm dev:up`), conectado como `leadtogo_app` e `leadtogo_owner`. O setup global apaga o que o owner criou e aplica as migrações do zero.

## RLS e isolamento multiempresa

- `app_tenant_id()` e `app_tenant_ids()` leem `app.tenant_id` e `app.tenant_ids` (definidos com `SET LOCAL` pela API). Sem a variável, nada é lido nem gravado.
- Toda migração que cria uma tabela com `tenant_id` termina com `SELECT aplicar_rls_tenant('tabela');`: liga e força o RLS, cria as políticas (SELECT aceita o tenant ativo ou a lista do consolidado; INSERT/UPDATE/DELETE só o tenant ativo) e concede o DML ao `leadtogo_app`. `tenants` usa `aplicar_rls_tenant('tenants', 'id')`.
- Teste de isolamento (`src/testes/isolamento.test.ts`), em duas camadas, para **toda** tabela com `tenant_id` (descoberta no catálogo): (1) RLS habilitado e forçado + políticas de SELECT/INSERT/UPDATE/DELETE; (2) comportamento com uma **fábrica por tabela** em `src/testes/fabricas.ts`, com `leadtogo_app` e `leadtogo_owner`. Tabela com `tenant_id` sem política ou sem fábrica, ou tabela sem `tenant_id` fora da lista de exceções (`SEM_TENANT_ID`), faz o teste falhar.
