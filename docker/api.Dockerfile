# syntax=docker/dockerfile:1.7
# Imagem da API e do worker (a mesma imagem). O papel vem da variável PAPEL, porque o Coolify ignora o comando de
# partida dos recursos Docker Image. O CMD padrão é `node dist/iniciar.js`:
#   PAPEL=api (padrão)  migra o banco, semeia as referências, descarta a DATABASE_MIGRATION_URL e sobe a API
#   PAPEL=worker        sobe o worker (filas e outbox); não migra e não deve receber a DATABASE_MIGRATION_URL
# Continuam funcionando sozinhos:
#   node dist/main.js · node dist/worker.js · node dist/migrate.js (drizzle-orm) · node dist/seed-referencias.js ·
#   node dist/criar-conta.js · node dist/outbox-tratar.js (eventos esgotados) · node dist/testar-erro.js (GlitchTip)
# Contexto: a raiz do repositório.  docker build -f docker/api.Dockerfile --build-arg APP_VERSION=<sha> .

# ---- 1. build: compila o TypeScript. Roda na arquitetura de QUEM CONSTRÓI ($BUILDPLATFORM); o JavaScript
# resultante é o mesmo para qualquer arquitetura de destino.
FROM --platform=$BUILDPLATFORM node:25-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter "@leadtogo/api..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter "@leadtogo/api..." run build

# ---- 2. deps: só as dependências de PRODUÇÃO, instaladas na arquitetura de DESTINO (sem drizzle-kit, sem
# TypeScript, sem ferramentas de teste) e podadas (mapas, tipos, documentação e testes dos pacotes).
FROM node:25-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
RUN --mount=type=cache,id=pnpm-store-prod,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prod --filter "@leadtogo/api..." \
 && find /repo -path '*/node_modules/*' \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \
      -o -iname 'README*' -o -iname 'CHANGELOG*' -o -iname 'HISTORY*' -o -iname '*.md' -o -iname '*.markdown' \
      -o -name '*.test.js' -o -name '*.spec.js' \) -type f -delete \
 && find /repo -path '*/node_modules/*' -type d \( -name test -o -name tests -o -name __tests__ -o -name docs -o -name example -o -name examples \) \
      -prune -exec rm -rf {} + \
 && rm -rf /repo/node_modules/.pnpm/sentry@* /repo/node_modules/.pnpm/oxc-parser@* /repo/node_modules/.pnpm/@oxc-parser+*
# ^ o @sentry/node 11 puxa a CLI `sentry` e o `oxc-parser` (~25 MB) só para os plugins de bundler
#   (`@sentry/node/bundler-plugin/*`), que a API nunca importa; o teste de imagens confere que o SDK inicia sem eles.

# ---- 3. final: a imagem oficial do node (recebe as correções de segurança), com tini e sem npm/yarn/corepack
FROM node:25-alpine AS final
ARG APP_VERSION=dev
ARG GIT_SHA=desconhecido
ARG SOURCE=https://github.com/sandrolimadias/leadtogo
ARG BUILD_DATE=
LABEL org.opencontainers.image.title="leadtogo-api" \
      org.opencontainers.image.description="Leadtogo: API, worker e migração" \
      org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}"
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/include /root/.npm
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000 \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
# mesma árvore do monorepo (os pacotes internos são links relativos dentro de node_modules)
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/packages/db/package.json ./packages/db/package.json
COPY --from=build /repo/packages/db/dist ./packages/db/dist
# dados das referências (CNAEs, municípios...): lidos por dist/seeds/dados.js em ../../seeds/dados
COPY --from=build /repo/packages/db/seeds/dados ./packages/db/seeds/dados
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
# Serve para a API e para o worker (detecta sozinho; PAPEL=api|worker força): ver src/saude/verificar.ts
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD ["node", "dist/saude.js"]
ENTRYPOINT ["/sbin/tini", "--"]
# NODE_OPTIONS=--enable-source-maps (ENV acima): as pilhas de erro (log e GlitchTip) mostram o .ts original em
# qualquer comando node do container (inclusive `docker exec ... node dist/testar-erro.js`); os .map ficam na imagem (privada)
CMD ["node", "dist/iniciar.js"]
