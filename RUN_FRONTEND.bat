@echo off
cd /d "%~dp0frontend"
title Factory Frontend - DO NOT CLOSE
echo Frontend: http://0.0.0.0:5173
if not exist "node_modules\.bin\vite.cmd" (
  echo Frontend dependencies are missing. Installing them now...
  call npm install --registry=https://registry.npmjs.org/ --no-audit
  if errorlevel 1 (
    echo Frontend dependencies could not be installed.
    pause
    exit /b 1
  )
)
call npm run dev -- --host 0.0.0.0 --port 5173
echo.
echo Frontend stopped or failed. Press any key to close.
pause >nul
