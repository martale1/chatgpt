import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

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

def dismiss_overlay_modals(page):
    try:
        overlays = page.locator("button:has-text('Accetta'), button:has-text('Accetto'), button:has-text('Accept'), button:has-text('Rifiuta'), button:has-text('Capito'), button[aria-label*='Chiudi']")
        for i in range(overlays.count()):
            try:
                el = overlays.nth(i)
                if el.is_visible(timeout=500):
                    el.click(force=True)
                    page.wait_for_timeout(300)
            except Exception:
                pass
    except Exception:
        pass

def send_gemini_prompt(page, prompt, image_path=None):
    dismiss_overlay_modals(page)
    try:
        page.bring_to_front()
    except Exception:
        pass

    initial_count = page.locator("message-content, div.model-response-text, .markdown").count()

    # Se è richiesta l'analisi visiva del grafico, allega l'immagine PNG del grafico a Gemini Web
    if image_path:
        if isinstance(image_path, list):
            abs_paths = [os.path.abspath(p) for p in image_path if os.path.exists(p)]
            safe_print(f"📷 Caricamento di {len(abs_paths)} immagini di analisi tecnica in Gemini Web: {abs_paths}")
            try:
                file_inputs = page.locator("input[type='file']")
                if file_inputs.count() > 0:
                    file_inputs.first.set_input_files(abs_paths)
                    safe_print(f"✅ {len(abs_paths)} Immagini di analisi tecnica allegate a Gemini Web! Attendo anteprima (4s)...")
                    page.wait_for_timeout(4000)
            except Exception as e:
                safe_print(f"⚠️ Caricamento immagini in Gemini Web: {e}")
        else:
            abs_path = os.path.abspath(image_path)
            safe_print(f"📷 Caricamento immagine del grafico in Gemini Web: {abs_path}")
            try:
                file_inputs = page.locator("input[type='file']")
                if file_inputs.count() > 0:
                    file_inputs.first.set_input_files(abs_path)
                    safe_print("✅ Immagine del grafico allegata a Gemini Web! Attendo anteprima (3s)...")
                    page.wait_for_timeout(3000)
            except Exception as e:
                safe_print(f"⚠️ Caricamento immagine in Gemini Web: {e}")

    box = find_gemini_prompt_box(page)
    safe_print("Campo prompt Gemini Web trovato.")
    
    try:
        box.click(timeout=3000)
    except Exception:
        dismiss_overlay_modals(page)
        try:
            box.click(force=True, timeout=3000)
        except Exception:
            box.focus()

    box.fill(prompt)
    page.wait_for_timeout(800)
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

def force_foreground_window():
    import subprocess
    try:
        cmd = '''powershell -Command "$ws = New-Object -ComObject WScript.Shell; $ws.AppActivate('Google Chrome'); $ws.AppActivate('Gemini'); $ws.AppActivate('Chrome')"'''
        subprocess.Popen(cmd, shell=True)
    except Exception:
        pass

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
    
    try:
        page.bring_to_front()
        force_foreground_window()
    except Exception:
        pass
    return page

def parse_with_openai_agent(raw_gemini_text, ticker, company, market, is_chart=False):
    load_env_file()
    openai_key = os.getenv("OPENAI_API_KEY")
    
    # Import Yahoo Finance per i livelli reali disegnati sul grafico
    import yfinance as yf
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(period="3mo")
        if len(hist) > 0:
            last_close = round(float(hist["Close"].iloc[-1]), 2)
            min_p = round(float(hist["Low"].min()), 2)
            max_p = round(float(hist["High"].max()), 2)
            trig_p = round(float(hist["High"].tail(20).max()), 2)
            sec_sup_p = round(float(hist["Low"].tail(20).min()), 2)
            currency_sym = "GBp" if ".L" in ticker else ("$" if ticker in ["NVDA", "AAPL", "MSFT", "TSLA", "AMD.O"] else "€")
        else:
            last_close, min_p, max_p, trig_p, sec_sup_p = 0.0, 0.0, 0.0, 0.0, 0.0
            currency_sym = "€"
    except Exception:
        last_close, min_p, max_p, trig_p, sec_sup_p = 0.0, 0.0, 0.0, 0.0, 0.0
        currency_sym = "€"

    # Calcolo esatto dei dati matematici per MACD, ADX e Oscillatori
    macd_info = ""
    try:
        from finance_charts.technical_charts import download_history, macd, adx_di, rsi
        df_math = download_history(ticker, period="6mo")
        close_m = df_math["Close"]
        m_line, s_line, h_line = macd(close_m)
        adx_val, p_di, m_di = adx_di(df_math)
        rsi_val = rsi(close_m)

        last_m = round(float(m_line.dropna().iloc[-1]), 2)
        last_s = round(float(s_line.dropna().iloc[-1]), 2)
        last_h = round(float(h_line.dropna().iloc[-1]), 2)
        last_rsi = round(float(rsi_val.dropna().iloc[-1]), 1)
        
        if last_m > last_s and last_h > 0:
            macd_info = f"MACD REALE DALL'IMMAGINE: MACD ({last_m}) ha INCROCIATO AL RIALZO sopra la Signal Line ({last_s}) con ISTOGRAMMA POSITIVO VERDE (+{last_h}). E' un segnale RIALZISTA / POSITIVO sul MACD! NELL'ANALISI DEL MACD DEVI DICHIARARE CHE L'ISTOGRAMMA E' VERDE E CHE IL MACD HA INCROCIATO AL RIALZO SULLA PARTE DESTRA DEL GRAFICO."
        elif last_m < last_s and last_h < 0:
            macd_info = f"MACD REALE DALL'IMMAGINE: MACD ({last_m}) è SOTTO la Signal Line ({last_s}) con ISTOGRAMMA NEGATIVO ROSSO ({last_h}). Incrocio RIBASSISTA."
        else:
            macd_info = f"MACD REALE DALL'IMMAGINE: MACD ({last_m}), Signal ({last_s}), Istogramma ({last_h})."
    except Exception as e:
        macd_info = ""

    import datetime
    current_timestamp_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if not openai_key:
        safe_print("Nota: OPENAI_API_KEY non trovata in .env. Restituisco risposta grezza.")
        return raw_gemini_text

    safe_print(f"🤖 OpenAI Agent: Formattazione approfondita {'ANALISI GRAFICO VISION' if is_chart else 'RICERCA NEWS & MARKET'} da Gemini Web...")

    system_prompt = (
        "Sei un analista tecnico ed esperto di analisi quantitativa e candlestick pattern dei mercati finanziari. "
        "Per l'analisi del grafico, devi analizzare visivamente l'immagine in modo rigoroso e veritiero: "
        "1. Pattern di candele giapponesi (Doji, Engulfing, Hammer, Marubozu, Harami, ombre superiori/inferiori e figure tecniche come Doppio Minimo/Massimo, Testa e Spalle, Flag). "
        "2. Williams Alligator (Jaw 13, Teeth 8, Lips 5) e allineamento medie mobili EMA30/EMA50. ATTENZIONE: Se la Jaw (blu 13) è sopra la Teeth (rossa 8) e Lips (verde 5) e i prezzi scendono sotto le linee, la configurazione dell'Alligator è NETTAMENTE RIBASSISTA e NON rialzista! Rispetta fedelmente la reale direzione dei prezzi. "
        f"3. {macd_info}\n"
        "4. Volumi di scambio e oscillatori di ipercomprato/ipervenduto (RSI e Stocastico). "
        f"5. LIVELLI GRAFICI REALI: I livelli tracciati sul grafico sono -> SUPPORTO {min_p} {currency_sym}, TRIGGER {trig_p} {currency_sym}, RESISTENZA MAX {max_p} {currency_sym}. DEVI USARE TASSATIVAMENTE QUESTI VALORI ESATTI nei campi JSON e nella NOTA OPERATIVA! NON INVENTARE O MUTARE I NUMERI DEI LIVELLI GRAFICI.\n"
        "6. Formulare uno Scenario Principale ed una NOTA OPERATIVA PRUDENTE con LIVELLO DI INGRESSO TRIGGER e LIVELLO DI STOP LOSS CONSIGLIATO. "
        "REGOLA TASSATIVA: NON INCLUDERE NOTIZIE SOCIETARIE O DATI FONDAMENTALI NELL'ANALISI DEL GRAFICO."
    )

    if is_chart:
        user_prompt = f"""Esegui un'ANALISI GRAFICA E TECNICA COMPLETA SU CANDELSTICK E INDICATORI (Alligator, MACD, ADX, RSI, Volumi) per il grafico del titolo {company} ({ticker}) su {market}.
Prezzo corrente di chiusura: {last_close} {currency_sym}
Livelli reali del grafico: Supporto {min_p} {currency_sym}, Trigger {trig_p} {currency_sym}, Resistenza {max_p} {currency_sym}

Testo grezzo dal grafico/Gemini Web:
{raw_gemini_text}

Rispondi ESCLUSIVAMENTE con un JSON valido con questa struttura esatta:
```json
{{
  "search_metadata": {{
    "query_input": "{ticker}",
    "company_name": "{company}",
    "ticker": "{ticker}",
    "market": "{market}",
    "current_market_price": {last_close},
    "analysis_type": "CHART_VISION",
    "timestamp_utc": "{current_timestamp_iso}"
  }},
  "chart_vision_analysis": {{
    "trend_direction": "[Rialzista / Ribassista / In Consolidamento]",
    "chart_pattern": "[Doppio Minimo di inversione / Canale Rialzista / Triangolo / Testa e Spalle / Accumulazione]",
    "candlestick_analysis": "[Analisi dei pattern di candele giapponesi recenti: Doji, Engulfing, Hammer, Marubozu, ombre e struttura del corpo candela]",
    "alligator_ma_analysis": "[Analisi dettagliata delle 3 linee Williams Alligator (Jaw 13, Teeth 8, Lips 5) e inclinazione medie mobili EMA30/EMA50]",
    "macd_adx_analysis": "[Analisi dell'incrocio MACD/Signal, direzione dell'istogramma e valore ADX (sopra o sotto 25) con incrocio DI+ e DI-]",
    "volume_oscillator_analysis": "[Analisi dei volumi di scambio sulle candele di espansione e livelli degli oscillatori RSI e Stocastico]",
    "breakout_trigger": "{trig_p} {currency_sym}",
    "structural_support": "{min_p} {currency_sym}",
    "secondary_support": "{sec_sup_p} {currency_sym}",
    "structural_resistance": "{max_p} {currency_sym}",
    "vision_summary_explanation": "[Descrizione visiva globale del grafico in almeno 4 frasi dettagliate su price action, inclinazione delle medie, Alligator e stato di RSI e MACD]",
    "operational_note": "[Nota operativa prudente e dettagliata: E' OBBLIGATORIO usare i livelli del grafico, specificando il punto di ingresso a {trig_p} {currency_sym} ed il LIVELLO DI STOP LOSS consigliato sotto il supporto a {min_p} {currency_sym}]"
  }},
  "technical_levels": {{
    "supports": ["{min_p} {currency_sym}", "{sec_sup_p} {currency_sym}"],
    "resistances": ["{trig_p} {currency_sym}", "{max_p} {currency_sym}"],
    "critical_levels_notes": "Trigger di ingresso a {trig_p} {currency_sym} con supporto chiave a {min_p} {currency_sym}."
  }}
}}
```"""
    else:
        user_prompt = f"""Estrai e formatta le notizie (SIA RECENTI DEGLI ULTIMI 3 GIORNI, SIA MENO RECENTI / STORICHE DEI MESI SCORSI) e le stime analisti da Gemini Web per il titolo {company} ({ticker}) su {market}.
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
    "timestamp_utc": "{current_timestamp_iso}"
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
      "id": "news_rec_1",
      "headline": "[Titolo notizia recente ultimi 3 giorni]",
      "date": "YYYY-MM-DD",
      "source": "[Fonte es. Il Sole 24 Ore / Reuters]",
      "source_domain": "ilsole24ore.com",
      "url": null,
      "category": "Corporate",
      "summary": "[Sintesi dettagliata]",
      "detail": "[Testo completo della notizia recente]",
      "sentiment": "Positivo",
      "impact_rating": "Alto"
    }}
  ],
  "latest_available_news": [
    {{
      "id": "news_old_1",
      "headline": "[Titolo notizia meno recente o storica importante dei mesi/settimane precedenti]",
      "date": "YYYY-MM-DD",
      "source": "[Fonte es. Milano Finanza / Ansa]",
      "source_domain": "milanofinanza.it",
      "url": null,
      "category": "Market",
      "summary": "[Sintesi della notizia meno recente]",
      "detail": "[Testo completo e dettagliato della notizia meno recente]",
      "sentiment": "Neutro",
      "impact_rating": "Medio"
    }}
  ],
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
            # Sanitize corrupted unicode characters or missing euro symbols
            json_text = json_text.replace('\ufffd', '€')
            
            # Garantisci che il timestamp_utc sia la data/ora esatta corrente di esecuzione
            try:
                parsed_obj = json.loads(json_text)
                if "search_metadata" in parsed_obj:
                    parsed_obj["search_metadata"]["timestamp_utc"] = current_timestamp_iso
                json_text = json.dumps(parsed_obj, indent=2, ensure_ascii=False)
            except Exception:
                pass
                
            return json_text
    except Exception as e:
        safe_print(f"Errore OpenAI Agent formatting ({e}). Restituisco risposta grezza.")
        return raw_gemini_text

def run_gemini_web_report(context, ticker, company, market, is_chart=False):
    safe_print(f"\n=== Scansione Gemini Web (Playwright) [{ 'ANALISI GRAFICO VISION' if is_chart else 'RICERCA NEWS' }] per {company} ({ticker}) ===")
    page = open_gemini_page(context)
    try:
        page.bring_to_front()
    except Exception:
        pass

    chart_image_path = None
    if is_chart:
        chart_dir = Path("finance_charts")
        chart_dir.mkdir(exist_ok=True)
        chart_images = []
        try:
            from finance_charts.technical_charts import create_chart_bundle
            create_chart_bundle(ticker, str(chart_dir), period="1y", days=65)
            master_img_path = chart_dir / f"{ticker}_master_vision.png"
            if master_img_path.exists():
                chart_image_path = str(master_img_path)
                safe_print(f"📊 Dashboard Grafica Unificata PNG generata e pronta per Gemini Web Vision: {chart_image_path}")
            elif chart_images:
                chart_image_path = chart_images[0]
        except Exception as e:
            safe_print(f"⚠️ Impossibile generare grafici PNG: {e}")

        prompt = (
            f"Analizza attentamente l'IMMAGINE DEL GRAFICO TECNICO del titolo {company} ({ticker}) su {market} allegata.\n"
            f"Fornisci un'analisi visuale accurata del trend effettivo del prezzo, dei livelli di supporto S1 e S2, della resistenza R1 e del punto di breakout trigger.\n"
            f"ATTENZIONE RIGOROSA ALL'ALLIGATOR ED ALLE MEDIE: Osserva la vera direzione visuale. Se la Jaw blu (13) è in alto, la Teeth rossa (8) è in mezzo, la Lips verde (5) è in basso e il prezzo scende sotto di esse, il trend è RIBASSISTA / DISCENDENTE. Descrivi fedelmente ciò che vedi nell'immagine!"
        )
    else:
        prompt = f"Cerca sia le news recentissime degli ultimi 3 giorni, sia le notizie storiche e rilevanti dei mesi scorsi, rating degli analisti e target price per {company} ({ticker}) quotato su {market}."

    initial_count = send_gemini_prompt(page, prompt, image_path=chart_image_path)
    raw_response = wait_for_gemini_response(page, initial_count)
    
    # ── OPENAI AGENT PARSING ──
    formatted_json = parse_with_openai_agent(raw_response, ticker, company, market, is_chart)
    
    safe_print("\n--- Risposta ChatGPT ---")
    safe_print(formatted_json)
    return formatted_json

def find_chrome_executable():
    candidate_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            return p
    return None

def cleanup_stale_gemini_chrome():
    """Rimuove processi zombie di Chrome legati a gemini_chrome_profile per liberare il ProcessSingleton Lock file (Error 0x20)."""
    import subprocess
    try:
        ps_cmd = (
            'powershell -Command "'
            'Get-WmiObject Win32_Process -Filter \\"name=\'chrome.exe\'\\" | '
            'Where-Object { $_.CommandLine -like \\"*gemini_chrome_profile*\\" } | '
            'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'
            '"'
        )
        subprocess.run(ps_cmd, shell=True, capture_output=True)
    except Exception:
        pass

    for prof_name in ["gemini_chrome_profile", "gemini_chrome_profile_fallback", "gemini_chrome_profile_run"]:
        p_dir = Path(prof_name)
        if p_dir.exists():
            for lock_name in ["SingletonLock", "SingletonSocket", "SingletonCookie"]:
                try:
                    l_file = p_dir / lock_name
                    if l_file.exists():
                        l_file.unlink()
                except Exception:
                    pass

def ensure_visible_chrome(cdp_url=DEFAULT_CDP_URL):
    import urllib.request
    import time
    import subprocess
    
    try:
        urllib.request.urlopen(f"{cdp_url}/json/version", timeout=1.5)
        safe_print("✅ Chrome CDP (porta 9222) è già in ascolto in primo piano sul desktop!")
        return True
    except Exception:
        pass

    cleanup_stale_gemini_chrome()

    chrome_exe = find_chrome_executable()
    if not chrome_exe:
        safe_print("⚠️ chrome.exe non trovato nei percorsi standard di Windows.")
        return False

    user_data_path = os.path.abspath(str(PROFILE_DIR))
    safe_print(f"🚀 Avvio la finestra di Google Chrome in primo piano ({chrome_exe})...")
    
    cmd_list = [
        "cmd.exe", "/c", "start", "",
        chrome_exe,
        "--remote-debugging-port=9222",
        f"--user-data-dir={user_data_path}",
        "--start-maximized",
        GEMINI_URL
    ]
    try:
        subprocess.Popen(cmd_list)
    except Exception as e:
        safe_print(f"⚠️ Errore avvio comando Chrome: {e}")
        return False

    safe_print("Attendo l'apertura della finestra di Chrome sullo schermo...")
    for _ in range(16):
        time.sleep(0.5)
        try:
            urllib.request.urlopen(f"{cdp_url}/json/version", timeout=1)
            safe_print("✅ Finestra di Google Chrome aperta in primo piano sul tuo desktop!")
            return True
        except Exception:
            continue
    return False

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
        context = None
        # 1. Prova a connettersi ad una finestra Chrome aperta (Porta 9222)
        if args.cdp:
            try:
                safe_print(f"🔌 Tentativo connessione a Chrome visibile sulla porta {args.cdp}...")
                browser = p.chromium.connect_over_cdp(args.cdp, timeout=2500)
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                safe_print("✅ Connessione stabilita alla tua finestra visibile di Chrome!")
            except Exception:
                safe_print("ℹ️ Nessuna finestra Chrome manuale rilevata su porta 9222. Avvio automatico...")

        # 2. Se non c'è una finestra manuale, apri Chrome visibile a tutto schermo
        if not context:
            ensure_visible_chrome(args.cdp)
            for _ in range(6):
                try:
                    browser = p.chromium.connect_over_cdp(args.cdp, timeout=2000)
                    context = browser.contexts[0] if browser.contexts else browser.new_context()
                    safe_print("✅ Finestra di Chrome visibile avviata e collegata con successo!")
                    break
                except Exception:
                    time.sleep(1)

        # 3. Fallback Playwright visibile se CDP non risponde
        if not context:
            cleanup_stale_gemini_chrome()
            profile_path = str(PROFILE_DIR)
            try:
                safe_print("🚀 Avvio della finestra reale di Google Chrome su Windows Desktop...")
                context = p.chromium.launch_persistent_context(
                    user_data_dir=profile_path,
                    headless=False,
                    args=[
                        "--start-maximized",
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox"
                    ],
                    viewport=None,
                    channel="chrome"
                )
                safe_print("✅ Finestra di Google Chrome aperta in primo piano sul tuo schermo!")
            except Exception as e:
                safe_print(f"⚠️ Avvio su profilo primario ({e}). Uso profilo di sessione unico...")
                unique_session_profile = str(Path(f"gemini_chrome_profile_session_{int(time.time())}"))
                context = p.chromium.launch_persistent_context(
                    user_data_dir=unique_session_profile,
                    headless=False,
                    args=[
                        "--start-maximized",
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox"
                    ],
                    viewport=None,
                    channel="chrome"
                )
                safe_print("✅ Finestra di Google Chrome (Sessione Fallback) aperta in primo piano!")

        run_gemini_web_report(context, ticker, company, market, args.analyze_chart)

if __name__ == "__main__":
    main()
