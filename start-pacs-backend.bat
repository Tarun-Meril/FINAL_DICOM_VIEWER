@echo off
title Meril PACS Backend (Port 3001)
echo ========================================================
echo   Starting Meril PACS Study Browser Backend...
echo ========================================================
echo.

cd /d "%~dp0pacs-study-browser\backend"
npm run dev
pause
