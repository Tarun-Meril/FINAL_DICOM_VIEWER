@echo off
title Meril DICOM Viewer - Public Shareable Tunnel
echo ========================================================
echo   Meril DICOM Viewer - Cloudflare Sharing Tunnel
echo ========================================================
echo.

if not exist "%~dp0cloudflared.exe" (
    echo [!] cloudflared.exe not found in this directory.
    pause
    exit /b 1
)

echo Starting Cloudflare Tunnel exposing local PACS backend (port 3001)...
echo.
echo Please wait a few seconds for the tunnel to connect...
echo Look for your public URL below:
echo.
echo   https://xxxx.trycloudflare.com
echo.
echo Once you see the URL, your shareable link is:
echo   https://mydicom.netlify.app/?apiHost=https://xxxx.trycloudflare.com
echo ========================================================
echo.

"%~dp0cloudflared.exe" tunnel --url http://localhost:3001
pause
