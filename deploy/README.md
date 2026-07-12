# Ark Production Deployment

This deployment exposes only the frontend Nginx container on ports 80 and 443. PostgreSQL and FastAPI stay on the Compose network and are not reachable from the public internet.

## First Deployment

On the server, clone the repository into a directory owned by `ubuntu`, for example `/home/ubuntu/ark`.

```bash
git clone https://github.com/QiShu3/ark.git /home/ubuntu/ark
cd /home/ubuntu/ark
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Edit `deploy/.env` to set a strong PostgreSQL password, existing certificate paths, and any enabled email or model-provider credentials. Do not commit this file.

Confirm the certificate files are present and readable by Docker, then build and start the complete stack:

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
