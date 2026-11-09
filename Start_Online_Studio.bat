@echo off
title Automation Studio Pro - Free Mobile & Online Access
color 0b

echo ====================================================
echo    AUTOMATION STUDIO PRO - FREE MOBILE LINK
echo ====================================================
echo [*] Starting Local Automation Server on port 4000...

cd /d "%~dp0"

start /b "" node src/dashboard_server.mjs

echo [*] Generating 100%% Free Secure Public HTTPS URL for Android...
echo [*] Waiting 3 seconds for server startup...
timeout /t 3 /nobreak >nul

echo ====================================================
echo [!] OPEN THIS CLOUDFLARE HTTPS URL ON YOUR ANDROID PHONE (4G/5G/Wi-Fi):
echo ====================================================

if exist "%~dp0cloudflared.exe" (
  "%~dp0cloudflared.exe" tunnel --url http://localhost:4000
) else (
  cloudflared tunnel --url http://localhost:4000 2>nul || call npx --yes localtunnel --port 4000
)

pause
