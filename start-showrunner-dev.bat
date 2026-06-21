@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "PG_PORT=55432"
set "PGDATA=%TEMP%\showrunner-embedded-pg"
set "PG_CTL=%ROOT%node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe"
set "PG_LOG=%TEMP%\showrunner-embedded-pg.direct.err.log"
set "DATABASE_URL=postgresql://postgres:postgres@localhost:%PG_PORT%/showrunner"

echo.
echo Showrunner dev starter
echo Project: %CD%
echo.

if not exist "%PG_CTL%" (
  echo Could not find the embedded Postgres command:
  echo   %PG_CTL%
  echo.
  echo Run npm install first, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "%PGDATA%\PG_VERSION" (
  echo Could not find the existing embedded Postgres data folder:
  echo   %PGDATA%
  echo.
  echo The previous local database was stored there. Ask Codex to recreate
  echo the embedded database, or restore that folder, before starting dev.
  echo.
  pause
  exit /b 1
)

echo Checking embedded Postgres on localhost:%PG_PORT%...
"%PG_CTL%" status -D "%PGDATA%" >nul 2>&1
if errorlevel 1 (
  echo Starting embedded Postgres...
  "%PG_CTL%" start -D "%PGDATA%" -o "-p %PG_PORT% -h localhost" -l "%PG_LOG%"
  if errorlevel 1 (
    echo.
    echo Failed to start embedded Postgres. Last log lines:
    powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path $env:TEMP\showrunner-embedded-pg.direct.err.log) { Get-Content $env:TEMP\showrunner-embedded-pg.direct.err.log -Tail 40 }"
    echo.
    pause
    exit /b 1
  )
) else (
  echo Embedded Postgres is already running.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } exit 1" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo Something is already serving on http://localhost:3000/
  start "" "http://localhost:3000/"
  echo.
  pause
  exit /b 0
)

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo Could not find npm on PATH. Install Node.js or open this from a terminal
  echo where npm works, then try again.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting Next.js on http://localhost:3000/
echo Keep this window open while you work. Press Ctrl+C here to stop the site.
echo.

start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:3000/'"
npm run dev

echo.
echo Showrunner dev server stopped.
echo.
pause
