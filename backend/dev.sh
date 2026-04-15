#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  source ".env"
  set +a
fi

PORT="${PORT:-8000}"
AUTO_KILL_PORT="${AUTO_KILL_PORT:-0}"
MCP_SERVERS_FILE="${MCP_SERVERS_FILE:-MCP/mcp_servers.json}"

if [[ -z "${MCP_SERVERS:-}" && -f "$MCP_SERVERS_FILE" ]]; then
  MCP_SERVERS="$(python -c 'import json,sys; d=json.load(open(sys.argv[1],"r",encoding="utf-8")); print(json.dumps(d, ensure_ascii=False) if isinstance(d,list) and len(d)>0 else "")' "$MCP_SERVERS_FILE")"
  if [[ -n "$MCP_SERVERS" ]]; then
    export MCP_SERVERS
  fi
fi

PIDS="$(lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PIDS" ]]; then
  echo "port $PORT is in use: $PIDS" 1>&2
  if [[ "$AUTO_KILL_PORT" == "1" ]]; then
    kill -TERM $PIDS || true
    sleep 1
    PIDS2="$(lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$PIDS2" ]]; then
      kill -KILL $PIDS2 || true
    fi
  else
    exit 2
  fi
fi

uv sync
uv run python -m uvicorn main:app --reload --port "$PORT"
