# Ark Production Deployment

This deployment runs PostgreSQL and FastAPI with Docker Compose. The server's system Nginx exposes the frontend static files on ports 80 and 443, terminates TLS, and proxies dynamic requests to FastAPI on `127.0.0.1:8000`. PostgreSQL remains on the Compose network and is not reachable from the public internet.

## First Deployment

On the server, clone the repository into a directory owned by `ubuntu`, for example `/home/ubuntu/ark`.

```bash
git clone https://github.com/QiShu3/ark.git /home/ubuntu/ark
cd /home/ubuntu/ark
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Edit `deploy/.env` to set a strong PostgreSQL password and any enabled email or model-provider credentials. Do not commit this file.

Build the frontend locally, then sync `frontend/dist/` to `/var/www/ark/` on the server. Install the Nginx site configuration from `deploy/ark.nginx.conf`, validate it with `sudo nginx -t`, and reload Nginx.

Start the database and backend stack:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

Check the service state and application health:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps
curl -fsS https://strangetalking.xin/health
```

## Updating

```bash
cd /home/ubuntu/ark
git pull --ff-only origin main
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

## Operations

```bash
# Follow backend startup and migration logs.
docker compose --env-file deploy/.env -f deploy/compose.yml logs -f backend

# Stop services while preserving PostgreSQL and uploads.
docker compose --env-file deploy/.env -f deploy/compose.yml down
```

Do not use `down -v` unless intentionally deleting all database and uploaded-file data.
