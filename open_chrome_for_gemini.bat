@echo off
title Avvio Google Chrome Gemini Web
echo ========================================================
echo   Avvio Google Chrome per Analisi Grafico AI Gemini Web
echo ========================================================
echo.
echo 1. Pulizia eventuali processi di background residui...
powershell -Command "Get-WmiObject Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*gemini_chrome_profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo 2. Apertura della finestra visibile di Chrome in primo piano (Porta 9222)...
echo.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\PycharmProjects\webscraping\gemini_chrome_profile" --new-window --start-maximized "https://gemini.google.com"
echo.
echo ✅ Finestra visibile di Chrome aperta con successo!
echo Puoi lasciarla aperta ed avviare le analisi dalla Dashboard Web.
echo.
