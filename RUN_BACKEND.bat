@echo off
cd /d "%~dp0"
title Factory Backend - DO NOT CLOSE
call ".venv\Scripts\activate.bat"
echo Backend: http://0.0.0.0:8000
echo API Docs: http://0.0.0.0:8000/docs
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
echo.
echo Backend stopped or failed. Press any key to close.
pause >nul
