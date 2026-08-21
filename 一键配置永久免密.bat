@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo   SSH Key Setup (One-time password setup)
echo ========================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup_ssh_key.ps1"
echo.
pause
