# Leadtogo

CRM multiempresa de gestão de carteira, para desktop, tablet e celular (PWA).

## Estrutura

| Pasta                 | Conteúdo                                                     |
| --------------------- | ------------------------------------------------------------ |
| `apps/api`            | API NestJS (REST + OpenAPI) e worker (filas, sincronizações) |
| `apps/web`            | Front-end React + Vite (PWA), empacotável com Capacitor      |
| `packages/shared`     | Schemas Zod, tipos e regras compartilhadas                   |
| `packages/db`         | Schema Drizzle, migrações, políticas RLS e seeds             |
| `packages/api-client` | Cliente TypeScript gerado do OpenAPI                         |
| `docker`              | Dockerfiles e compose de desenvolvimento                     |
| `.github/workflows`   | Esteira de CI/CD (GitHub Actions → GHCR → Coolify)           |
| `docs`                | Documentação do projeto (fonte da verdade)                   |

## Documentação

- [Configuração de tecnologia](docs/configuracao_tecnologia.md)
- [Funcionalidades](docs/funcionalidades.md)
- [Modelagem do banco](docs/modelagem_banco.md)
- [Design system](docs/design_system.md) · [pacote](docs/design-system/LEIA-ME.md)
- [Esteira de deploy](docs/esteira_deploy.md)

Instruções para o Claude Code: [CLAUDE.md](CLAUDE.md).

## Desenvolvimento local

```bash
docker compose -f docker/compose.dev.yml up -d   # Postgres+PostGIS, Valkey, Garage
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Pré-requisitos: Node 24 (`.nvmrc`, via nvm) e pnpm (`corepack enable`). Ver `docs/esteira_deploy.md`, seção 9.

## Scripts da raiz

| Script                                                      | O que faz                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                                                  | API + worker (porta 3000) e web (porta 5173) com recarga automática |
| `pnpm build`                                                | Build de todos os pacotes (Turborepo, com cache)                    |
| `pnpm lint`                                                 | ESLint (flat config em `eslint.config.js`, com checagem de tipos)   |
| `pnpm format` · `pnpm format:check`                         | Prettier (grava / só confere)                                       |
| `pnpm typecheck`                                            | `tsc --noEmit` em todos os pacotes                                  |
| `pnpm test`                                                 | Vitest em todos os pacotes                                          |
| `pnpm db:generate` · `db:migrate` · `db:seed` · `db:studio` | Drizzle (ver `packages/db`)                                         |

## Configuração compartilhada

- `tsconfig.base.json`: TypeScript estrito, ESM (`NodeNext`); cada pacote estende.
- Pacotes internos (`@leadtogo/*`) exportam o `dist/` e, pela condição `@leadtogo/source`, o `src/` para typecheck, testes e Vite (sem build no meio).
- `lefthook.yml`: hooks instalados no `pnpm install`
  - **pre-commit**: secretlint (segredos), Prettier e ESLint nos arquivos alterados
  - **commit-msg**: Conventional Commits (commitlint)
  - **pre-push**: `pnpm lint && pnpm typecheck && pnpm test`
