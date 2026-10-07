# syntax=docker/dockerfile:1.7
# Imagem do web: build do Vite + Caddy servindo os arquivos estáticos (porta 8080, sem root).
# Contexto: a raiz do repositório (precisa de docs/design-system/: tokens, tema e fontes que o build copia).
#   docker build -f docker/web.Dockerfile --build-arg APP_VERSION=<sha> .

# ---- 1. build: roda na arquitetura de quem constrói; o resultado (HTML/JS/CSS) é o mesmo para qualquer destino
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter "@leadtogo/web..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/api-client packages/api-client
# o build do web copia tokens.css, tailwind-theme.css e as fontes daqui (apps/web/scripts/sincronizar-design-system.mjs)
COPY docs/design-system docs/design-system
COPY apps/web apps/web
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
WORKDIR /repo/apps/web
# `vite build` (os tipos já são conferidos no CI); o PWA (manifest e service worker) sai junto
RUN node scripts/sincronizar-design-system.mjs && pnpm exec vite build

# ---- 2. final: a imagem oficial do Caddy, sem root
FROM caddy:2-alpine AS final
ARG APP_VERSION=dev
ARG GIT_SHA=desconhecido
ARG SOURCE=https://github.com/sandrolimadias/leadtogo
ARG BUILD_DATE=
LABEL org.opencontainers.image.title="leadtogo-web" \
      org.opencontainers.image.description="Leadtogo: PWA servido pelo Caddy" \
      org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}"
RUN addgroup -S web && adduser -S -G web -u 10001 web \
 && mkdir -p /data /config \
 && chown -R web:web /data /config
COPY docker/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=web:web /repo/apps/web/dist /srv
ENV XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config
USER web
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
