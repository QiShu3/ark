---
name: ark-start
description: Use ONLY when the user explicitly invokes this skill via /ark-start or the Skill tool. Do NOT auto-trigger on general requests to start/launch/run the project.
---

# Ark Project Quick Start

Start (or restart) both Ark dev servers. Backend is FastAPI on port 8000, frontend is React/Vite on port 5173 with API proxy to the backend.

## Step 1: Verify PostgreSQL

Check that PostgreSQL is accepting connections:

```bash
pg_isready -h 127.0.0.1 -p 5432
```

If the check fails, tell the user to start PostgreSQL (`brew services start postgresql`).

## Step 2: Kill existing processes

Clear both ports so the new instances can bind:

```bash
lsof -ti :8000 | xargs kill -9 2>/dev/null; echo "backend port cleared"
lsof -ti :5173 | xargs kill -9 2>/dev/null; echo "frontend port cleared"
```

## Step 3: Start backend in background

```bash
cd /Users/qishu/Project/ark/backend && AUTO_KILL_PORT=1 ./dev.sh
```

Use `run_in_background: true`. The script runs `uv sync` then starts uvicorn with `--reload` on port 8000.

## Step 4: Start frontend in background

```bash
cd /Users/qishu/Project/ark/frontend && pnpm dev
```

Use `run_in_background: true`. Vite starts on port 5173, proxying `/api`, `/auth`, `/todo`, `/uploads`, `/admin` to `localhost:8000`.

## Step 5: Confirm both are up

Wait a few seconds, then verify both ports are listening:

```bash
sleep 3 && lsof -ti :8000 :5173
```

Should show two PIDs. If either is missing, check the background task output for errors.

## Step 6: Report

Tell the user the services are ready:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
