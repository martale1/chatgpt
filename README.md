# Multi-Agent Financial News Analyzer (Playwright + ChatGPT + React)

Sistema **Multi-Agent** per l'estrazione, classificazione e sentiment analysis di notizie finanziarie tramite automazione **Playwright** su ChatGPT e dashboard di visualizzazione **React**.

---

## 🎯 Caratteristiche Principali

- **Input Flessibile**: Cerca notizie specificando un **Ticker** (es. `AVIO.MI`, `VOD.L`, `AAPL`) oppure il **Nome dell'Azienda** (es. `Avio`, `Vodafone`, `Apple`).
- **Analisi Strutturata in JSON**:
  - **Notizie recenti negli ultimi 3 giorni** (incluso oggi).
  - **Ultime notizie storiche rilevanti disponibili** (se non ci sono news negli ultimi 3 giorni).
  - **Classificazione della news** (*Financials*, *Contratti*, *M&A*, *Analisti/Rating*, *Macro/Settoriale*, ecc.).
  - **Sentiment & Impatto sul Titolo** (*Positivo*, *Neutro*, *Negativo* + rating impatto).
  - **Target Price & Analisti** + **Livelli Tecnici (Supporti e Resistenze)**.
- **Frontend React**: Dashboard interattiva per lanciare le analisi e visualizzare l'output JSON e le schede riassuntive.

---

## 🛠️ Struttura del Progetto

```text
├── chatgpt_playwright_demo.py   # Agent Python con Playwright per automazione ChatGPT via CDP
├── requirements.txt             # Dipendenze Python (playwright, telepot, pandas, ecc.)
├── .env.example                 # Configurazione variabili d'ambiente (Telegram, ecc.)
└── frontend/                    # Application Dashboard React (Vite + React)
```

---

## 🚀 Esecuzione

### 1. Requisiti e Dipendenze Python

Assicurati di installare i pacchetti e i browser per Playwright:

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

### 2. Avviare Chrome con porta di Debug (CDP)

Per permettere a Playwright di connettersi in modo trasparente alla tua sessione ChatGPT:

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chatgpt-cdp-profile" https://chatgpt.com/
```

### 3. Eseguire l'Agent Playwright

```bash
python chatgpt_playwright_demo.py --stocks AVIO.MI --no-telegram
```

### 4. Avviare il Frontend React

```bash
cd frontend
npm install
npm run dev
```

Apri `http://localhost:5173/` nel browser.
