#!/usr/bin/env bash
# TaxEaseBD - one-command launcher for macOS / Linux.
#
# Does not modify any application code. It just: creates a clean Python
# virtual environment (the ones previously committed to this repo were
# baked with a teammate's personal machine paths and don't work anywhere
# else), installs dependencies, generates a real .env, and starts both
# the backend and frontend dev servers.
set -e
cd "$(dirname "$0")"

command -v python3 >/dev/null 2>&1 && PYTHON=python3 || PYTHON=python
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "Python 3.10+ is required but wasn't found on your PATH. Install it from python.org and try again."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required but wasn't found on your PATH. Install it from nodejs.org and try again."
  exit 1
fi

echo "== TaxEaseBD: backend =="
cd backend

if [ ! -d ".venv" ]; then
  echo "Creating a fresh Python virtual environment (backend/.venv)..."
  "$PYTHON" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
  RANDOM_SECRET=$("$PYTHON" -c "import secrets; print(secrets.token_hex(32))")
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/change-this-to-a-long-random-string/$RANDOM_SECRET/" .env
  else
    sed -i "s/change-this-to-a-long-random-string/$RANDOM_SECRET/" .env
  fi
fi

echo "Starting backend on http://127.0.0.1:8000 ..."
python main.py &
BACKEND_PID=$!
cd ..

echo "== TaxEaseBD: frontend =="
cd frontend
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies (first run only, this can take a minute)..."
  npm install
fi

cleanup() {
  echo ""
  echo "Stopping backend..."
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "======================================================"
echo " TaxEaseBD is starting."
echo " Frontend:  http://localhost:3000"
echo " Backend:   http://127.0.0.1:8000   (API docs: /docs)"
echo " Press Ctrl+C to stop both servers."
echo "======================================================"
echo ""

npm run dev
