@echo off
:: Robustly kill all processes listening on backend ports
setlocal enabledelayedexpansion
REM Deduplicated port list
set ports=8080 8081 8082 8083 8000 8001 5000 3000

for %%P in (%ports%) do (
    echo Killing processes on port %%P...
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        echo Stopping PID %%A on port %%P...
        taskkill /F /PID %%A >nul 2>&1
    )
)
REM Wait a moment for OS to release ports
timeout /t 2 >nul

REM Re-check for any still-listening ports
set stillbusy=0
for %%P in (%ports%) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        echo WARNING: Port %%P still in use by PID %%A
        set stillbusy=1
    )
)
if !stillbusy! equ 0 (
    echo All backend ports have been cleared.
) else (
    echo Some ports are still busy. You may need to close processes manually.
)
pause