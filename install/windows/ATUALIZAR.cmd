@echo off
title Atualizar - Puxador de Dados
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar-windows.ps1" %*
if errorlevel 1 pause
