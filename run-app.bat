@echo off
setlocal

set "APP_DIR=%~dp0"
set "LOCAL_NODE=%APP_DIR%.runtime\node\node.exe"

cd /d "%APP_DIR%"

if exist "%LOCAL_NODE%" (
  start "" "%LOCAL_NODE%" "%APP_DIR%server.js"
  timeout /t 1 /nobreak >nul
  start "" "http://localhost:5173"
  exit /b 0
)

where node >nul 2>nul
if not errorlevel 1 (
  start "" node "%APP_DIR%server.js"
  timeout /t 1 /nobreak >nul
  start "" "http://localhost:5173"
  exit /b 0
)

echo Node.js was not found on this PC.
echo Downloading a portable Node.js runtime into this app folder...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%setup-node.ps1"
if errorlevel 1 (
  echo.
  echo Failed to prepare Node.js.
  echo Please connect to the internet and run this file again, or install Node.js from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "%LOCAL_NODE%" (
  echo.
  echo Node.js setup finished, but node.exe was not found.
  pause
  exit /b 1
)

start "" "%LOCAL_NODE%" "%APP_DIR%server.js"
timeout /t 1 /nobreak >nul
start "" "http://localhost:5173"
exit /b 0
