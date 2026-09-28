@echo off
rem Double-click to host Bloodflint on this PC.
cd /d "%~dp0"
title Bloodflint server

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org, install it, then run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting Bloodflint. Your browser will open in a moment.
echo Keep this window open while you play. Close it to stop the server.
echo.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node server\index.js
pause
