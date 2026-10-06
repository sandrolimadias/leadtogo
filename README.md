# Leadtogo

CRM multiempresa de gestão de carteira, para desktop, tablet e celular (PWA).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `apps/api` | API NestJS (REST + OpenAPI) e worker (filas, sincronizações) |
| `apps/web` | Front-end React + Vite (PWA), empacotável com Capacitor |
| `packages/shared` | Schemas Zod, tipos e regras compartilhadas |
| `packages/db` | Schema Drizzle, migrações, políticas RLS e seeds |
| `packages/api-client` | Cliente TypeScript gerado do OpenAPI |
| `docker` | Dockerfiles e compose de desenvolvimento |
| `.github/workflows` | Esteira de CI/CD (GitHub Actions → GHCR → Coolify) |
| `docs` | Documentação do projeto (fonte da verdade) |

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
