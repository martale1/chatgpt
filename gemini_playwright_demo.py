import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

GEMINI_URL = "https://gemini.google.com/app"
DEFAULT_CDP_URL = "http://127.0.0.1:9222"
PROFILE_DIR = Path("gemini_chrome_profile")
RESPONSE_TIMEOUT_SECONDS = 120

def safe_print(*values):
    text = " ".join(str(v) for v in values)
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"), flush=True)

def load_env_file(path=".env"):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))

STOCK_CATALOG = {
    "PST.MI": {"company": "Poste Italiane", "market": "Borsa Italiana"},
    "TEN.MI": {"company": "Tenaris", "market": "Borsa Italiana"},
    "PRY.MI": {"company": "Prysmian", "market": "Borsa Italiana"},
    "LDO.MI": {"company": "Leonardo", "market": "Borsa Italiana"},
    "MONC.MI": {"company": "Moncler", "market": "Borsa Italiana"},
    "DIA.MI": {"company": "DiaSorin", "market": "Borsa Italiana"},
    "CPR.MI": {"company": "Campari", "market": "Borsa Italiana"},
    "ENEL.MI": {"company": "Enel", "market": "Borsa Italiana"},
    "ENI.MI": {"company": "Eni", "market": "Borsa Italiana"},
    "SRG.MI": {"company": "Snam", "market": "Borsa Italiana"},
    "STMMI.MI": {"company": "STMicroelectronics", "market": "Borsa Italiana"},
    "STLAM.MI": {"company": "Stellantis", "market": "Borsa Italiana"},
    "BC.MI": {"company": "Banca Generali", "market": "Borsa Italiana"},
    "BAMI.MI": {"company": "Banco BPM", "market": "Borsa Italiana"},
    "ISP.MI": {"company": "Intesa Sanpaolo", "market": "Borsa Italiana"},
    "UCG.MI": {"company": "UniCredit", "market": "Borsa Italiana"},
    "G.MI": {"company": "Assicurazioni Generali", "market": "Borsa Italiana"},
    "TIT.MI": {"company": "Telecom Italia", "market": "Borsa Italiana"},
    "RACE.MI": {"company": "Ferrari", "market": "Borsa Italiana"},
    "VOD.L": {"company": "Vodafone", "market": "London Stock Exchange"},
    "A2A.MI": {"company": "A2A", "market": "Borsa Italiana"},
    "AVIO.MI": {"company": "Avio", "market": "Borsa Italiana"},
    "TSLA": {"company": "Tesla", "market": "NASDAQ"},
    "AAPL": {"company": "Apple", "market": "NASDAQ"},
    "NVDA": {"company": "NVIDIA", "market": "NASDAQ"},
    "MSFT": {"company": "Microsoft", "market": "NASDAQ"},
    "AMZN": {"company": "Amazon", "market": "NASDAQ"},
    "GOOGL": {"company": "Google", "market": "NASDAQ"},
    "META": {"company": "Meta Platforms", "market": "NASDAQ"},
    "AMD": {"company": "AMD", "market": "NASDAQ"}
}

def find_gemini_prompt_box(page):
    # Gestione eventuali banner cookie o login Google
    try:
        cookie_btns = page.locator("button:has-text('Accetta tutto'), button:has-text('Accept all'), button:has-text('Accetto')")
        if cookie_btns.count() > 0:
            cookie_btns.first.click()
            page.wait_for_timeout(1000)
    except Exception:
        pass

    selectors = [
        "div[role='textbox']",
        "rich-textarea div[contenteditable='true']",
        "rich-textarea p",
        "div[contenteditable='true']",
        "p.is-empty",
        "textarea",
        "[aria-label*='Prompt']",
        "[aria-label*='Chiedi']",
        "[aria-label*='Ask']",
        "[aria-label*='Inserisci']"
    ]
    for selector in selectors:
        locator = page.locator(selector).last
        try:
            locator.wait_for(state="visible", timeout=3000)
            return locator
        except (PlaywrightTimeoutError, PlaywrightError):
            continue

    # Verifica se la pagina richiede login Google
    if "accounts.google.com" in page.url or page.locator("a[href*='accounts.google.com'], button:has-text('Accedi')").count() > 0:
        safe_print("⚠️ Attenzione: Serve effettuare l'accesso con il tuo account Google nella finestra di Chrome.")

    raise RuntimeError("Campo prompt Gemini Web non trovato. Effettua l'accesso su https://gemini.google.com/app nella finestra Chrome visibile.")

def send_gemini_prompt(page, prompt):
    initial_count = page.locator("message-content, div.model-response-text, .markdown").count()
    box = find_gemini_prompt_box(page)
    safe_print("Campo prompt Gemini Web trovato.")
    box.click()
    box.fill(prompt)
    safe_print("Prompt inserito in Gemini Web, invio in corso...")
    
    send_selectors = [
        "button.send-button",
        "button[aria-label*='Send']",
        "button[aria-label*='Invia']",
        "button[aria-label*='Submit']",
        "mat-icon[fonticon='send']"
    ]
    for sel in send_selectors:
        btn = page.locator(sel).last
        try:
            btn.wait_for(state="visible", timeout=2500)
            if btn.is_enabled():
                btn.click()
                return initial_count
        except Exception:
            continue

    page.keyboard.press("Enter")
    return initial_count

def wait_for_gemini_response(page, initial_count=0, timeout_seconds=RESPONSE_TIMEOUT_SECONDS):
    last_text = ""
    stable_reads = 0
    deadline_ms = timeout_seconds * 1000
    step_ms = 2000
    elapsed_ms = 0

    safe_print("Attendo la risposta di Google Gemini Web...")
    while elapsed_ms < deadline_ms:
        page.wait_for_timeout(step_ms)
        elapsed_ms += step_ms

        selectors = [
            "message-content",
            "div.model-response-text",
            "div.markdown",
            ".response-container-content"
        ]
        messages = None
        count = 0
        for sel in selectors:
            loc = page.locator(sel)
            c = loc.count()
            if c > 0:
                messages = loc
                count = c
                break

        if messages is None or count <= initial_count:
            if elapsed_ms % 6000 == 0:
                safe_print(f"🔍 Gemini Web sta elaborando la ricerca... [{elapsed_ms // 1000}s]")
            continue

        try:
            current_text = messages.nth(count - 1).inner_text(timeout=5000).strip()
        except Exception:
            continue

        # Ignora avvisi temporanei
        if "generazione" in current_text.lower() and len(current_text) < 30:
            continue

        if current_text and current_text == last_text:
            stable_reads += 1
        else:
            stable_reads = 0
            last_text = current_text
            safe_print(f"Risposta Gemini in corso: {len(last_text)} caratteri ricevuti...")

        if last_text and stable_reads >= 2 and len(last_text) > 40:
            return last_text

    safe_print(f"Timeout risposta Gemini dopo {timeout_seconds}s.")
    return last_text

def open_gemini_page(context):
    page = None
    try:
        pages = context.pages if hasattr(context, 'pages') else []
        for p in pages:
            try:
                if "gemini.google.com" in p.url:
                    page = p
                    page.bring_to_front()
                    break
            except Exception:
                continue
        if page is None:
            page = context.new_page()
    except Exception:
        page = context.new_page()

    if "gemini.google.com" not in page.url:
        page.goto(GEMINI_URL, wait_until="domcontentloaded")
    page.bring_to_front()
    return page

def parse_with_openai_agent(raw_gemini_text, ticker, company, market, is_chart=False):
    load_env_file()
    openai_key = os.getenv("OPENAI_API_KEY")
    
    # Import Yahoo Finance per prezzo live di supporto
    import yfinance as yf
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(period="5d")
        last_close = round(float(hist["Close"].iloc[-1]), 2) if len(hist) > 0 else 0.0
    except Exception:
        last_close = 0.0

    if not openai_key:
        safe_print("Nota: OPENAI_API_KEY non trovata in .env. Restituisco risposta grezza.")
        return raw_gemini_text

    safe_print(f"🤖 OpenAI Agent: Formattazione strutturata {'ANALISI GRAFICO VISION' if is_chart else 'RICERCA NEWS & MARKET'} da Gemini Web...")

    system_prompt = "Sei l'Agente AI di Analisi Finanziaria. Converti le informazioni estratte da Gemini Web in un blocco JSON rigoroso ed accurato."

    if is_chart:
        user_prompt = f"""Analizza i dati tecnici e grafici estratti da Gemini Web per il grafico del titolo {company} ({ticker}) su {market}.
Prezzo corrente di mercato: {last_close}

Testo grezzo da Gemini Web:
{raw_gemini_text}

Rispondi ESCLUSIVAMENTE con un JSON valido con questa struttura di ANALISI GRAFICO VISION:
```json
{{
  "search_metadata": {{
    "query_input": "{ticker}",
    "company_name": "{company}",
    "ticker": "{ticker}",
    "market": "{market}",
    "current_market_price": {last_close},
    "analysis_type": "CHART_VISION",
    "timestamp_utc": "2026-08-09T18:50:00Z"
  }},
  "chart_vision_analysis": {{
    "trend_direction": "[Rialzista / Ribassista / Laterale]",
    "chart_pattern": "[Canale Rialzista / Doppio Minimo / Triangolo / Testa e Spalle / Consolidamento]",
    "breakout_trigger": "[Livello prezzo trigger per entrare es. 2.356 €]",
    "structural_support": "[Livello supporto principale S1 es. 2.317 €]",
    "secondary_support": "[Livello supporto S2 es. 2.297 €]",
    "structural_resistance": "[Livello resistenza R1 es. 2.356 €]",
    "vision_summary_explanation": "[Spiegazione visiva approfondita della struttura del grafico e del trend in almeno 3 frasi]"
  }},
  "technical_levels": {{
    "supports": ["[S1 con valuta]", "[S2 con valuta]"],
    "resistances": ["[R1 con valuta]", "[R2 con valuta]"],
    "critical_levels_notes": "[Note sintetiche sui livelli di supporto e breakout trigger]"
  }}
}}
```"""
    else:
        user_prompt = f"""Estrai e formatta le notizie e stime analisti da Gemini Web per il titolo {company} ({ticker}) su {market}.
Prezzo corrente di mercato: {last_close}

Testo grezzo da Gemini Web:
{raw_gemini_text}

Rispondi ESCLUSIVAMENTE con un JSON valido con questa struttura di RICERCA NEWS & MARKET:
```json
{{
  "search_metadata": {{
    "query_input": "{ticker}",
    "company_name": "{company}",
    "ticker": "{ticker}",
    "market": "{market}",
    "current_market_price": {last_close},
    "analysis_type": "NEWS_RESEARCH",
    "timestamp_utc": "2026-08-09T18:50:00Z"
  }},
  "market_sentiment_summary": {{
    "overall_sentiment": "[Molto Positivo / Positivo / Neutro / Negativo / Molto Negativo]",
    "sentiment_score": 0.75,
    "expected_impact": "[Rialzista / Consolidamento / Ribassista]",
    "summary_explanation": "[Spiegazione dettagliata del sentiment in almeno 3 frasi]",
    "news_highlights": ["Highlight 1", "Highlight 2", "Highlight 3"]
  }},
  "recent_news_last_3_days": [
    {{
      "id": "news_1",
      "headline": "[Titolo notizia]",
      "date": "YYYY-MM-DD",
      "source": "[Fonte es. Il Sole 24 Ore / Reuters]",
      "source_domain": "ilsole24ore.com",
      "url": null,
      "category": "Corporate",
      "summary": "[Sintesi]",
      "detail": "[Testo completo e dettagliato senza abbreviazioni]",
      "sentiment": "Positivo",
      "impact_rating": "Alto"
    }}
  ],
  "latest_available_news": [],
  "analyst_ratings_and_targets": [
    {{
      "broker": "[Banca/Broker]",
      "rating": "Buy",
      "target_price": "[Prezzo target numeric es. 3.50]",
      "currency": "EUR",
      "date": "YYYY-MM-DD",
      "note": "[Nota analista]"
    }}
  ],
  "technical_levels": {{
    "supports": ["[S1 con valuta]", "[S2 con valuta]"],
    "resistances": ["[R1 con valuta]", "[R2 con valuta]"],
    "critical_levels_notes": "[Note tecniche sui livelli]"
  }}
}}
```"""

    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }

    try:
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
            data=json.dumps(payload).encode("utf-8")
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            json_text = data["choices"][0]["message"]["content"]
            return json_text
    except Exception as e:
        safe_print(f"Errore OpenAI Agent formatting ({e}). Restituisco risposta grezza.")
        return raw_gemini_text

def run_gemini_web_report(context, ticker, company, market, is_chart=False):
    safe_print(f"\n=== Scansione Gemini Web (Playwright) [{ 'ANALISI GRAFICO VISION' if is_chart else 'RICERCA NEWS' }] per {company} ({ticker}) ===")
    page = open_gemini_page(context)

    if is_chart:
        prompt = f"Analizza la struttura del GRAFICO TECNICO del titolo {company} ({ticker}) su {market}. Identifica il trend attuale, i livelli chiave di supporto S1 e S2, la resistenza R1 e il punto di breakout trigger."
    else:
        prompt = f"Cerca news di oggi e degli ultimi 3 giorni, rating degli analisti e target price per {company} ({ticker}) quotato su {market}."

    initial_count = send_gemini_prompt(page, prompt)
    raw_response = wait_for_gemini_response(page, initial_count)
    
    # ── OPENAI AGENT PARSING ──
    formatted_json = parse_with_openai_agent(raw_response, ticker, company, market, is_chart)
    
    safe_print("\n--- Risposta ChatGPT ---")
    safe_print(formatted_json)
    return formatted_json

def main():
    load_env_file()
    parser = argparse.ArgumentParser(description="Agent Gemini Web via Playwright + OpenAI Parsing Agent.")
    parser.add_argument("--ticker", default="A2A.MI")
    parser.add_argument("--company", default="A2A")
    parser.add_argument("--market", default="Borsa Italiana")
    parser.add_argument("--cdp", default=DEFAULT_CDP_URL)
    parser.add_argument("--no-telegram", action="store_true")
    parser.add_argument("--analyze-chart", action="store_true")
    args = parser.parse_args()

    info = STOCK_CATALOG.get(args.ticker.upper(), {"company": args.company, "market": args.market})
    ticker = args.ticker.upper()
    company = info["company"]
    market = info["market"]

    with sync_playwright() as p:
        use_cdp = False
        context = None
        if args.cdp:
            try:
                safe_print(f"Connessione a Chrome via CDP ({args.cdp})...")
                browser = p.chromium.connect_over_cdp(args.cdp, timeout=5000)
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                use_cdp = True
                safe_print("Connessione CDP stabilita!")
            except Exception as e:
                safe_print(f"CDP non disponibile ({e}). Avvio browser Chrome...")

        if not use_cdp:
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(PROFILE_DIR),
                headless=False,
                viewport={"width": 1400, "height": 900},
                channel="chrome"
            )

        run_gemini_web_report(context, ticker, company, market, args.analyze_chart)

if __name__ == "__main__":
    main()
