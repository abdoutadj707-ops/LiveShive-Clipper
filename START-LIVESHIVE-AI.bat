@echo off
title LiveShive AI Engine
cd /d "%~dp0"
echo.
echo ==========================================
echo   LiveShive AI Engine - PRIVATE LOCAL MODE
echo ==========================================
echo.
if not exist node_modules\openai (
  echo Installing AI engine dependencies...
  call npm install
)
echo.
echo Starting LiveShive AI Engine on 127.0.0.1:8787
echo Keep this window open while using LiveShive.
echo.
call npm run ai:server
pause
