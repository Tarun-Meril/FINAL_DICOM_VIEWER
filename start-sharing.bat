@echo off
title Meril DICOM Viewer - Full Sharing Launcher
echo ========================================================
echo   Starting Meril DICOM Viewer Sharing System...
echo ========================================================
echo.

echo 1. Launching PACS Backend on port 3001 in a new window...
start "Meril PACS Backend (Port 3001)" cmd /c "%~dp0start-pacs-backend.bat"

echo.
echo Waiting 3 seconds for backend to initialize...
timeout /t 3 /nobreak >nul

echo 2. Launching Cloudflare Public Tunnel in a new window...
start "Meril Cloudflare Tunnel" cmd /c "%~dp0start-sharing-tunnel.bat"

echo.
echo ========================================================
echo Both services are now launching!
echo.
echo 1. Keep the "Meril PACS Backend" window open.
echo 2. From the "Meril Cloudflare Tunnel" window, copy your URL:
echo      https://xxxx.trycloudflare.com
echo.
echo 3. Your sharable link for end users:
echo      https://mydicom.netlify.app/?apiHost=https://xxxx.trycloudflare.com
echo ========================================================
echo.
pause
