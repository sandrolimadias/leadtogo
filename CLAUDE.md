# Leadtogo — instruções para o Claude Code

CRM multiempresa de gestão de carteira (desktop, tablet e celular/PWA). O dono do projeto é o Ale; responda em **português do Brasil**.

## Fonte da verdade

Antes de implementar, leia o documento relevante em `docs/`:

- `docs/funcionalidades.md`: o que o sistema faz (regras de negócio)
- `docs/modelagem_banco.md`: tabelas, colunas, índices, RLS
- `docs/configuracao_tecnologia.md`: stack e infraestrutura
- `docs/esteira_deploy.md`: CI/CD, migrações, rollback
- `docs/design_system.md` e `docs/design-system/`: tokens, componentes e regras visuais

Se o código precisar divergir de um documento, **atualize o documento no mesmo commit** e avise.

## Protótipo (referência visual)

- `docs/prototipo/README.md`: especificação de cada tela (layout, estados, textos, comportamento). **Leia antes de criar ou alterar uma tela.**
- `docs/prototipo/prototipo/*.dc.html`: telas em HTML (marcação entre `<x-dc>` e `</x-dc>`, lógica no `<script data-dc-script>`). São referência, **não código de produção**: recrie em React + Tailwind + shadcn/ui.
- `docs/prototipo/docs/` e `docs/prototipo/design-system/` são **cópias congeladas** do momento do protótipo. **Não edite**: as versões vivas são `docs/*.md` e `docs/design-system/`.
- Onde o protótipo e `docs/funcionalidades.md` divergirem, vale o documento (ver `docs/revisao_prototipo.md`).

## Stack

- Monorepo pnpm + Turborepo: `apps/api` (NestJS), `apps/web` (React + Vite PWA), `packages/shared` (Zod), `packages/db` (Drizzle), `packages/api-client` (gerado do OpenAPI).
- PostgreSQL + PostGIS, Valkey (BullMQ), Garage (S3; acesso via `@aws-sdk/client-s3` com `forcePathStyle`). Autenticação com Better Auth.
- UI: Tailwind v4 + shadcn/ui com os tokens de `docs/design-system/tokens.css` e `tailwind-theme.css`. Não invente cores, fontes ou espaçamentos fora dos tokens.
- TypeScript estrito em tudo. Validação com Zod compartilhado entre front e back.

## Regras de banco (obrigatórias)

- Nomes de tabelas e colunas em **português**, `snake_case`. PK `uuid` v7.
- Toda tabela de negócio: `tenant_id NOT NULL`, **RLS habilitado e forçado**, e **teste de isolamento** (o tenant A não lê nem grava dados do tenant B).
- Colunas padrão: `criado_em`, `atualizado_em`, `criado_por`, `atualizado_por`, `excluido_em` (soft delete).
- Dinheiro em `numeric(15,2)`; datas em `timestamptz`; documentos (CNPJ alfanumérico) em `varchar`.
- Migrações: **expandir e depois contrair**. Nunca editar uma migração já aplicada. Migração destrutiva só com aviso explícito ao Ale e commit marcado `BREAKING-DB:`.

## Antes de cada commit

```
pnpm lint && pnpm typecheck && pnpm test
```

Os commits vão direto para a `main`, que faz deploy em produção. **Não faça commit com teste falhando.**

## Commits

- Conventional Commits em português: `feat: cadastro de empresas com consulta à Receita`.
- Pequenos, com uma intenção só, sempre com os testes da mudança.

## Segurança

- Nunca commitar `.env`, tokens, senhas ou dados reais de clientes. Novas variáveis vão para `.env.example` (sem valor) e são avisadas ao Ale para cadastrar no Coolify.
- Toda entrada validada; nada de SQL concatenado; permissões por papel (admin, gestor, vendedor) e regra de carteira.

## Ambiente

- Desenvolvimento no **WSL2 (Ubuntu 24.04)**, repositório em `~/projetos/leadtogo`. Comandos e scripts em bash/Linux; nunca trabalhar em `/mnt/c`.
- Scripts do `package.json` devem funcionar em Linux (CI e servidor) sem depender do Windows.

## Comandos

- `docker compose -f docker/compose.dev.yml up -d`: banco, cache e Garage locais
- `pnpm dev` · `pnpm test` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`
