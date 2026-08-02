@echo off
chcp 65001 >nul
REM Inicia o servidor local e abre o RME no navegador padrão

cd /d "%~dp0\tibia-idle\game"

REM Verifica se a porta 8001 já está em uso
netstat -ano | findstr ":8001" >nul 2>&1
if %errorlevel% neq 0 (
    start /B python -m http.server 8001 >nul 2>&1
    timeout /t 1 /nobreak >nul
)

start "" "http://localhost:8001/rme/index.html"
