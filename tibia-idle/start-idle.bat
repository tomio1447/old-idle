@echo off
setlocal

set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%server"
set "XAMPP_DIR=C:\xampp"
set "PORT=8001"
set "TEST_SERVER=1"

if not exist "%XAMPP_DIR%\mysql_start.bat" (
  echo [ERRO] MySQL do XAMPP nao encontrado em "%XAMPP_DIR%".
  echo Ajuste XAMPP_DIR neste arquivo caso o XAMPP esteja instalado em outro local.
  pause
  exit /b 1
)

if not exist "%SERVER_DIR%\server.js" (
  echo [ERRO] Servidor nao encontrado em "%SERVER_DIR%\server.js".
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado no PATH.
  pause
  exit /b 1
)

echo [1/2] Iniciando MySQL...
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','call ""%XAMPP_DIR%\mysql_start.bat""' -WindowStyle Minimized }"

set "MYSQL_READY="
for /l %%I in (1,1,30) do (
  powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set "MYSQL_READY=1"
    goto mysql_ready
  )
  timeout /t 1 /nobreak >nul
)

:mysql_ready
if not defined MYSQL_READY (
  echo [ERRO] MySQL nao abriu a porta 3306 em 30 segundos.
  echo Verifique o painel/log do XAMPP.
  pause
  exit /b 1
)

echo [2/2] Iniciando Global Idle em http://localhost:%PORT% ...
start "Global Idle Server" cmd /k "cd /d ""%SERVER_DIR%"" && set ""PORT=%PORT%"" && set ""TEST_SERVER=%TEST_SERVER%"" && node server.js"

endlocal
