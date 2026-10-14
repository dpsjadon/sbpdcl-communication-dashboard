@echo off
title SBPDCL Non-Communication Smart Meter Executive Dashboard
cd /d "%~dp0"
echo ========================================================
echo   SBPDCL Non-Communication Smart Meter Executive Dashboard
echo ========================================================
echo Starting Express Server on port 8098...
node start_service.js
pause
