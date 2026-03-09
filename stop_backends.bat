@echo off
echo Stopping all HeartSense AI backends...

for %%P in (8000 8001 5000 8080) do (
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr ":%%P " ^| findstr LISTENING') do (
        echo   Killing PID %%A on port %%P
        taskkill /F /PID %%A >nul 2>&1
    )
)

echo.
echo All backends stopped.
