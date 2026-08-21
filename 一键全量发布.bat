@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo   Deploy All (Frontend + Backend) to https://www.xiguazi.online
echo ========================================================
echo.
node "%~dp0scripts\deploy.mjs" --target=all
echo.
pause
