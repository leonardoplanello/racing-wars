@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Instalando dependencias... & call npm install)
start "" http://localhost:3000
node server/index.js
pause
