# syntax=docker/dockerfile:1.7
# Imagem do portal do cliente: build do Vite + Caddy servindo os arquivos estáticos (porta 8080, sem root).
# Contexto: a raiz do repositório (precisa de docs/design-system/: tokens, tema e fontes que o build copia).
#   docker build -f docker/portal.Dockerfile --build-arg APP_VERSION=<sha> .
# O portal fala com a API por caminhos relativos (/v1/portal/...): em produção o Traefik do Coolify roteia
# portal.aledias.com.br/v1 para a API e o resto para esta imagem (domínio único, como o CRM).

# ---- 1. build: roda na arquitetura de quem constrói; o resultado (HTML/JS/CSS) é o mesmo para qualquer destino
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
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
    pnpm install --frozen-lockfile --ignore-scripts --filter "@leadtogo/portal..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/api-client packages/api-client
COPY packages/ui packages/ui
# o build do portal copia tokens.css, tailwind-theme.css e as fontes daqui (apps/portal/scripts/sincronizar-design-system.mjs)
COPY docs/design-system docs/design-system
COPY apps/portal apps/portal
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
WORKDIR /repo/apps/portal
# `vite build` (os tipos já são conferidos no CI). Nenhum mapa de código sai na imagem.
RUN node scripts/sincronizar-design-system.mjs \
 && pnpm exec vite build \
 && find dist -name '*.map' -delete

# ---- 2. final: a imagem oficial do Caddy, sem root
FROM caddy:2-alpine AS final
ARG APP_VERSION=dev
ARG GIT_SHA=desconhecido
ARG SOURCE=https://github.com/sandrolimadias/leadtogo
ARG BUILD_DATE=
LABEL org.opencontainers.image.title="leadtogo-portal" \
      org.opencontainers.image.description="Leadtogo: portal do cliente servido pelo Caddy" \
      org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}"
RUN addgroup -S portal && adduser -S -G portal -u 10001 portal \
 && mkdir -p /data /config \
 && chown -R portal:portal /data /config
COPY docker/portal.Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=portal:portal /repo/apps/portal/dist /srv
ENV XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config
USER portal
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
