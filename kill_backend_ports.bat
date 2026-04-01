@echo off
:: Batch script to kill all backend ports
set ports=8080 8081 8082 8083 8000 8001 5000 3000

for %%P in (%ports%) do (
    echo Killing processes on port %%P...
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P') do (
        echo Stopping PID %%A on port %%P...
        taskkill /F /PID %%A >nul 2>&1
    )
)
echo All backend ports have been cleared.