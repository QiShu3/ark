#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${ARK_DEPLOY_HOST:-ubuntu@129.204.130.134}"
REMOTE_ROOT="${ARK_DEPLOY_ROOT:-/home/ubuntu/ark}"
STATIC_STAGING_DIR="/tmp/ark-frontend-dist"

cd "$ROOT_DIR"

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Local HEAD must match origin/main. Push the intended commit before deploying." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain -- frontend)" ]]; then
  echo "Frontend has uncommitted changes; commit or discard them before deploying." >&2
  exit 1
fi

pnpm --dir frontend build
rsync -a --delete frontend/dist/ "$REMOTE_HOST:$STATIC_STAGING_DIR/"
ssh "$REMOTE_HOST" "bash '$REMOTE_ROOT/deploy/update.sh' '$STATIC_STAGING_DIR'"
