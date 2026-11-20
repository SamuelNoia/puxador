@echo off
title Instalador - Puxador de Dados
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-windows.ps1" %*
if errorlevel 1 pause
