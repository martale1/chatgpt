import argparse
import os
import sys
from pathlib import Path

try:
    import telepot
except ImportError:
    telepot = None
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright


CHATGPT_URL = "https://chatgpt.com/"
PROFILE_DIR = Path("playwright_chatgpt_profile")
CHROME_PROFILE_DIR = Path("chrome_chatgpt_profile")
TELEGRAM_TOKEN_ENV = "TELEGRAM_BOT_TOKEN"
TELEGRAM_TOKEN_FALLBACK_ENV = "TELEGRAM_BOT_TOKEN_CH1"
TELEGRAM_RECEIVER_ENV = "TELEGRAM_RECEIVER_ID"
DEFAULT_CDP_URL = "http://127.0.0.1:9222"
SEND_TELEGRAM_BY_DEFAULT = True
RESPONSE_TIMEOUT_SECONDS = 120
PAUSE_BETWEEN_STOCKS_SECONDS = 3
DEFAULT_COMPANY = "Vodafone"
DEFAULT_TICKER = "VOD.L"
DEFAULT_MARKET = "London Stock Exchange"
DEFAULT_STOCKS = ["VOD.L"]#,"NEXI.MI","AVIO.MI","A2A.MI"]
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
    "AMD.O": {"company": "AMD", "market": "NASDAQ"},
    "AMD": {"company": "AMD", "market": "NASDAQ"}
}


def configure_stdout():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass


def safe_print(*values):
    print(*values, flush=True)


import concurrent.futures
import yfinance as yf


def get_live_market_data(ticker, timeout_sec=2.5):
    if not ticker:
        return None
    safe_print(f"Recupero prezzo live da Yahoo Finance per {ticker}...")

    def _fetch():
        try:
            t = yf.Ticker(ticker.strip())
            price = None
            if hasattr(t, "fast_info"):
                try:
                    price = t.fast_info.get("lastPrice")
                except Exception:
                    pass
            if price is None:
                hist = t.history(period="1d")
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])
            return round(float(price), 2) if price else None
        except Exception:
            return None

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_fetch)
            res = future.result(timeout=timeout_sec)
            if res:
                safe_print(f"Prezzo Yahoo Finance per {ticker}: {res}")
            return res
    except Exception as exc:
        safe_print(f"Nota: timeout/skip prezzo yfinance per {ticker}")
        return None


def build_stock_prompt(company, ticker="", market=""):
    ticker_clean = ticker.strip().upper()
    if ticker_clean in STOCK_CATALOG:
        company = STOCK_CATALOG[ticker_clean]["company"]
        market = STOCK_CATALOG[ticker_clean]["market"]
    elif company.upper() == ticker_clean.split(".")[0]:
        # Fallback if company is truncated like "TEN"
        try:
            t_obj = yf.Ticker(ticker_clean)
            info_name = t_obj.info.get("longName") or t_obj.info.get("shortName")
            if info_name:
                company = info_name
        except Exception:
            pass
    instrument = company
    if ticker:
        instrument += f" ({ticker})"
    if market:
        instrument += f" - {market}"

    current_price = get_live_market_data(ticker)
    price_prompt_note = f"\nNota prezzo di mercato attuale (Yahoo Finance): {current_price}" if current_price else ""

    return f"""Cerca news di oggi e degli ultimi 3 giorni su {instrument}.{price_prompt_note}
Rispondi SOLO con un blocco JSON valido, nessun testo prima o dopo.
ATTENZIONE RIGOROSA: L'analisi DEVE riguardare ESCLUSIVAMENTE l'azienda {company} (Ticker: {ticker}, Mercato: {market}). NON includere informazioni su altre societa'.

Usa esattamente questo schema JSON (sostituisci i valori tra [ ]):

```json
{{
  "search_metadata": {{
    "query_input": "{ticker}",
    "company_name": "{company}",
    "ticker": "{ticker}",
    "market": "{market}",
    "current_market_price": {current_price if current_price else "null"},
    "timestamp_utc": "[data e ora UTC attuale in formato ISO 8601]"
  }},
  "market_sentiment_summary": {{
    "overall_sentiment": "[Molto Positivo / Positivo / Neutro / Negativo / Molto Negativo]",
    "sentiment_score": [numero da 0.0 a 1.0],
    "expected_impact": "[descrizione breve impatto atteso sul titolo]",
    "summary_explanation": "[analisi approfondita del sentiment complessivo, minimo 3 frasi, senza riassumere ma spiegando il contesto]",
    "news_highlights": [
      "[punto chiave notizia 1]",
      "[punto chiave notizia 2]",
      "[punto chiave notizia 3]"
    ]
  }},
  "recent_news_last_3_days": [
    {{
      "id": "news_1",
      "headline": "[titolo completo della notizia]",
      "date": "[YYYY-MM-DD]",
      "source": "[nome testata giornalistica]",
      "source_domain": "[dominio es. reuters.com]",
      "url": "[URL articolo originale oppure null]",
      "category": "[categoria es. Risultati / M&A / Regolatorio / Macro / Settoriale]",
      "summary": "[primo paragrafo della notizia]",
      "detail": "[testo completo e dettagliato della notizia, senza riassumere, con tutti i numeri, percentuali e dichiarazioni originali]",
      "sentiment": "[Positivo / Neutro / Negativo / Molto Positivo / Molto Negativo]",
      "impact_rating": "[Alto / Medio / Basso / Molto Alto]"
    }}
  ],
  "latest_available_news": [
    {{
      "id": "hist_news_1",
      "headline": "[titolo notizia storica rilevante]",
      "date": "[YYYY-MM-DD]",
      "source": "[nome testata]",
      "source_domain": "[dominio]",
      "url": "[URL oppure null]",
      "category": "[categoria]",
      "summary": "[primo paragrafo]",
      "detail": "[testo completo dettagliato]",
      "sentiment": "[sentiment]",
      "impact_rating": "[impatto]"
    }}
  ],
  "analyst_ratings_and_targets": [
    {{
      "broker": "[nome banca/broker]",
      "rating": "[Buy / Hold / Sell / Neutral / Outperform]",
      "target_price": "[prezzo target]",
      "currency": "[EUR / USD / GBp]",
      "date": "[data aggiornamento YYYY-MM-DD]",
      "note": "[note aggiuntive dell'analista]"
    }}
  ],
  "technical_levels": {{
    "supports": ["[S1 con valuta]", "[S2 con valuta]"],
    "resistances": ["[R1 con valuta]", "[R2 con valuta]"],
    "critical_levels_notes": "[note sui livelli tecnici chiave]"
  }}
}}
```

Regole:
- Rispondi SOLO con il JSON. Nessun testo prima o dopo il blocco ```json```.
- Non inventare dati. Se un campo non e' disponibile, usa null o array vuoto [].
- Il campo "detail" deve contenere il testo COMPLETO della notizia, non riassunto.
- Includi tutte le notizie trovate negli ultimi 3 giorni in recent_news_last_3_days.
- Includi notizie storiche rilevanti degli ultimi 30 giorni in latest_available_news."""



def parse_stock_list(value):
    if not value:
        return DEFAULT_STOCKS
    return [item.strip().upper() for item in value.replace(";", ",").split(",") if item.strip()]


def stock_from_ticker(ticker):
    info = STOCK_CATALOG.get(ticker.upper(), {})
    return {
        "ticker": ticker.upper(),
        "company": info.get("company", ticker.upper()),
        "market": info.get("market", ""),
    }


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


def find_prompt_box(page):
    selectors = [
        "textarea[data-testid='prompt-textarea']",
        "div[contenteditable='true'][data-testid='prompt-textarea']",
        "textarea",
        "div[contenteditable='true']",
    ]
    for selector in selectors:
        locator = page.locator(selector).last
        try:
            locator.wait_for(state="visible", timeout=5000)
            return locator
        except PlaywrightTimeoutError:
            continue
    raise RuntimeError("Non trovo il campo prompt di ChatGPT. La UI potrebbe essere cambiata o serve login.")


def send_prompt(page, prompt):
    initial_assistant_count = page.locator("[data-message-author-role='assistant']").count()
    prompt_box = find_prompt_box(page)
    safe_print("Campo prompt trovato.")
    prompt_box.click()
    prompt_box.fill(prompt)
    safe_print("Prompt inserito, invio...")

    send_selectors = [
        "[data-testid='send-button']",
        "button[aria-label='Invia prompt']",
        "button[aria-label='Send prompt']",
        "button[aria-label*='Invia']",
        "button[aria-label*='Send']",
    ]
    for selector in send_selectors:
        button = page.locator(selector).last
        try:
            button.wait_for(state="visible", timeout=3000)
            if button.is_enabled():
                button.click()
                return initial_assistant_count
        except (PlaywrightTimeoutError, PlaywrightError):
            continue

    page.keyboard.press("Enter")
    return initial_assistant_count


def wait_for_response(page, initial_assistant_count=0, timeout_seconds=RESPONSE_TIMEOUT_SECONDS):
    last_text = ""
    stable_reads = 0
    deadline_ms = timeout_seconds * 1000
    step_ms = 2000
    elapsed_ms = 0

    safe_print("Attendo la risposta di ChatGPT...")
    while elapsed_ms < deadline_ms:
        page.wait_for_timeout(step_ms)
        elapsed_ms += step_ms

        messages = page.locator("[data-message-author-role='assistant']")
        count = messages.count()
        if count <= initial_assistant_count:
            if elapsed_ms % 10000 == 0:
                safe_print(f"Ancora nessuna nuova risposta dopo {elapsed_ms // 1000}s...")
            continue

        try:
            current_text = messages.nth(count - 1).inner_text(timeout=5000).strip()
        except PlaywrightError:
            continue

        if current_text and current_text == last_text:
            stable_reads += 1
        else:
            stable_reads = 0
            last_text = current_text
            safe_print(f"Risposta in corso: {len(last_text)} caratteri...")

        if last_text and stable_reads >= 2:
            return last_text

    safe_print(f"Timeout risposta dopo {timeout_seconds}s.")
    return last_text


def open_chatgpt_page(context_or_browser):
    page = context_or_browser.new_page()
    # Apre SEMPRE una nuova conversazione per evitare contaminazione dal contesto precedente
    page.goto("https://chatgpt.com/", wait_until="domcontentloaded")
    page.bring_to_front()
    # Naviga a una nuova chat vuota
    try:
        new_chat_btn = page.locator("a[href='/']").first
        new_chat_btn.wait_for(state="visible", timeout=3000)
        new_chat_btn.click()
        page.wait_for_load_state("domcontentloaded")
    except Exception:
        # Fallback: naviga direttamente a /new
        try:
            page.goto("https://chatgpt.com/new", wait_until="domcontentloaded")
        except Exception:
            pass
    page.bring_to_front()
    return page



def run_in_page(page, prompt, login_only):
    if login_only:
        input("Fai login nel browser aperto, poi premi INVIO qui per chiudere...")
        return

    safe_print("\n--- Domanda ChatGPT ---")
    safe_print(prompt)
    initial_assistant_count = send_prompt(page, prompt)
    response = wait_for_response(page, initial_assistant_count)
    safe_print("\n--- Risposta ChatGPT ---")
    safe_print(response or "Nessuna risposta trovata.")
    return response


def build_chart_prompt(company, ticker, market, snapshot):
    close_val = snapshot.get('close', 0)
    sup_val = snapshot.get('support_30', snapshot.get('support_10', 0))
    res_val = snapshot.get('resistance_10', 0)
    return f"""Analizza i grafici tecnici allegati del titolo {company} ({ticker}).

Dati numerici calcolati dal codice:
- Data ultima barra: {snapshot.get('date', 'N/D')}
- Prezzo Chiusura (PREZZO): {close_val:.2f}
- Variazione 1D: {snapshot.get('change_1d_pct', 0):+.2f}%
- Supposto Supporto Chiave (SUPPORTO): {sup_val:.2f}
- Supposta Resistenza / Breakout (TRIGGER): {res_val:.2f}
- RSI (14): {snapshot.get('rsi', 0):.2f}
- MACD: {snapshot.get('macd', 0):.4f} | Signal: {snapshot.get('macd_signal', 0):.4f}
- ADX: {snapshot.get('adx', 0):.2f} | DI+: {snapshot.get('plus_di', 0):.2f} | DI-: {snapshot.get('minus_di', 0):.2f}

Rispondi ESCLUSIVAMENTE con un blocco di codice JSON valido strutturato cosi:

```json
{{
  "search_metadata": {{
    "query_input": "{ticker}",
    "company_name": "{company}",
    "ticker": "{ticker}",
    "market": "{market}",
    "analysis_type": "chart_ai",
    "current_market_price": {close_val:.2f},
    "timestamp_utc": "{snapshot.get('date', '')}"
  }},
  "chart_technical_analysis": {{
    "overall_trend": "[Rialzista / Ribassista / Neutro / Consolidamento]",
    "candlestick_pattern": "[descrizione visiva del pattern recente es. Hammer, Engulfing, Doji, Breakout]",
    "volume_analysis": "[lettura visiva dei volumi rispetto alla media sui picchi di prezzo]",
    "identified_levels": {{
      "current_price": "{close_val:.2f}",
      "trigger_price": "{res_val:.2f}",
      "support_price": "{sup_val:.2f}"
    }},
    "chart_supports": ["{sup_val:.2f} €", "{snapshot.get('support_10', 0):.2f} €"],
    "chart_resistances": ["{res_val:.2f} €", "{snapshot.get('resistance_30', 0):.2f} €"],
    "rsi_macd_summary": "[sintesi visiva di RSI e incroci MACD sul grafico]",
    "key_scenario": "[Scenario principale e livello di conferma per eventuale entrata/uscita]",
    "operational_note": "[max 3 righe con indicazione prudente per il trader]"
  }}
}}
```

Regole:
- Rispondi SOLO ed ESCLUSIVAMENTE con il blocco ```json``` senza alcun altro testo prima o dopo.
- Identifica chiaramente il PREZZO, il TRIGGER e il SUPPORTO nel grafico allegato."""


def run_chart_report(context, stock, period="1y", days=252, chart_type="candlestick"):
    safe_print(f"\n=== Generazione & Analisi Grafico AI: {stock['company']} ({stock['ticker']}) [Period: {period}, Days: {days}, Type: {chart_type}] ===")
    output_dir = Path("finance_charts")
    output_dir.mkdir(exist_ok=True)
    snapshot = {}
    chart_file = None
    try:
        from finance_charts.technical_charts import create_chart_bundle
        bundle = create_chart_bundle(stock["ticker"], output_dir, period=period, days=days, chart_type=chart_type)
        snapshot = bundle.get("snapshot", {})
        if bundle.get("files") and len(bundle["files"]) > 0:
            chart_file = bundle["files"][0]
            safe_print(f"Grafico generato con successo: {chart_file}")
    except Exception as e:
        safe_print(f"Avviso: generazione grafico locale non riuscita ({e}). Continuo senza immagine.")

    prompt = build_chart_prompt(stock["company"], stock["ticker"], stock["market"], snapshot)
    page = open_chatgpt_page(context)
    try:
        if chart_file and os.path.exists(chart_file):
            safe_print(f"Caricamento file grafico {chart_file} su ChatGPT...")
            try:
                file_input = page.locator("input[type='file']").first
                file_input.wait_for(state="attached", timeout=5000)
                file_input.set_input_files(str(Path(chart_file).resolve()))
                safe_print("File grafico allegato! Attendo rendering anteprima...")
                page.wait_for_timeout(3000)
            except Exception as fe:
                safe_print(f"Nota: Impossibile allegare il file direttamente ({fe}). Invio dati numerici del grafico.")

        return run_in_page(page, prompt, False)
    except Exception as exc:
        safe_print(f"Errore analisi grafico {stock['ticker']}: {exc}")
        return ""
    finally:
        try:
            page.close()
        except Exception:
            pass


def run_stock_report(context, stock, index=1, total=1):
    safe_print(f"\n=== Analisi {index}/{total}: {stock['company']} ({stock['ticker']}) ===")
    prompt = build_stock_prompt(stock["company"], stock["ticker"], stock["market"])
    page = open_chatgpt_page(context)
    try:
        return run_in_page(page, prompt, False)
    except Exception as exc:
        safe_print(f"Errore analisi {stock['ticker']}: {exc}")
        return ""
    finally:
        try:
            page.close()
        except Exception:
            pass


def pause_between_reports(context):
    pages = context.pages
    if pages:
        pages[-1].wait_for_timeout(PAUSE_BETWEEN_STOCKS_SECONDS * 1000)


def send_telegram_message(text_message):
    if telepot is None:
        safe_print("\nTelegram non inviato: modulo telepot non installato.")
        return
    token = os.getenv(TELEGRAM_TOKEN_ENV) or os.getenv(TELEGRAM_TOKEN_FALLBACK_ENV)
    receiver_id = os.getenv(TELEGRAM_RECEIVER_ENV)
    if not token or not receiver_id:
        safe_print("\nTelegram non inviato: configura TELEGRAM_BOT_TOKEN e TELEGRAM_RECEIVER_ID.")
        return
    try:
        bot = telepot.Bot(token)
        bot.sendMessage(receiver_id, text_message)
    except Exception as exc:
        safe_print(f"\nTelegram non inviato: {exc}")
        return
    safe_print("\nMessaggio Telegram inviato.")


def main():
    configure_stdout()
    load_env_file()
    parser = argparse.ArgumentParser(description="Demo Playwright per una chat manuale con ChatGPT.")
    parser.add_argument(
        "prompt",
        nargs="?",
        default="",
        help="Messaggio custom da inviare a ChatGPT. Se omesso, viene costruito un report sul titolo indicato.",
    )
    parser.add_argument(
        "--company",
        default=DEFAULT_COMPANY,
        help="Nome societa/titolo da analizzare.",
    )
    parser.add_argument(
        "--ticker",
        default=DEFAULT_TICKER,
        help="Ticker del titolo, opzionale.",
    )
    parser.add_argument(
        "--market",
        default=DEFAULT_MARKET,
        help="Mercato/listino del titolo, opzionale.",
    )
    parser.add_argument(
        "--stocks",
        default="",
        help='Lista ticker separati da virgola, es. "VOD.L,A2A.MI,AVIO.MI". Usata se non passi un prompt custom.',
    )
    parser.add_argument(
        "--login-only",
        action="store_true",
        help="Apre ChatGPT e lascia il browser aperto per fare login manuale.",
    )
    parser.add_argument(
        "--chrome",
        action="store_true",
        help="Usa Google Chrome reale invece del Chromium bundled di Playwright.",
    )
    parser.add_argument(
        "--cdp",
        default=DEFAULT_CDP_URL,
        help="Connetti Playwright a un Chrome gia' avviato con remote debugging, es. http://127.0.0.1:9222.",
    )
    parser.add_argument(
        "--telegram",
        action="store_true",
        help="Invia la risposta raccolta su Telegram usando TELEGRAM_BOT_TOKEN e TELEGRAM_RECEIVER_ID da .env.",
    )
    parser.add_argument(
        "--no-telegram",
        action="store_true",
        help="Disattiva l'invio Telegram anche se SEND_TELEGRAM_BY_DEFAULT e True.",
    )
    parser.add_argument(
        "--analyze-chart",
        action="store_true",
        help="Genera grafico locale ed esegue l'analisi visuale AI del grafico via Playwright.",
    )
    args = parser.parse_args()
    send_to_telegram = False if args.no_telegram else (args.telegram or SEND_TELEGRAM_BY_DEFAULT)
    if args.stocks:
        stock_list = [stock_from_ticker(t) for t in parse_stock_list(args.stocks)]
    else:
        stock_list = [{
            "ticker": args.ticker.strip().strip('"').strip("'").upper(),
            "company": args.company.strip().strip('"').strip("'"),
            "market": args.market.strip().strip('"').strip("'")
        }]

    with sync_playwright() as p:
        context = None
        use_cdp = False
        
        if args.cdp:
            try:
                safe_print(f"Tentativo di connessione a Chrome via CDP ({args.cdp})...")
                browser = p.chromium.connect_over_cdp(args.cdp)
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                use_cdp = True
                safe_print("Connessione CDP stabilita con successo!")
            except Exception as exc:
                safe_print(f"Impossibile connettersi via CDP ({exc}).")
                safe_print("Avvio una nuova istanza visibile di Google Chrome reale...")

        if not use_cdp:
            launch_options = {
                "user_data_dir": str(CHROME_PROFILE_DIR if args.chrome else PROFILE_DIR),
                "headless": False,
                "viewport": {"width": 1400, "height": 900},
            }
            # Utilizza il canale Chrome reale se disponibile
            launch_options["channel"] = "chrome"
            try:
                context = p.chromium.launch_persistent_context(**launch_options)
            except Exception as e:
                safe_print(f"Errore lancio Chrome reale ({e}). Provo Chromium standard...")
                if "channel" in launch_options:
                    del launch_options["channel"]
                try:
                    context = p.chromium.launch_persistent_context(**launch_options)
                except Exception as e2:
                    safe_print(f"Impossibile avviare il browser: {e2}")
                    return

        if args.analyze_chart:
            for index, stock in enumerate(stock_list, start=1):
                response = run_chart_report(context, stock)
                if send_to_telegram and response:
                    send_telegram_message(response)
        elif args.prompt or args.login_only:
            prompt = args.prompt or build_stock_prompt(args.company, args.ticker, args.market)
            page = open_chatgpt_page(context)
            response = run_in_page(page, prompt, args.login_only)
            if send_to_telegram and response:
                send_telegram_message(response)
        else:
            for index, stock in enumerate(stock_list, start=1):
                response = run_stock_report(context, stock, index, len(stock_list))
                if send_to_telegram and response:
                    send_telegram_message(response)
                pause_between_reports(context)
                
        if not use_cdp and context:
            context.close()


if __name__ == "__main__":
    main()
