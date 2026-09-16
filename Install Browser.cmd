@echo off
REM Optional, explicit Chromium download using the portable runtime or installed Node.
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" "node_modules\playwright\cli.js" install chromium
) else (
  node "node_modules\playwright\cli.js" install chromium
)
if errorlevel 1 (
  echo Browser installation failed. Check internet access and installed dependencies.
  pause
  exit /b 1
)
echo Chromium installed. Restart Web Crawler Studio or choose Recheck installation.
pause
