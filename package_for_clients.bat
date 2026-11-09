@echo off
title Package Automation Studio for Buyers
color 0a

echo ====================================================
echo    BUILDING BUYER DISTRIBUTION PACKAGE (ZIP)
echo ====================================================

set "DEST=%~dp0dist\Automation_Studio_Pro"

if exist "%~dp0dist\" rmdir /s /q "%~dp0dist\"
mkdir "%DEST%"
mkdir "%DEST%\src"
mkdir "%DEST%\state"
mkdir "%DEST%\reels"

echo [*] Copying core application files...
copy "%~dp0package.json" "%DEST%\" >nul
copy "%~dp0package-lock.json" "%DEST%\" >nul
copy "%~dp0Start_Automation_Studio.bat" "%DEST%\" >nul
copy "%~dp0Start_Online_Studio.bat" "%DEST%\" >nul
copy "%~dp0START_HERE_BUYER_GUIDE.md" "%DEST%\" >nul
copy "%~dp0run_daily_silent.vbs" "%DEST%\" >nul
if exist "%~dp0cloudflared.exe" copy "%~dp0cloudflared.exe" "%DEST%\" >nul

copy "%~dp0src\*.mjs" "%DEST%\src\" >nul
copy "%~dp0src\*.py" "%DEST%\src\" >nul

echo [*] Creating clean config template...
copy "%~dp0config.json" "%DEST%\config.json" >nul

echo [*] Creating clean state files...
echo {} > "%DEST%\state\metadata_overrides.json"
echo {"lastRun":null,"totalUploaded":0,"uploadedFiles":[]} > "%DEST%\state\history.json"
echo {"youtube":false,"instagram":false,"status":"disconnected"} > "%DEST%\state\auth_status.json"

echo [*] Compressing into client zip package...
powershell -Command "Compress-Archive -Path '%DEST%' -DestinationPath '%~dp0dist\Automation_Studio_Pro_v1.0.zip' -Force"

echo ====================================================
echo [+] SUCCESS! Buyer package ready at:
echo     dist\Automation_Studio_Pro_v1.0.zip
echo ====================================================
pause
