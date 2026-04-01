@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  Script to Erase Virtual Environments from Each Folder
:: ============================================================

echo Deleting virtual environments from each folder...

:: Define folders containing virtual environments
set FOLDERS=(
    "analysis_flow"
    "lab_backend-main"
    "data_extraction-main"
    "ecg_backend-main"
)

:: Loop through each folder and delete the .venv directory
for %%F in %FOLDERS% do (
    set VENV_PATH="%~dp0%%F\.venv"
    if exist !VENV_PATH! (
        echo Deleting virtual environment in %%F...
        rmdir /S /Q !VENV_PATH!
        echo Virtual environment in %%F deleted.
    ) else (
        echo No virtual environment found in %%F.
    )
)

echo All virtual environments processed.
endlocal