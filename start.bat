@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: downloading Electron. This can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Copy the text above and send it to Claude.
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
