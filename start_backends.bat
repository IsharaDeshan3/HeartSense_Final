@echo off
set ROOT=%~dp0

echo Clearing backend ports (8000 8001 5000 8080)...
for %%P in (8000 8001 5000 8080) do (
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr ":%%P " ^| findstr LISTENING') do (
        taskkill /F /PID %%A >nul 2>&1
    )
)

echo Starting Lab Backend on :8000...
start "Lab Backend :8000" /D "%ROOT%lab_backend-main" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Data Extraction on :8001...
start "Data Extraction :8001" /D "%ROOT%data_extraction-main" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

echo Starting ECG Backend on :5000...
start "ECG Backend :5000" /D "%ROOT%ecg_backend-main" cmd /k ".venv\Scripts\python.exe app.py"

echo Starting Analysis Flow on :8080...
start "Analysis Flow :8080" /D "%ROOT%analysis_flow" cmd /k ".venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8080"

echo.
echo All 4 backends launched!
echo   Lab Backend      : http://localhost:8000
echo   Data Extraction  : http://localhost:8001
echo   ECG Backend      : http://localhost:5000
echo   Analysis Flow    : http://localhost:8080
