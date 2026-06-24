@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "PG_PORT=55432"
set "PGDATA=%ROOT%.dev-postgres\data"
set "PG_LOG=%ROOT%.dev-postgres\postgres.log"

set "PG_CTL="
if exist "%ROOT%node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe" (
  set "PG_CTL=%ROOT%node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe"
)
if not defined PG_CTL if exist "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" (
  set "PG_CTL=C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"
)
if not defined PG_CTL if exist "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" (
  set "PG_CTL=C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
)
if not defined PG_CTL for %%P in (pg_ctl.exe) do if not defined PG_CTL set "PG_CTL=%%~$PATH:P"

echo.
echo Showrunner dev starter
echo Project: %CD%
echo.

if not defined PG_CTL (
  echo Could not find a Postgres control command.
  echo Checked:
  echo   node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe
  echo   C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe
  echo   C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe
  echo   pg_ctl.exe on PATH
  echo.
  echo Install PostgreSQL 17 or run npm install, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "%PGDATA%\PG_VERSION" (
  echo Could not find the existing local Postgres data folder:
  echo   %PGDATA%
  echo.
  echo The previous local database was stored there. Ask Codex to recreate
  echo the local database, or restore that folder, before starting dev.
  echo.
  pause
  exit /b 1
)

echo Checking local Postgres on localhost:%PG_PORT%...
"%PG_CTL%" status -D "%PGDATA%" >nul 2>&1
if errorlevel 1 (
  echo Starting local Postgres...
  "%PG_CTL%" start -D "%PGDATA%" -o "-p %PG_PORT% -h 127.0.0.1" -l "%PG_LOG%"
  if errorlevel 1 (
    echo.
    echo Failed to start local Postgres. Last log lines:
    powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '%PG_LOG%') { Get-Content '%PG_LOG%' -Tail 40 }"
    echo.
    pause
    exit /b 1
  )
) else (
  echo Local Postgres is already running.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$client = [Net.Sockets.TcpClient]::new(); try { $attempt = $client.BeginConnect('127.0.0.1', 3000, $null, $null); if ($attempt.AsyncWaitHandle.WaitOne(250)) { $client.EndConnect($attempt); exit 0 } exit 1 } catch { exit 1 } finally { $client.Close() }" >nul 2>&1
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
