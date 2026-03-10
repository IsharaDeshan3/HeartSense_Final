@echo off
set ROOT=%~dp0
set FRONTEND_DIR=%ROOT%heart-sense-ai-main

echo Starting HeartSense AI frontend...

if exist "%FRONTEND_DIR%\node_modules" (
    start "Frontend :3000" /D "%FRONTEND_DIR%" cmd /k "pnpm dev"
) else (
    echo   node_modules not found — installing dependencies first...
    start "Frontend :3000" /D "%FRONTEND_DIR%" cmd /k "pnpm install && pnpm dev"
)

echo Waiting for frontend to be ready...
timeout /t 5 /nobreak >nul

echo Opening Chrome at http://localhost:3000 ...
start "" "chrome.exe" "http://localhost:3000"

echo.
echo Frontend launched at http://localhost:3000
