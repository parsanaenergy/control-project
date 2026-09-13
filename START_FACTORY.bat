@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Factory Project Manager - One Click Setup

set "NPM_REGISTRY=https://registry.npmjs.org/"
set "BACKEND_URL=http://0.0.0.0:8000"
set "FRONTEND_URL=http://127.0.0.1:5173"
set "LOG_FILE=%~dp0startup_log.txt"

>"%LOG_FILE%" echo Factory Project Manager startup log
>>"%LOG_FILE%" echo Started: %date% %time%
>>"%LOG_FILE%" echo Folder: %~dp0

cls
echo ======================================================
echo   Factory Project Manager - ONE CLICK SETUP + RUN
echo ======================================================
echo.
echo This window will stay open. If anything fails, the error
echo will be shown here and also saved to startup_log.txt.
echo.

REM ------------------------------------------------------
REM 1) Find Python
REM ------------------------------------------------------
echo [1/9] Checking Python...
where py >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=py -3"
) else (
    where python >nul 2>&1
    if errorlevel 1 goto :python_missing
    set "PY_CMD=python"
)

%PY_CMD% --version
if errorlevel 1 goto :python_bad
%PY_CMD% --version >>"%LOG_FILE%" 2>&1

REM ------------------------------------------------------
REM 2) Create virtual environment
REM ------------------------------------------------------
echo.
echo [2/9] Preparing Python virtual environment...
if not exist ".venv\Scripts\python.exe" (
    %PY_CMD% -m venv ".venv" >>"%LOG_FILE%" 2>&1
    if errorlevel 1 goto :venv_failed
) else (
    echo Existing .venv found - reusing it.
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 goto :venv_activate_failed

REM ------------------------------------------------------
REM 3) Upgrade pip tooling
REM ------------------------------------------------------
echo.
echo [3/9] Updating pip, setuptools and wheel...
python -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :pip_failed

REM ------------------------------------------------------
REM 4) Backend dependencies
REM ------------------------------------------------------
echo.
echo [4/9] Installing backend requirements...
python -m pip install --upgrade -r "backend\requirements.txt"
if errorlevel 1 goto :backend_deps_failed

REM ------------------------------------------------------
REM 5) Check Node/npm
REM ------------------------------------------------------
echo.
echo [5/9] Checking Node.js and npm...
where node >nul 2>&1
if errorlevel 1 goto :node_missing
where npm >nul 2>&1
if errorlevel 1 goto :npm_missing
node --version
call npm --version
if errorlevel 1 goto :npm_bad

REM ------------------------------------------------------
REM 6) Configure official npm registry
REM IMPORTANT: npm is npm.cmd on Windows, so CALL is required
REM ------------------------------------------------------
echo.
echo [6/9] Configuring official npm registry...
call npm config set registry "%NPM_REGISTRY%"
if errorlevel 1 goto :registry_failed
call npm config get registry
if errorlevel 1 goto :registry_failed

REM ------------------------------------------------------
REM 7) Frontend dependencies
REM ------------------------------------------------------
echo.
echo [7/9] Installing frontend packages...
pushd "%~dp0frontend"
if errorlevel 1 goto :frontend_folder_missing

if exist "package-lock.json" (
    echo package-lock.json found - using npm ci...
    call npm ci --registry="%NPM_REGISTRY%" --fetch-timeout=180000 --fetch-retries=3
) else (
    echo First install - using npm install...
    call npm install --registry="%NPM_REGISTRY%" --fetch-timeout=180000 --fetch-retries=3
)

if errorlevel 1 (
    echo.
    echo First npm attempt failed. Cleaning cache and retrying...
    call npm cache clean --force
    call npm install --registry="%NPM_REGISTRY%" --fetch-timeout=240000 --fetch-retries=4 --no-audit
    if errorlevel 1 (
        popd
        goto :frontend_deps_failed
    )
)
popd

REM ------------------------------------------------------
REM 8) Create helper launchers
REM ------------------------------------------------------
echo.
echo [8/9] Preparing Backend and Frontend launchers...

>"%~dp0RUN_BACKEND.bat" echo @echo off
>>"%~dp0RUN_BACKEND.bat" echo cd /d "%%~dp0"
>>"%~dp0RUN_BACKEND.bat" echo title Factory Backend - DO NOT CLOSE
>>"%~dp0RUN_BACKEND.bat" echo call ".venv\Scripts\activate.bat"
>>"%~dp0RUN_BACKEND.bat" echo echo Backend: http://0.0.0.0:8000
>>"%~dp0RUN_BACKEND.bat" echo echo API Docs: http://0.0.0.0:8000/docs
>>"%~dp0RUN_BACKEND.bat" echo python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
>>"%~dp0RUN_BACKEND.bat" echo echo.
>>"%~dp0RUN_BACKEND.bat" echo echo Backend stopped or failed. Press any key to close.
>>"%~dp0RUN_BACKEND.bat" echo pause ^>nul

>"%~dp0RUN_FRONTEND.bat" echo @echo off
>>"%~dp0RUN_FRONTEND.bat" echo cd /d "%%~dp0frontend"
>>"%~dp0RUN_FRONTEND.bat" echo title Factory Frontend - DO NOT CLOSE
>>"%~dp0RUN_FRONTEND.bat" echo echo Frontend: http://0.0.0.0:5173
>>"%~dp0RUN_FRONTEND.bat" echo if not exist "node_modules\.bin\vite.cmd" ^(
>>"%~dp0RUN_FRONTEND.bat" echo   echo Frontend dependencies are missing. Installing them now...
>>"%~dp0RUN_FRONTEND.bat" echo   call npm install --registry=https://registry.npmjs.org/ --no-audit
>>"%~dp0RUN_FRONTEND.bat" echo   if errorlevel 1 ^(
>>"%~dp0RUN_FRONTEND.bat" echo     echo Frontend dependencies could not be installed.
>>"%~dp0RUN_FRONTEND.bat" echo     pause
>>"%~dp0RUN_FRONTEND.bat" echo     exit /b 1
>>"%~dp0RUN_FRONTEND.bat" echo   ^)
>>"%~dp0RUN_FRONTEND.bat" echo ^)
>>"%~dp0RUN_FRONTEND.bat" echo call npm run dev -- --host 0.0.0.0 --port 5173
>>"%~dp0RUN_FRONTEND.bat" echo echo.
>>"%~dp0RUN_FRONTEND.bat" echo echo Frontend stopped or failed. Press any key to close.
>>"%~dp0RUN_FRONTEND.bat" echo pause ^>nul

REM ------------------------------------------------------
REM 9) Start both services
REM ------------------------------------------------------
echo.
echo [9/9] Starting Backend and Frontend...
start "Factory Backend" "%ComSpec%" /k call "%~dp0RUN_BACKEND.bat"
if errorlevel 1 goto :backend_start_failed

timeout /t 2 /nobreak >nul
start "Factory Frontend" "%ComSpec%" /k call "%~dp0RUN_FRONTEND.bat"
if errorlevel 1 goto :frontend_start_failed

echo Waiting for services to start...
timeout /t 6 /nobreak >nul
start "" "%FRONTEND_URL%"

echo.
echo ======================================================
echo   STARTUP COMPLETED
echo ======================================================
echo   Frontend : %FRONTEND_URL%
echo   Backend  : %BACKEND_URL%
echo   API Docs : %BACKEND_URL%/docs
echo ======================================================
echo.
echo Two separate windows should now be open:
echo   1. Factory Backend
 echo   2. Factory Frontend
echo.
echo Keep those two windows open while using the program.
echo This installer window will NOT close automatically.
echo.
pause
goto :eof

:python_missing
echo [ERROR] Python was not found.
echo Install Python 3.11 or newer and enable Add Python to PATH.
goto :fail

:python_bad
echo [ERROR] Python exists but could not run correctly.
goto :fail

:venv_failed
echo [ERROR] Could not create Python virtual environment (.venv).
goto :fail

:venv_activate_failed
echo [ERROR] Could not activate .venv.
goto :fail

:pip_failed
echo [ERROR] pip/setuptools/wheel upgrade failed.
goto :fail

:backend_deps_failed
echo [ERROR] Backend dependencies failed to install.
goto :fail

:node_missing
echo [ERROR] Node.js was not found. Install Node.js LTS and run again.
goto :fail

:npm_missing
echo [ERROR] npm was not found.
goto :fail

:npm_bad
echo [ERROR] npm exists but is not working correctly.
goto :fail

:registry_failed
echo [ERROR] Could not configure npm registry.
goto :fail

:frontend_folder_missing
echo [ERROR] frontend folder was not found.
goto :fail

:frontend_deps_failed
echo [ERROR] Frontend packages could not be installed.
echo Try running this manually inside frontend:
echo   npm install --verbose
goto :fail

:backend_start_failed
echo [ERROR] Could not open Backend window.
goto :fail

:frontend_start_failed
echo [ERROR] Could not open Frontend window.
goto :fail

:fail
echo.
echo ======================================================
echo   SETUP STOPPED BECAUSE OF AN ERROR
echo ======================================================
echo.
echo The window will stay open so you can read the error.
echo Send me a photo or copy the last lines shown above.
echo.
>>"%LOG_FILE%" echo FAILED: %date% %time%
pause
goto :eof
