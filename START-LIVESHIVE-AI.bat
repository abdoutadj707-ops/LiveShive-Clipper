@echo off
title LiveShive Clipper - Private AI
cd /d "%~dp0"
echo.
echo ==============================================
echo   LIVESHIVE CLIPPER - PRIVATE AI MODE
echo ==============================================
echo.
echo Installing / updating dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo Dependency installation failed.
  pause
  exit /b 1
)
echo.
echo Starting the private AI engine...
start "LiveShive AI Engine" cmd /k "cd /d "%~dp0" && npm run ai:server"
timeout /t 3 /nobreak >nul
echo Starting the local LiveShive interface...
start "LiveShive Local App" cmd /k "cd /d "%~dp0" && npm run dev"
timeout /t 3 /nobreak >nul
echo Opening LiveShive locally...
start "" "http://127.0.0.1:5173/LiveShive-Clipper/"
echo.
echo ==============================================
echo  KEEP BOTH WINDOWS OPEN
echo  1. AI Engine
echo  2. LiveShive Local App
echo ==============================================
echo.
echo Enter your OpenAI API key inside the app.
echo It is stored locally by the private AI engine.
echo.
pause