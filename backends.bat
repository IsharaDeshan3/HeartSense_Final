@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  HeartSense AI — Full System Launcher
::  Sets up venvs and starts all 4 backends + optional frontend.
:: ============================================================

set ROOT=%~dp0

:: ---- Detect Python ----
set PY_VER=
set PY_CMD=

for /f %%v in ('py -3.10 -c "import sys; print(str(sys.version_info.major)+\".\"+str(sys.version_info.minor))" 2^>nul') do (
    set PY_VER=%%v
    set PY_CMD=py -3.10
)
if not defined PY_VER (
    for /f %%v in ('python -c "import sys; print(str(sys.version_info.major)+\".\"+str(sys.version_info.minor))" 2^>nul') do (
        set PY_VER=%%v
        set PY_CMD=python
    )
)
if not defined PY_VER (
    echo ERROR: Python was not found in PATH.
    echo Install Python 3.10+ and ensure either "py -3.10" or "python" command works.
    pause
    exit /b 1
)
for /f "tokens=1,2 delims=." %%a in ("%PY_VER%") do (
    set PY_MAJOR=%%a
    set PY_MINOR=%%b
)
:: Strictly require Python 3.10.11
if not "%PY_VER%" == "3.10" (
    echo ERROR: Detected Python %PY_VER%. Python 3.10.11 is strictly required for all backend venvs.
    echo Please install Python 3.10.11 and ensure "py -3.10" or "python" points to it.
    pause & exit /b 1
)
:: Optionally check patch version
for /f %%p in ('%PY_CMD% -c "import sys; print(sys.version_info.micro)"') do set PY_PATCH=%%p
if not "%PY_PATCH%" == "11" (
    echo ERROR: Detected Python 3.10.%PY_PATCH%. Python 3.10.11 is strictly required for all backend venvs.
    echo Please install Python 3.10.11 and ensure "py -3.10" or "python" points to it.
    pause & exit /b 1
)

echo.
echo ====================================================================
echo   HeartSense AI — Full System Launcher
echo ====================================================================
echo   Python %PY_VER% (%PY_CMD%)
echo   Root:   %ROOT%
echo ====================================================================
echo.

:: ============================================================
::  Phase 0: Kill stale processes on backend ports
:: ============================================================
echo [Phase 0] Clearing occupied backend ports ...
for %%P in (8000 8001 5000 8080) do (
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr ":%%P " ^| findstr LISTENING') do (
        taskkill /F /PID %%A >nul 2>&1
    )
)
echo   Done.
echo.

:: ============================================================
::  Phase 1: Setup all venvs + install dependencies
:: ============================================================
echo [Phase 1] Setting up virtual environments ...
echo.

:: ---- 1a. Lab Backend ----
set SVC_NAME=Lab Backend
set SVC_DIR=%ROOT%lab_backend-main
set SVC_REQ=%SVC_DIR%\requirements.txt
call :setup_venv
echo.

:: ---- 1b. Data Extraction ----
set SVC_NAME=Data Extraction
set SVC_DIR=%ROOT%data_extraction-main
set SVC_REQ=%SVC_DIR%\requirements.txt
call :setup_venv
echo.

:: ---- 1c. ECG Backend ----
set SVC_NAME=ECG Backend
set SVC_DIR=%ROOT%ecg_backend-main
set SVC_REQ=%SVC_DIR%\requirements.txt
call :setup_venv
echo.

:: ---- 1d. Analysis Flow ----
set SVC_NAME=Analysis Flow
set SVC_DIR=%ROOT%analysis_flow
set SVC_REQ=%SVC_DIR%\requirements.txt
call :setup_venv

echo.
echo [Phase 1] All virtual environments ready.
echo.

:: ============================================================
::  Phase 2: Launch all backend services
:: ============================================================
echo [Phase 2] Starting backend services ...
echo.

:: ---- 6a. Lab Backend (port 8000) ----
echo   Starting Lab Backend on :8000 ...
start "Lab Backend - :8000" /D "%ROOT%lab_backend-main" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: ---- 6b. Data Extraction (port 8001) ----
echo   Starting Data Extraction on :8001 ...
start "Data Extraction - :8001" /D "%ROOT%data_extraction-main" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

:: ---- 6c. ECG Backend (port 5000) ----
echo   Starting ECG Backend on :5000 ...
start "ECG Backend - :5000" /D "%ROOT%ecg_backend-main" cmd /k ".venv\Scripts\python.exe app.py"

:: ---- 6d. Analysis Flow (port 8080) ----
echo   Starting Analysis Flow on :8080 ...
start "Analysis Flow KRA-ORA - :8080" /D "%ROOT%analysis_flow" cmd /k ".venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8080 --timeout-keep-alive 300"

echo.
echo ====================================================================
echo   All 4 backends launched!
echo ====================================================================
echo.
echo   Lab Backend         : http://localhost:8000
echo   Data Extraction     : http://localhost:8001
echo   ECG Backend         : http://localhost:5000
echo   Analysis (KRA-ORA)  : http://localhost:8080
echo.

:: ============================================================
::  Phase 7: Optionally launch frontend
:: ============================================================
choice /C YN /M "Launch frontend dev server (http://localhost:3000)?"
if errorlevel 2 goto :skip_frontend
if errorlevel 1 (
    echo.
    echo   Starting frontend ...
    if exist "%ROOT%heart-sense-ai-main\node_modules" (
        start "Frontend - :3000" /D "%ROOT%heart-sense-ai-main" cmd /k "pnpm dev"
    ) else (
        start "Frontend - :3000" /D "%ROOT%heart-sense-ai-main" cmd /k "pnpm install && pnpm dev"
    )
    echo   Frontend: http://localhost:3000
)
:skip_frontend

echo.
echo ====================================================================
echo   HeartSense AI is running! Press any key to exit this launcher.
echo   (Backend windows will keep running independently.)
echo ====================================================================
pause
exit /b 0

:: ============================================================
::  Subroutine: setup_venv
::  Creates .venv if missing, upgrades pip, installs requirements
:: ============================================================
:setup_venv
echo   [%SVC_NAME%] Checking %SVC_DIR% ...

if not exist "%SVC_DIR%" (
    echo   [%SVC_NAME%] ERROR: Directory not found: %SVC_DIR%
    exit /b 1
)

if not exist "%SVC_DIR%\.venv\Scripts\activate.bat" (
    echo   [%SVC_NAME%] Creating virtual environment ...
    %PY_CMD% -m venv "%SVC_DIR%\.venv"
    if errorlevel 1 (
        echo   [%SVC_NAME%] ERROR: Failed to create venv
        exit /b 1
    )
)

:: Fix broken venvs
if exist "%SVC_DIR%\.venv\Scripts\activate.bat" if not exist "%SVC_DIR%\.venv\Scripts\python.exe" (
    echo   [%SVC_NAME%] Broken venv detected. Recreating ...
    rmdir /s /q "%SVC_DIR%\.venv"
    %PY_CMD% -m venv "%SVC_DIR%\.venv"
    if errorlevel 1 (
        echo   [%SVC_NAME%] ERROR: Failed to recreate venv
        exit /b 1
    )
)

if not exist "%SVC_DIR%\.venv\Scripts\python.exe" (
    echo   [%SVC_NAME%] ERROR: venv python not found
    exit /b 1
)

echo   [%SVC_NAME%] Upgrading pip ...
"%SVC_DIR%\.venv\Scripts\python.exe" -m ensurepip --upgrade >nul 2>nul
"%SVC_DIR%\.venv\Scripts\python.exe" -m pip install --upgrade pip -q
if errorlevel 1 (
    echo   [%SVC_NAME%] ERROR: pip upgrade failed
    exit /b 1
)

if exist "%SVC_REQ%" (
    echo   [%SVC_NAME%] Installing requirements ...
    "%SVC_DIR%\.venv\Scripts\python.exe" -m pip install -r "%SVC_REQ%" -q
    if errorlevel 1 (
        echo   [%SVC_NAME%] ERROR: pip install failed
        exit /b 1
    )
    echo   [%SVC_NAME%] Ready.
) else (
    echo   [%SVC_NAME%] WARNING: No requirements.txt found
)
exit /b 0
