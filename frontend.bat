@echo off
setlocal

:: ============================================================
::  HeartSense AI - Frontend Launcher
::  On first launch: installs dependencies (npm i + pnpm)
::  On subsequent launches: just starts the dev server
:: ============================================================

set ROOT=%~dp0
set FE_DIR=%ROOT%heart-sense-ai-main

echo.
echo ====================================================================
echo   HeartSense AI - Frontend Launcher
echo ====================================================================
echo.

if not exist "%FE_DIR%" (
    echo  ERROR: Frontend directory not found: %FE_DIR%
    pause
    exit /b 1
)

cd /d "%FE_DIR%"

:: Check if node_modules exists (first launch detection)
if not exist "%FE_DIR%\node_modules" (
    echo  First launch detected. Installing dependencies ...
    echo.

    :: Check if pnpm is installed
    where pnpm >nul 2>nul
    if errorlevel 1 (
        echo  pnpm not found. Installing pnpm globally ...
        npm install -g pnpm
        if errorlevel 1 (
            echo  ERROR: Failed to install pnpm. Falling back to npm.
            echo  Running: npm install
            npm install
            echo.
            echo  Starting dev server with npm ...
            npm run dev
            pause
            exit /b 0
        )
    )

    echo  Running: pnpm install
    pnpm install
    if errorlevel 1 (
        echo  ERROR: pnpm install failed. Trying npm install ...
        npm install
    )
    echo.
    echo  Dependencies installed successfully!
    echo.
) else (
    echo  Dependencies already installed. Skipping install.
)

echo  Starting frontend dev server ...
echo  URL: http://localhost:3000
echo.

:: Start the dev server
pnpm dev

pause
exit /b 0
