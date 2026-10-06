# docker

- `api.Dockerfile`: imagem da API e do worker
- `web.Dockerfile`: build Vite servido por Caddy
- `compose.dev.yml`: Postgres+PostGIS, Valkey e Garage para desenvolvimento
- `dev-reset.sh`: usado por `pnpm dev:reset` (para e apaga `docker/.data/`)
- `postgres/init.sh`: cria os papéis `leadtogo_owner` e `leadtogo_app` (primeiro start)
- `garage/`: `garage.toml` e `init.sh` (layout, chave e bucket `leadtogo-arquivos`)

Ver `docs/esteira_deploy.md` (seções 6 e 9).
