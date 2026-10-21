@echo off
setlocal enabledelayedexpansion
title MerilView Cloudflare Tunnel for Netlify
color 0B
cls

echo ======================================================================
echo          MerilView - Cloudflare Tunnel for Netlify Hosting
echo ======================================================================
echo.
echo Connecting Netlify (https://myddicom.netlify.app) to local D: drive
echo Clinical Storage: D:\MerilView_Data
echo.

:: 1. Verify cloudflared executable is available
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 'cloudflared.exe' is not found in PATH.
    echo Please make sure Cloudflare Tunnel CLI (cloudflared) is installed.
    echo.
    pause
    exit /b 1
)

:: 2. Check if local PACS service (port 3001) is running
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo [INFO] Local PACS backend on port 3001 is not running.
    echo Launching PACS Server in background...
    if exist "%~dp0..\2_Start_PACS_Server.bat" (
        start "MerilView PACS Server" cmd /c "%~dp0..\2_Start_PACS_Server.bat"
    )
    echo Waiting for PACS backend to initialize...
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] Local PACS server is running on port 3001 (D:\MerilView_Data).
)

echo.
echo ======================================================================
echo Starting Cloudflare Tunnel on http://127.0.0.1:3001...
echo.
echo Once connected:
echo 1. Cloudflare will print your public tunnel URL (e.g. https://xxx.trycloudflare.com).
echo 2. Open https://myddicom.netlify.app
echo 3. In MerilView, click 'Cloudflare' in the top bar and paste your tunnel URL.
echo    Or append ?apiHost=YOUR_TUNNEL_URL to any Netlify share link!
echo ======================================================================
echo.

if not "%~1"=="" (
    echo Connecting with provided Cloudflare Tunnel Token...
    cloudflared tunnel run --token %~1
) else (
    echo Starting quick tunnel to http://127.0.0.1:3001...
    cloudflared tunnel --url http://127.0.0.1:3001
)

echo.
echo Cloudflare Tunnel stopped.
pause
