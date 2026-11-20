@echo off
title Desinstalar - Puxador de Dados
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\windows\desinstalar-windows.ps1" %*
if errorlevel 1 pause
