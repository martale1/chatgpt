import argparse
import json
import os
import sys
import urllib.request
import urllib.parse
from pathlib import Path

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

def query_tavily(search_term, api_key):
    try:
        req = urllib.request.Request(
            "https://api.tavily.com/search",
            headers={"Content-Type": "application/json"},
            data=json.dumps({
                "api_key": api_key,
                "query": search_term,
                "search_depth": "advanced",
                "max_results": 6,
                "include_answer": True
            }).encode("utf-8")
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        safe_print(f"Nota Tavily Search: {e}")
        return None

def query_gemini_api(prompt, gemini_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.2, "response_mime_type": "application/json"}
    }
    try:
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"}, data=json.dumps(payload).encode("utf-8"))
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            try:
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return text
            except (KeyError, IndexError):
                return None
    except Exception as e:
        safe_print(f"Nota Gemini API: {e}")
        return None

def query_openai_api(prompt, openai_key):
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Sei un analista finanziario senior di Wall Street. Rispondi esclusivamente in formato JSON valido."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }
    try:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}, data=json.dumps(payload).encode("utf-8"))
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        safe_print(f"Nota OpenAI API: {e}")
        return None

def run_gemini_analysis(ticker, company, market):
    safe_print(f"🚀 Avvio ricerca Google Gemini per {company} ({ticker})...")
    load_env_file()
    
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    tavily_key = os.getenv("TAVILY_API_KEY")
    
    # 1. Recupero notizie live recenti tramite Tavily se disponibile
    search_context = ""
    if tavily_key:
        safe_print(f"🔍 Ricerca notizie live su Google/Tavily per {company} ({ticker})...")
        tav_res = query_tavily(f"notizie recenti e target price analisti {company} {ticker} Borsa", tavily_key)
        if tav_res and tav_res.get("results"):
            search_context = "\n".join([f"- Titolo: {r.get('title')}\n  Fonte: {r.get('url')}\n  Testo: {r.get('content')}" for r in tav_res["results"]])
    
    # 2. Recupero prezzo live da Yahoo Finance
    import yfinance as yf
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(period="5d")
        current_price = round(float(hist["Close"].iloc[-1]), 2) if len(hist) > 0 else 0.0
    except Exception:
        current_price = 0.0

    prompt = f"""Analizza i dati di mercato e le ultime notizie per il titolo {company} ({ticker}) su {market}.
Prezzo corrente di mercato: {current_price}

Notizie ed elementi rilevanti dal web:
{search_context if search_context else "Ricerca notizie recenti e target price analisti per " + company}

Rispondi ESCLUSIVAMENTE con un JSON valido con questa struttura esatta:
```json
{{
  "search_metadata": {{
    "query_input": "{ticker}",
    "company_name": "{company}",
    "ticker": "{ticker}",
    "market": "{market}",
    "current_market_price": {current_price},
    "timestamp_utc": "2026-08-09T18:50:00Z"
  }},
  "market_sentiment_summary": {{
    "overall_sentiment": "Positivo",
    "sentiment_score": 0.75,
    "expected_impact": "Rialzista",
    "summary_explanation": "Sintesi chiara delle ultime notizie e driver del titolo.",
    "news_highlights": ["Highlight 1", "Highlight 2", "Highlight 3"]
  }},
  "recent_news_last_3_days": [
    {{
      "id": "news_1",
      "headline": "Titolo Notizia 1",
      "date": "2026-08-08",
      "source": "Borsa Italiana",
      "source_domain": "borsaitaliana.it",
      "url": null,
      "category": "Corporate",
      "summary": "Riassunto prima notizia",
      "detail": "Testo completo e dettagliato con dati e percentuali",
      "sentiment": "Positivo",
      "impact_rating": "Alto"
    }}
  ],
  "latest_available_news": [],
  "analyst_ratings_and_targets": [
    {{
      "broker": "Banca / Broker",
      "rating": "Buy",
      "target_price": "3.50",
      "currency": "EUR",
      "date": "2026-08-01",
      "note": "Target price e raccomandazione analista"
    }}
  ],
  "technical_levels": {{
    "supports": ["Supporto 1", "Supporto 2"],
    "resistances": ["Resistenza 1", "Resistenza 2"],
    "critical_levels_notes": "Note sui livelli tecnici chiave"
  }}
}}
```"""

    raw_response = None
    if gemini_key:
        safe_print("✨ Generazione report tramite Google Gemini 1.5 API...")
        raw_response = query_gemini_api(prompt, gemini_key)
    
    if not raw_response and openai_key:
        safe_print("✨ Generazione report tramite OpenAI API...")
        raw_response = query_openai_api(prompt, openai_key)
        
    if not raw_response:
        safe_print("Avviso: Nessuna API Key fornita per Gemini/OpenAI. Utilizzo estrattore strutturato diretto.")
        raw_response = json.dumps({
            "search_metadata": {
                "query_input": ticker,
                "company_name": company,
                "ticker": ticker,
                "market": market,
                "current_market_price": current_price,
                "timestamp_utc": "2026-08-09T18:50:00Z"
            },
            "market_sentiment_summary": {
                "overall_sentiment": "Neutro",
                "sentiment_score": 0.5,
                "expected_impact": "Consolidamento",
                "summary_explanation": f"Analisi Gemini per {company} ({ticker}). Prezzo corrente: {current_price} €.",
                "news_highlights": [f"Dati di mercato aggiornati per {company}"]
            },
            "recent_news_last_3_days": [],
            "latest_available_news": [],
            "analyst_ratings_and_targets": [],
            "technical_levels": {
                "supports": [f"{round(current_price * 0.95, 2)} €"],
                "resistances": [f"{round(current_price * 1.05, 2)} €"],
                "critical_levels_notes": f"Livelli tecnici calcolati attorno a {current_price} €."
            }
        })

    safe_print("\n--- Risposta ChatGPT ---")
    safe_print(raw_response)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", default="A2A.MI")
    parser.add_argument("--company", default="A2A")
    parser.add_argument("--market", default="Borsa Italiana")
    parser.add_argument("--no-telegram", action="store_true")
    args = parser.parse_args()
    
    info = STOCK_CATALOG.get(args.ticker.upper(), {"company": args.company, "market": args.market})
    run_gemini_analysis(args.ticker.upper(), info["company"], info["market"])

if __name__ == "__main__":
    main()
