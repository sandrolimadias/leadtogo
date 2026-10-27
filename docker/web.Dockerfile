# syntax=docker/dockerfile:1.7
# Imagem do web: build do Vite + Caddy servindo os arquivos estáticos (porta 8080, sem root).
# Contexto: a raiz do repositório (precisa de docs/design-system/: tokens, tema e fontes que o build copia).
#   docker build -f docker/web.Dockerfile --build-arg APP_VERSION=<sha> .
# Observabilidade (opcional; o CI fornece): VITE_SENTRY_DSN entra no JS (o DSN do navegador é público); com o
# segredo `sentry_auth_token` (--secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN) os source maps sobem para o
# GlitchTip e NUNCA chegam à imagem final (o token também não fica em nenhuma camada).

# ---- 1. build: roda na arquitetura de quem constrói; o resultado (HTML/JS/CSS) é o mesmo para qualquer destino
FROM --platform=$BUILDPLATFORM node:25-alpine AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY docker/pnpm-fixo.sh /tmp/pnpm-fixo.sh
RUN sh /tmp/pnpm-fixo.sh
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/portal/package.json apps/portal/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter "@leadtogo/web..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/api-client packages/api-client
COPY packages/ui packages/ui
# o build do web copia tokens.css, tailwind-theme.css e as fontes daqui (apps/web/scripts/sincronizar-design-system.mjs)
COPY docs/design-system docs/design-system
COPY apps/web apps/web
ARG APP_VERSION=dev
ARG VITE_SENTRY_DSN=
ARG SENTRY_URL=
ARG SENTRY_ORG=
ENV APP_VERSION=${APP_VERSION} \
    VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
    SENTRY_URL=${SENTRY_URL} \
    SENTRY_ORG=${SENTRY_ORG}
WORKDIR /repo/apps/web
# `vite build` (os tipos já são conferidos no CI); o PWA (manifest e service worker) sai junto. Sem o segredo o
# build não gera nenhum mapa. Com ele, o plugin do Sentry injeta os debug IDs, envia os mapas e os apaga.
# `validar-dist` apaga qualquer .map que sobrar (upload que falhou) e confere o precache do service worker.
RUN --mount=type=secret,id=sentry_auth_token \
    node scripts/sincronizar-design-system.mjs \
 && SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" pnpm exec vite build \
 && node scripts/validar-dist.mjs

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
