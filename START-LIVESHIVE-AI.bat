@echo off
title LiveShive Clipper - Private AI
cd /d "%~dp0"
echo.
echo ==============================================
echo   LIVESHIVE CLIPPER - PRIVATE AI MODE
echo ==============================================
echo.
echo Installing dependencies if needed...
if not exist node_modules\openai (
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
echo.
echo Starting the private AI engine...
start "LiveShive AI Engine" cmd /k "cd /d "%~dp0" && npm run ai:server"
timeout /t 2 /nobreak >nul
echo Opening LiveShive...
start "" "https://abdoutadj707-ops.github.io/LiveShive-Clipper/"
echo.
echo Keep the AI Engine window open while using LiveShive.
echo Your OpenAI key is stored locally by the engine, not in GitHub.
echo.
pause