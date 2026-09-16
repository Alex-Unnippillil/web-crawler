REM Repository note: Windows source launcher that prepares and starts the local Studio GUI.
rem Windows launcher: prepares dependencies when needed and starts the local Studio server.
@echo off
setlocal
cd /d "%~dp0"
title Web Crawler Studio
if exist "runtime\node.exe" (
  "runtime\node.exe" "scripts\launch.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js is not installed.
    echo Install Node.js 24 LTS from https://nodejs.org and reopen this file.
    echo Or download the Windows portable ZIP from the project's GitHub Releases page.
    pause
    exit /b 1
  )
  node "scripts\launch.mjs"
)
if errorlevel 1 (
  echo.
  echo The application stopped with an error. The details are above.
  echo See the Troubleshooting section of README.md.
  pause
)
endlocal
