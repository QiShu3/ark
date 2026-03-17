# Deploy (Docker Compose + Caddy, path `/ark`)

This repo supports a simple single-server deployment:

- Caddy terminates HTTPS and routes:
  - `/api/*`, `/auth/*`, `/todo/*`, `/arxiv/*`, `/health` → backend
  - `/ark/*` → frontend static site
- Frontend is served under `/ark/` (matches `frontend/vite.config.ts` production `base`).

## Server setup (once)

1) Install Docker + Docker Compose plugin.
2) Create a deploy directory, e.g. `/opt/ark`, with:
   - `deploy/docker-compose.yml`
   - `deploy/Caddyfile`
   - `.env` (copy from `deploy/.env.example` and fill values)
3) Open ports `80` and `443` on your firewall / security group.

## Run / update

From the deploy directory:

```bash
docker compose pull
docker compose up -d --remove-orphans
```

## Notes

- If your GitHub repo is private, the server must be logged into GHCR to pull images:
  `docker login ghcr.io`.
- For managed PostgreSQL, you can remove the `db` service and point `DATABASE_URL` to your provider.
