@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  HeartSense AI — Full System Launcher
::  Handles venvs, CUDA llama-cpp, GGUF model download,
::  and starts all 4 backends + optional frontend.
:: ============================================================

set ROOT=%~dp0
set LOCAL_MODE=true

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
::  Phase 2: Ensure llama-cpp-python with CUDA support
::           (Analysis Flow only — needs special index URL)
:: ============================================================
set AF_PYTHON=%ROOT%analysis_flow\.venv\Scripts\python.exe

echo [Phase 2] Checking llama-cpp-python (CUDA) ...

:: Test if llama_cpp is importable AND supports GPU offload
"%AF_PYTHON%" -c "import llama_cpp" >nul 2>&1
if errorlevel 1 (
    echo   llama-cpp-python not importable. Installing CUDA wheel ...
    goto :install_llama_cuda
) else (
    :: Check if current install supports GPU offload
    "%AF_PYTHON%" -c "import llama_cpp.llama_cpp as lib; exit(0 if hasattr(lib,'llama_supports_gpu_offload') and lib.llama_supports_gpu_offload() else 1)" >nul 2>&1
    if errorlevel 1 (
        echo   llama-cpp-python installed but NO GPU support. Reinstalling with CUDA ...
        "%AF_PYTHON%" -m pip uninstall llama-cpp-python -y -q >nul 2>&1
        goto :install_llama_cuda
    ) else (
        echo   llama-cpp-python already installed with GPU support.
    )
)
echo.
goto :after_llama_cpp

:install_llama_cuda
echo   Attempting CUDA 12.x wheel from abetlen index ...
"%AF_PYTHON%" -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124 --prefer-binary --upgrade -q
if errorlevel 1 (
    echo   CUDA 12.4 wheel failed. Trying CUDA 12.6 ...
    "%AF_PYTHON%" -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu126 --prefer-binary --upgrade -q
    if errorlevel 1 goto :install_llama_cpp_cpu
)
:: Verify GPU support after install
"%AF_PYTHON%" -c "import llama_cpp.llama_cpp as lib; exit(0 if hasattr(lib,'llama_supports_gpu_offload') and lib.llama_supports_gpu_offload() else 1)" >nul 2>&1
if errorlevel 1 (
    echo   WARNING: Installed wheel does not report GPU offload. Falling back to CPU wheel ...
    goto :install_llama_cpp_cpu
)
echo   Installed llama-cpp-python with CUDA/GPU support!
echo.
goto :after_llama_cpp

:install_llama_cpp_cpu
echo   GPU wheel/build unavailable. Trying CPU-only binary wheel ...
"%AF_PYTHON%" -m pip install llama-cpp-python --only-binary=llama-cpp-python -q
if errorlevel 1 (
    echo.
    echo   WARNING: No usable llama-cpp-python installation could be created.
    echo   Local LLM inference will NOT work until this is resolved.
    echo   To fix GPU builds: install Visual Studio Build Tools with CUDA integration, then re-run.
    echo   Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo   Continuing to start other services ...
    echo.
) else (
    echo   Installed CPU-only llama-cpp-python. No GPU inference.
)
echo.

:after_llama_cpp

:: ============================================================
::  Phase 3: Download GGUF models in background (first-time only)
::           Services launch immediately; models load when ready.
:: ============================================================
echo [Phase 3] Checking GGUF models ...

set KRA_GPU_MODEL=%ROOT%analysis_flow\models\deepseek-r1-8b-q5_k_m.gguf
set KRA_CPU_MODEL=%ROOT%analysis_flow\models\DeepSeek-R1-Distill-Llama-8B-Q5_K_M.gguf
set ORA_MODEL=%ROOT%analysis_flow\models\phi-3.5-mini-q4_k_m.gguf

set MODELS_NEEDED=0
if not exist "%KRA_GPU_MODEL%" set MODELS_NEEDED=1
if not exist "%KRA_CPU_MODEL%" set MODELS_NEEDED=1
if not exist "%ORA_MODEL%" set MODELS_NEEDED=1

if %MODELS_NEEDED% EQU 1 (
    echo   Models missing — launching background downloader window.
    echo   KRA GPU: ~5.5 GB  KRA CPU: ~4.4 GB  ORA: ~2.3 GB
    echo   Download runs in a separate window.
    echo   Services will start now; LLM inference activates once models finish.
    start "GGUF Model Downloader" /D "%ROOT%analysis_flow" cmd /k "echo Downloading GGUF models... && .venv\Scripts\python.exe download_models.py && echo Models ready! && pause"
) else (
    echo   All GGUF models present.
)
echo.

:: ============================================================
::  Phase 4: Write LLM config to .env if missing (via Python)
:: ============================================================
echo [Phase 4] Checking .env configuration ...

set AF_ENV=%ROOT%analysis_flow\.env
"%AF_PYTHON%" -c "import pathlib; p=pathlib.Path(r'%AF_ENV%'); c=p.read_text(encoding='utf-8') if p.exists() else ''; need=not p.exists() or ('LOCAL_MODE' not in c); print('Adding LLM config...' if need else 'LLM config already present. Skipping append.'); p.write_text('LOCAL_MODE=true\n# Local LLM Config\nKRA_MODEL_PATH=models/deepseek-r1-8b-q5_k_m.gguf\nKRA_N_GPU_LAYERS=28\nKRA_N_CTX=8192\nKRA_CPU_FALLBACK_MODEL_PATH=models/DeepSeek-R1-Distill-Llama-8B-Q5_K_M.gguf\nKRA_CPU_FALLBACK_N_GPU_LAYERS=0\nKRA_CPU_FALLBACK_N_CTX=4096\nKRA_CPU_FALLBACK_TEMPERATURE=0.2\nKRA_CPU_FALLBACK_MAX_TOKENS=1024\nORA_MODEL_PATH=models/phi-3.5-mini-q4_k_m.gguf\nORA_N_GPU_LAYERS=0\nORA_N_CTX=4096\nORA_TEMPERATURE=0.3\n', encoding='utf-8') if need else None"
echo.

:: ============================================================
::  Phase 5: Pre-validate models can be found
:: ============================================================
echo [Phase 5] Validating model files ...

if exist "%KRA_GPU_MODEL%" (
    call :report_model_size "%KRA_GPU_MODEL%" "KRA GPU model"
) else (
    echo   INFO: KRA GPU model not found — will use CPU fallback.
)

if exist "%KRA_CPU_MODEL%" (
    call :report_model_size "%KRA_CPU_MODEL%" "KRA CPU model - Qwen2.5-7B"
) else (
    echo   WARNING: KRA CPU fallback model not found — inference may fail without GPU.
)

if exist "%ORA_MODEL%" (
    call :report_model_size "%ORA_MODEL%" "ORA model"
) else (
    echo   WARNING: ORA model file not found — inference will fail.
)
echo.

:: ============================================================
::  Phase 6: Launch all backend services
:: ============================================================
echo [Phase 6] Starting backend services ...
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

:: ---- 6d. Analysis Flow (port 8080) — starts and eagerly preloads LLM ----
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
echo   LLM models will be loaded into GPU/CPU memory automatically
echo   at startup (KRA on GPU, ORA on CPU). First load takes 30-90s.
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
::  Subroutine: report_model_size
::  Uses PowerShell to avoid 32-bit cmd arithmetic overflow
:: ============================================================
:report_model_size
set "MODEL_PATH=%~1"
set "MODEL_LABEL=%~2"
for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "[int][math]::Round((Get-Item -LiteralPath '%MODEL_PATH%').Length / 1MB)"`) do (
    set "MODEL_SIZE_MB=%%S"
)
echo   %MODEL_LABEL%: %MODEL_SIZE_MB% MB
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
