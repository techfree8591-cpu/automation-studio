@echo off
title Automation Studio Pro - Commercial Edition
color 0b

echo ====================================================
echo        AUTOMATION STUDIO PRO - LAUNCHER
echo ====================================================
echo [*] Checking runtime environment...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js is not installed on this computer!
    echo [*] Opening Node.js download page...
    start https://nodejs.org/
    echo Please install Node.js and run this file again.
    pause
    exit /b 1
)

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [*] First-time setup: installing dependencies...
    call npm install --omit=dev
)

echo [*] Starting Automation Studio Pro Server...
start "" http://localhost:4000
node src/dashboard_server.mjs

pause
