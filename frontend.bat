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

pushd "%FE_DIR%"

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
            npm --prefix "%FE_DIR%" install
            echo.
            echo  Dependencies installed successfully with npm.
        )
    )

    echo  Running: pnpm install
    pnpm --dir "%FE_DIR%" install
    if errorlevel 1 (
        echo  ERROR: pnpm install failed. Trying npm install ...
        npm --prefix "%FE_DIR%" install
    )
    echo.
    echo  Dependencies installed successfully!
    echo.
)

:: Ensure Next.js is available
where next >nul 2>nul
if errorlevel 1 (
    echo  Next.js not found. Installing it locally ...
    npm --prefix "%FE_DIR%" install next
    if errorlevel 1 (
        echo  ERROR: Failed to install Next.js. Please check your setup.
        pause
        exit /b 1
    )
)

:: Start the dev server
cd "%FE_DIR%"
echo  Starting frontend server on http://localhost:3000 ...
pnpm --dir "%FE_DIR%" dev || npm --prefix "%FE_DIR%" run dev

popd
pause
exit /b 0
