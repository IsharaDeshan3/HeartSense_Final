@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  HeartSense AI - Backend Services Launcher
::  Initializes venvs & installs requirements on first run,
::  then starts all 4 backend services in separate windows.
:: ============================================================

set ROOT=%~dp0

set PY_VER=
set PY_CMD=

for /f %%v in ('py -3.10 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2^>nul') do (
    set PY_VER=%%v
    set PY_CMD=py -3.10
)

if not defined PY_VER (
    for /f %%v in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2^>nul') do (
        set PY_VER=%%v
        set PY_CMD=python
    )
)

if not defined PY_VER (
    echo ERROR: Python was not found in PATH.
    echo Install Python 3.10+ and ensure either py -3.10 or python command works.
    pause
    exit /b 1
)

for /f "tokens=1,2 delims=." %%a in ("%PY_VER%") do (
    set PY_MAJOR=%%a
    set PY_MINOR=%%b
)

if %PY_MAJOR% LSS 3 (
    echo ERROR: Detected Python %PY_VER%. Python 3.10+ is required.
    pause
    exit /b 1
)

if %PY_MAJOR% EQU 3 if %PY_MINOR% LSS 10 (
    echo ERROR: Detected Python %PY_VER%. Python 3.10+ is required.
    pause
    exit /b 1
)

echo.
echo ====================================================================
echo   HeartSense AI - Backend Services Launcher
echo ====================================================================
echo   Using Python %PY_VER%
echo   Python Command: %PY_CMD%
echo.

:: ---- 1. Lab Backend (port 8000) ----
set SVC_NAME=Lab Backend
set SVC_DIR=%ROOT%lab_backend-main
set SVC_REQ=%SVC_DIR%\requirements.txt
set SVC_CMD=python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
call :setup_and_launch
echo.

:: ---- 2. Data Extraction (port 8001) ----
set SVC_NAME=Data Extraction
set SVC_DIR=%ROOT%data_extraction-main
set SVC_REQ=%SVC_DIR%\requirements.txt
set SVC_CMD=python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
call :setup_and_launch
echo.

:: ---- 3. ECG Backend (port 5000) ----
set SVC_NAME=ECG Backend
set SVC_DIR=%ROOT%ecg_backend-main
set SVC_REQ=%SVC_DIR%\requirements.txt
set SVC_CMD=python app.py
call :setup_and_launch
echo.

:: ---- 4. Analysis / KRA-ORA (port 8080) ----
set SVC_NAME=Analysis Flow - KRA-ORA
set SVC_DIR=%ROOT%analysis_flow
set SVC_REQ=%SVC_DIR%\requirements.txt
set SVC_CMD=python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload
call :setup_and_launch
echo.

echo ====================================================================
echo   All backends launched! Check the separate terminal windows.
echo ====================================================================
echo.
echo   Lab Backend         : http://localhost:8000
echo   Data Extraction     : http://localhost:8001
echo   ECG Backend         : http://localhost:5000
echo   Analysis (KRA-ORA)  : http://localhost:8080
echo.
pause
exit /b 0

:: ============================================================
::  Subroutine: setup_and_launch
::  - Creates .venv if missing, installs requirements
::  - Activates venv and launches the service in a new window
:: ============================================================
:setup_and_launch
echo  [%SVC_NAME%] Checking %SVC_DIR% ...

if not exist "%SVC_DIR%" (
    echo  [%SVC_NAME%] ERROR: Directory not found: %SVC_DIR%
    exit /b 1
)

:: Check if service-local .venv exists
if not exist "%SVC_DIR%\.venv\Scripts\activate.bat" (
    echo  [%SVC_NAME%] Creating virtual environment ...
    %PY_CMD% -m venv "%SVC_DIR%\.venv"
    if errorlevel 1 (
        echo  [%SVC_NAME%] ERROR: Failed to create venv
        exit /b 1
    )
    echo  [%SVC_NAME%] Installing requirements ...
    call "%SVC_DIR%\.venv\Scripts\activate.bat"
    "%SVC_DIR%\.venv\Scripts\python.exe" -m pip install --upgrade pip -q
    if exist "%SVC_REQ%" (
        "%SVC_DIR%\.venv\Scripts\python.exe" -m pip install -r "%SVC_REQ%" -q
        if errorlevel 1 (
            echo  [%SVC_NAME%] ERROR: Dependency installation failed
            call deactivate
            exit /b 1
        )
    ) else (
        echo  [%SVC_NAME%] WARNING: Requirements file not found: %SVC_REQ%
    )
    call deactivate
    echo  [%SVC_NAME%] Setup complete!
) else (
    echo  [%SVC_NAME%] Virtual environment already exists. Skipping install.
)

:: Launch in a new cmd window with the venv activated
echo  [%SVC_NAME%] Starting service ...
start "%SVC_NAME%" cmd /k "cd /d ""%SVC_DIR%"" && call .venv\Scripts\activate.bat && %SVC_CMD%"
exit /b 0
