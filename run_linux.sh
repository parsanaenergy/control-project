#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
(cd frontend && [ -d node_modules ] || npm install)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
BACK_PID=$!
trap 'kill $BACK_PID 2>/dev/null || true' EXIT
cd frontend
npm run dev -- --host 127.0.0.1
