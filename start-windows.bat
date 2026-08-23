@echo off
setlocal enabledelayedexpansion
REM TaxEaseBD - one-command launcher for Windows.
REM
REM Does not modify any application code. It just: creates a clean Python
REM virtual environment (the ones previously committed to this repo were
REM baked with a teammate's personal machine paths and don't work anywhere
REM else), installs dependencies, generates a real .env, and starts both
REM the backend and frontend dev servers.
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.10+ is required but wasn't found on your PATH. Install it from python.org and try again.
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required but wasn't found on your PATH. Install it from nodejs.org and try again.
  exit /b 1
)

echo == TaxEaseBD: backend ==
cd backend

if not exist ".venv" (
  echo Creating a fresh Python virtual environment ^(backend\.venv^)...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q --upgrade pip
pip install -q -r requirements.txt

if not exist ".env" (
  copy .env.example .env >nul
  for /f "delims=" %%s in ('python -c "import secrets; print(secrets.token_hex(32))"') do set RANDOM_SECRET=%%s
  powershell -NoProfile -Command "(Get-Content .env) -replace 'change-this-to-a-long-random-string', '%RANDOM_SECRET%' | Set-Content .env"
)

echo Starting backend on http://127.0.0.1:8000 ...
start "TaxEaseBD Backend" cmd /k python main.py
cd ..

echo == TaxEaseBD: frontend ==
cd frontend
if not exist "node_modules" (
  echo Installing frontend dependencies ^(first run only, this can take a minute^)...
  call npm install
)

echo.
echo ======================================================
echo  TaxEaseBD is starting.
echo  Frontend:  http://localhost:3000
echo  Backend:   http://127.0.0.1:8000   ^(API docs: /docs^)
echo  Close the "TaxEaseBD Backend" window to stop the backend.
echo ======================================================
echo.

call npm run dev
