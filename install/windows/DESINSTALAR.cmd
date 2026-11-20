@echo off
title Desinstalar - Puxador de Dados
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar-windows.ps1" %*
if errorlevel 1 pause
