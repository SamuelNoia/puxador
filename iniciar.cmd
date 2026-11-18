@echo off
title Puxador de Dados
cd /d "%~dp0"
if "%PORT%"=="" set "PORT=8790"
set "NODE_ENV=production"
echo.
echo  Puxador de Dados
echo  Endereco: http://localhost:%PORT%
echo  Encerrar: Ctrl+C
echo.
start "" "http://localhost:%PORT%"
node server.js
echo.
echo  Servidor encerrado.
pause
