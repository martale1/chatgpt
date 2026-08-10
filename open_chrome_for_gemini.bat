@echo off
echo ========================================================
echo   Avvio Google Chrome per Analisi Grafico AI Gemini Web
echo ========================================================
echo.
echo Apertura della finestra visibile di Chrome in primo piano (Porta 9222)...
echo.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\PycharmProjects\webscraping\gemini_chrome_profile" --start-maximized "https://gemini.google.com"
echo.
echo ✅ Finestra aperta! Ora puoi lanciare le analisi dalla Dashboard Web!
