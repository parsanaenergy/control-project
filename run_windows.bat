@echo off
setlocal
cd /d %~dp0

REM پیدا کردن آخرین نسخه Python نصب شده از طریق py launcher
for /f "tokens=*" %%i in ('py -0p 2^>nul') do (
set "LASTPY=%%i"
)

REM اگر py launcher نبود، از python استفاده کن
where py >nul 2>&1
if %errorlevel%==0 (
set "PYTHON_CMD=py -3"
) else (
set "PYTHON_CMD=python"
)

REM ساخت محیط مجازی در صورت نبودن
if not exist .venv (
%PYTHON_CMD% -m venv .venv
)

call .venv\Scripts\activate

REM آپدیت ابزارهای نصب
python -m pip install --upgrade pip setuptools wheel

REM نصب جدیدترین نسخه‌های سازگار با requirements
python -m pip install --upgrade -r backend\requirements.txt

REM اجرای بک‌اند
start "Factory Backend" cmd /k "cd /d %~dp0 && call .venv\Scripts\activate && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"

REM نصب پکیج‌های فرانت و آپدیت آن‌ها
cd frontend

if not exist node_modules (
npm install
) else (
npm update
)

REM اجرای فرانت
start "Factory Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 127.0.0.1"

echo.
echo Backend and Frontend are starting...
echo Open http://127.0.0.1:5173
echo.
pause

endlocal
