@echo off
echo ===================================================
echo   Avvio Multi-Agent Financial Dashboard & Backend
echo ===================================================

powershell -Command "conda activate openaiAgent; Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd ''%~dp0''; node server.js'; Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd ''%~dp0frontend''; npm run dev'"

echo.
echo [OK] Processi avviati in finestre PowerShell separate!
echo Backend su http://localhost:3001
echo Frontend su http://localhost:5173
