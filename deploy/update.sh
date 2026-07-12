#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ARK_DEPLOY_ROOT:-/home/ubuntu/ark}"
STATIC_STAGING_DIR="${1:-}"
COMPOSE=(docker compose --env-file deploy/.env -f deploy/compose.yml)

cd "$ROOT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Deployment checkout has uncommitted changes; refusing to overwrite them." >&2
  exit 1
fi

git pull --ff-only origin main

if [[ -n "$STATIC_STAGING_DIR" ]]; then
  sudo install -d -m 755 /var/www/ark
  sudo rsync -a --delete "$STATIC_STAGING_DIR"/ /var/www/ark/
  rm -rf "$STATIC_STAGING_DIR"
fi

sudo install -m 644 deploy/ark.nginx.conf /etc/nginx/sites-available/ark
sudo ln -sfn /etc/nginx/sites-available/ark /etc/nginx/sites-enabled/ark
sudo nginx -t
sudo systemctl reload nginx

"${COMPOSE[@]}" up -d --build backend

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null; then
    curl -fsS https://strangetalking.xin/health >/dev/null
    echo "Deployment complete: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

echo "Backend did not become healthy in time." >&2
"${COMPOSE[@]}" logs --tail=100 backend >&2
exit 1
