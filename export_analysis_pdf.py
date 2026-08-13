import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "cache"
TICKERS_DIR = CACHE_DIR / "tickers"
CHARTS_DIR = ROOT / "finance_charts"
OUTPUT_DIR = ROOT / "output" / "pdf"
CHART_PYTHON = Path(r"C:\Users\theoi\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.10_qbz5n2kfra8p0\python.exe")

CHART_KINDS = [
    ("price_alligator", "Prezzo + Alligator + Supporti/Trigger"),
    ("volume", "Volumi"),
]
PORTFOLIO_CHART_KINDS = CHART_KINDS + [
    ("oscillators", "RSI + Stocastico + Williams %R"),
    ("macd", "MACD + Signal + Istogramma"),
    ("adx", "ADX + Movimento Direzionale DI+/DI-"),
]


def fix_text(value):
    if value is None:
        return ""
    text = str(value)
    # Best-effort repair for cached mojibake like capacitÃ , Ã¨, piÃ¹.
    try:
        repaired = text.encode("latin1").decode("utf-8")
        if repaired.count("Ã") + repaired.count("Â") < text.count("Ã") + text.count("Â"):
            text = repaired
    except Exception:
        pass
    return (
        text.replace("â‚¬", "EUR")
        .replace("€", "EUR")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2192", "->")
    )


def load_json(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def get_nested(data, *keys, default=""):
    cur = data or {}
    for key in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
    return cur if cur is not None else default


def chart_path(ticker, period, days, chart_type, kind="price_alligator"):
    safe_ticker = ticker.replace("/", "_")
    suffix = f"{period}_{days}_{chart_type}"
    path = CHARTS_DIR / f"{safe_ticker}_{suffix}_{kind}.png"
    if path.exists():
        return path
    return None


def ensure_clean_chart_bundle(ticker, period, days, chart_type, chart_kinds=None):
    # Generate the exact chart set used by the interface for this timeframe.
    # Do not rely on older fallback charts: the PDF must contain fresh, explicit PNGs.
    suffix = f"{period}_{days}_{chart_type}"
    generator = CHART_PYTHON if CHART_PYTHON.exists() else Path(sys.executable)
    chart_kinds = chart_kinds or CHART_KINDS
    kind_names = [kind for kind, _ in chart_kinds]
    code = (
        "from pathlib import Path\n"
        "from finance_charts.technical_charts import create_chart_bundle\n"
        "create_chart_bundle("
        f"{ticker!r}, Path({str(CHARTS_DIR)!r}), "
        f"period={period!r}, days={int(days)!r}, chart_type={chart_type!r}, "
        f"output_suffix={suffix!r}, chart_kinds={kind_names!r})\n"
    )
    try:
        subprocess.run(
            [str(generator), "-c", code],
            cwd=str(ROOT),
            check=True,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except Exception as exc:
        print(f"WARNING chart generation failed for {ticker}: {exc}", file=sys.stderr)
    return {kind: chart_path(ticker, period, days, chart_type, kind) for kind, _ in chart_kinds}


def normalize_tickers(raw):
    result = []
    for item in raw:
        t = str(item).strip().upper()
        if t and t not in result:
            result.append(t)
    return result


def portfolio_prompt_text(tickers, period, days, chart_type, portfolio):
    tickers_line = ", ".join(tickers)
    positions = json.dumps(portfolio, ensure_ascii=False, indent=2)
    return f"""RUOLO E OBIETTIVO - GESTIONE DI POSIZIONI APERTE
Agisci come analista finanziario prudente e indipendente. I titoli {tickers_line} sono gia presenti nel portafoglio dell'utente: non sono candidati di una watchlist e non devi valutarli come nuovi ingressi. L'obiettivo e aiutare l'utente a capire, per ciascuna posizione, se il quadro aggiornato giustifica mantenimento, protezione dei profitti, riduzione dell'esposizione, revisione urgente oppure possibile uscita.

DATI REALI DEL PORTAFOGLIO
Usa esattamente i dati forniti, senza modificarli o dedurli:
{positions}
Nelle pagine successive trovi, per ogni posizione: prezzo con Alligator e livelli tecnici, volumi, RSI/Stocastico/Williams %R, MACD con Signal e istogramma, ADX con DI+ e DI-. Periodo: {period}; circa {days} sessioni; tipo: {chart_type}.

ANALISI OBBLIGATORIA PER OGNI POSIZIONE
1. Verifica il prezzo di mercato piu recente da una fonte attendibile e calcola valore corrente, utile/perdita in EUR e rendimento percentuale rispetto a quantita, prezzo di carico e commissioni. Specifica fonte e timestamp del prezzo.
2. Esegui una ricerca web reale e separata per ciascun ticker e societa. Crea due gruppi distinti: (a) news recenti pubblicate negli ultimi 7 giorni di calendario; (b) news meno recenti ma ancora materialmente rilevanti, pubblicate oltre 7 giorni e non oltre 180 giorni. Le news storiche devono essere incluse soltanto se influenzano ancora la tesi della posizione (risultati, guidance, operazioni straordinarie, contratti, regolamentazione, dividendi o rating). Non mescolare i due gruppi. Controlla investor relations, comunicati regolamentati, autorita di mercato e fonti finanziarie affidabili. Riporta data e ora, fonte e URL diretto verificabile.
3. Cerca il target price degli analisti piu recente quando disponibile. Riporta valore, valuta, data, fonte, URL, tipo di dato (consensus oppure singolo analista), numero di analisti se disponibile e upside/downside rispetto al prezzo corrente. Non inventare target e non usare livelli tecnici come target price degli analisti.
4. Valuta sentiment e impatto delle notizie sulla posizione gia aperta, dando peso maggiore alle news degli ultimi 7 giorni e usando quelle storiche soltanto come contesto.
5. Interpreta congiuntamente prezzo, volumi, MACD, Stocastico e ADX: trend, momentum, forza direzionale, divergenze, condizioni di ipercomprato/ipervenduto, supporti, resistenze, livelli di invalidazione e livelli utili a proteggere capitale o profitto. Non usare un singolo indicatore isolato come prova sufficiente.
6. Confronta sempre prezzo corrente, target price analisti e livelli tecnici con il prezzo medio di carico. Mantieni chiaramente separati target degli analisti e take profit tecnico.
7. Se la posizione contiene `configured_stop_loss`, trattalo come livello inserito manualmente dall'utente e non modificarlo nei dati di input. Verifica se e coerente con prezzo corrente, prezzo di carico, supporti, volatilita, trend e rischio. Indica esplicitamente se mantenerlo, modificarlo, rimuoverlo o sottoporlo a revisione; se proponi una modifica fornisci il nuovo livello e una motivazione verificabile. Se il valore e null, segnala che non e configurato e valuta comunque un eventuale livello suggerito.
8. Assegna una sola azione prevalente: HOLD, HOLD_OR_TRAILING_STOP, REDUCE, REVIEW_POSITION oppure EXIT_CANDIDATE. Non usare BUY_CANDIDATE, DO_NOT_BUY o suggerimenti da watchlist.
9. Fornisci condizioni osservabili che farebbero confermare o cambiare l'azione: chiusura giornaliera, supporto perso, breakout, volumi, notizie avverse o miglioramento fondamentale.

SIGNIFICATO DELLE AZIONI
- HOLD: mantenere sotto monitoraggio; quadro coerente e nessun segnale urgente.
- HOLD_OR_TRAILING_STOP: posizione favorevole o in profitto; valutare protezione dinamica senza indicare ordini automatici.
- REDUCE: rischio/concentrazione aumentati; valutare una riduzione parziale con revisione umana.
- REVIEW_POSITION: dati contrastanti o deterioramento che richiedono decisione tempestiva dell'utente.
- EXIT_CANDIDATE: tesi compromessa o livello critico violato; possibile uscita da valutare personalmente. Non e un ordine automatico.

FORMATO DELLA RISPOSTA DESCRITTIVA
- Inizia con data/ora, fonti disponibili e avvertenza che l'analisi e informativa.
- Crea una tabella portafoglio con: ticker, quantita, prezzo di carico, stop loss configurato dall'utente, esito verifica stop, stop suggerito, prezzo corrente, valore corrente, P/L EUR, P/L %, sentiment news, trend, rischio, azione, priorita e livello obiettivo.
- Dedica una sezione a ogni posizione: situazione economica rispetto al carico; news verificate; sentiment; lettura prezzo/volumi; scenario base; scenario favorevole; scenario avverso; livello protettivo; livello di revisione/uscita; azione prevalente e motivazione.
- Concludi con rischi complessivi del portafoglio, concentrazioni/correlazioni osservabili, posizioni che richiedono attenzione prioritaria e calendario dei prossimi eventi. Non proporre titoli estranei al portafoglio.

OUTPUT JSON PORTAFOGLIO (OBBLIGATORIO)
Dopo la risposta descrittiva genera un solo blocco JSON valido, senza commenti o testo interno estraneo, salvabile come `portfolio_analysis_output.json`.
Campi radice obbligatori: `schema_version`, `generated_at`, `market`, `source`, `portfolio_summary`, `securities`.
- `schema_version`: `1.0`; `generated_at`: ISO-8601 con fuso orario.
- `source`: `file`, `period` = `{period}`, `sessions_approx` = {days}, `chart_type` = `{chart_type}`, `price_sources` (array di fonti usate).
- `portfolio_summary`: `total_invested`, `current_market_value`, `unrealized_gain_eur`, `unrealized_gain_pct`, `priced_positions`, `total_positions`, `overall_risk` (`LOW|MEDIUM|HIGH`), `summary`, `priority_tickers` (array), `news_overview`.
- `portfolio_summary.news_overview`: oggetto con `overall_sentiment` (`POSITIVE|NEUTRAL|NEGATIVE|MIXED`), `sentiment_score` (-1..1), `summary` (2-4 frasi), `main_positive_news` (array di stringhe), `main_negative_news` (array di stringhe), `highest_impact_tickers` (array di ticker), `last_news_at` (ISO-8601 oppure null).
- `securities`: esattamente una voce per ciascuna posizione e nello stesso ordine. Ogni voce deve contenere `ticker`, `company`, `source_page`, `position`, `stop_loss_review`, `news_research`, `news_summary`, `sentiment_analysis`, `recent_news_7d`, `older_relevant_news`, `analyst_target`, `technical`, `portfolio_assessment`, `operational_plan`, `management_rules`.
- `position`: `status` = `OPEN`, `quantity`, `entry_price`, `configured_stop_loss`, `purchase_date`, `fees` copiati esattamente dai dati forniti; `current_price`, `price_timestamp`, `price_source`, `market_value`, `unrealized_gain_eur`, `unrealized_gain_pct` calcolati oppure null se non verificabili.
- `stop_loss_review`: oggetto obbligatorio e separato dallo stop tecnico generato, con `configured_level` (copia esatta di `position.configured_stop_loss`, oppure null), `recommendation` (`KEEP|MODIFY|REMOVE|REVIEW_REQUIRED`), `suggested_level` (numero oppure null), `distance_configured_from_current_pct` (numero oppure null), `distance_suggested_from_current_pct` (numero oppure null), `reason` (spiegazione chiara in italiano), `risk_note` (rischio di mantenere o modificare il livello), `based_on` (array con elementi fra `PRICE`, `ENTRY_PRICE`, `SUPPORT`, `VOLATILITY`, `TREND`, `NEWS`, `FUNDAMENTALS`) e `requires_human_review` (sempre true). Se non esiste uno stop configurato usa `configured_level` = null e `recommendation` = `REVIEW_REQUIRED`; non usare `KEEP` o `MODIFY` senza un livello configurato.
- `sentiment_analysis`: `overall_sentiment` (`POSITIVE|NEUTRAL|NEGATIVE`), `sentiment_score` (-1..1), `confidence_score` (0..1), `expected_price_impact` (`BULLISH|CONSOLIDATION|BEARISH|UNCERTAIN`), `impact_horizon`, `summary`, `positive_drivers`, `negative_drivers`, `last_news_at`.
- `news_research`: `status` (`COMPLETED`, `PARTIAL`, `UNAVAILABLE`), `searched_at` (ISO-8601), `recent_lookback_days` = 7, `historical_lookback_days` = 180, `queries` (array delle query realmente eseguite), `sources_checked` (array), `recent_result_count`, `older_result_count`, `limitations` (array). Non dichiarare `COMPLETED` senza avere effettuato la ricerca web.
- `news_summary` e obbligatorio e ottimizzato per la visualizzazione in GUI: `overall_sentiment` (`POSITIVE|NEUTRAL|NEGATIVE`), `sentiment_score` (-1..1), `confidence_score` (0..1), `expected_price_impact` (`BULLISH|CONSOLIDATION|BEARISH|UNCERTAIN`), `headline` (una frase sintetica), `summary` (2-4 frasi in italiano), `key_catalyst` (stringa oppure null), `main_risk` (stringa oppure null), `news_count` (intero), `last_news_at` (ISO-8601 oppure null). Deve essere coerente con `sentiment_analysis` e `relevant_news`.
- `recent_news_7d`: da 0 a 5 notizie verificate degli ultimi 7 giorni, ordinate dalla piu recente, con `id`, `headline`, `published_at`, `age_hours`, `source`, `source_url`, `category`, `sentiment`, `impact_rating`, `expected_price_impact`, `summary`, `verified`.
- `older_relevant_news`: da 0 a 5 notizie verificate tra 8 e 180 giorni, ordinate dalla piu recente, con gli stessi campi e in aggiunta `ongoing_relevance` che spiega perche l'evento e ancora importante oggi. Non duplicare notizie presenti in `recent_news_7d`.
- `analyst_target`: oggetto obbligatorio con `available` (booleano), `target_price` (numero oppure null), `currency` (stringa oppure null), `current_price` (numero oppure null), `upside_downside_pct` (numero oppure null), `as_of_date` (ISO-8601 oppure null), `source`, `source_url`, `target_type` (`CONSENSUS`, `SINGLE_ANALYST`, `RANGE`, `UNAVAILABLE`), `analyst_count` (intero oppure null), `low_target` (numero oppure null), `high_target` (numero oppure null), `rating_consensus` (stringa oppure null). Se non verificabile, usa `available` = false e tutti i valori non disponibili a null.
- Breakout, supporti, MACD, ADX, volumi, target e livelli grafici NON sono notizie e non possono comparire come `key_catalyst`, headline o driver news salvo che siano esplicitamente separati e qualificati come segnali tecnici.
- `technical`: almeno `reference_price`, `trend`, `major_support`, `resistance`, `protective_level`, `review_level`, `target_level`; usa null per valori non ricavabili in modo affidabile.
- `portfolio_assessment`: `recommended_action` (`HOLD|HOLD_OR_TRAILING_STOP|REDUCE|REVIEW_POSITION|EXIT_CANDIDATE`), `priority` (`LOW|MEDIUM|HIGH|CRITICAL`), `risk_level` (`LOW|MEDIUM|HIGH`), `reason`, `position_thesis`, `main_risk`, `next_catalyst`, `protective_level`, `target_level`, `requires_human_review`.
- `operational_plan` e obbligatorio e deve contenere:
  - `plan_status`: `ACTIVE`, `WAIT_CONFIRMATION`, `REVIEW_REQUIRED` oppure `NOT_AVAILABLE`.
  - `reference_price`: ultimo prezzo verificato oppure null; `reference_timestamp`: ISO-8601 oppure null.
  - `stop_loss`: oggetto con `level` (numero oppure null), `distance_from_current_pct` (numero oppure null), `distance_from_entry_pct` (numero oppure null), `trigger` (`DAILY_CLOSE`, `INTRADAY`, `WEEKLY_CLOSE` oppure null), `reason` e `source` (`TECHNICAL`, `VOLATILITY`, `FUNDAMENTAL`, `COMBINED` oppure null).
  - `take_profit_levels`: array ordinato di massimo 3 oggetti, ciascuno con `label` (`TP1`, `TP2`, `TP3`), `level`, `gain_from_current_pct`, `gain_from_entry_pct`, `suggested_position_reduction_pct` (0..100 oppure null), `condition` e `reason`.
  - `trailing_stop`: oggetto con `enabled` (booleano), `activation_level` (numero oppure null), `trail_pct` (numero oppure null), `reason`.
  - `risk_reward`: oggetto con `risk_per_share`, `reward_to_tp1_per_share`, `ratio_to_tp1` (numeri oppure null) e `assessment` (`FAVORABLE`, `NEUTRAL`, `UNFAVORABLE`, `NOT_CALCULABLE`).
  - `time_horizon`: `INTRADAY`, `SHORT_TERM`, `MEDIUM_TERM` oppure `LONG_TERM`.
  - `confirmation_conditions`, `invalidation_conditions`, `monitoring_triggers`: array di stringhe osservabili e verificabili.
  - `next_review_at`: ISO-8601 oppure null; `review_on_event`: array contenente eventi come `EARNINGS`, `GUIDANCE`, `DIVIDEND`, `BREAKOUT`, `BREAKDOWN`, `MAJOR_NEWS`.
- Lo stop suggerito e i take profit devono derivare dai grafici, dalla volatilita e dal prezzo di carico, non da percentuali arbitrarie. Non sovrascrivere mai `configured_stop_loss`: la valutazione va riportata in `stop_loss_review`. Se un nuovo livello non e determinabile con sufficiente affidabilita usa null e `plan_status` = `REVIEW_REQUIRED` o `NOT_AVAILABLE`. Non presentare mai questi livelli come ordini da eseguire automaticamente.
- `management_rules`: array di regole con `id`, `condition`, `action`, `priority`, `reason`. Le action devono appartenere esclusivamente al vocabolario Portafoglio sopra. Le condizioni devono essere deterministiche ma non devono essere presentate come ordini automatici.

REGOLE DI QUALITA E SICUREZZA
- Non inventare prezzi, notizie, URL, livelli o calcoli. Usa null e dichiara il limite se un dato non e verificabile.
- Separa fatti, inferenze e scenari. Considera recenza e affidabilita delle fonti.
- Non sostituire ticker con societa omonime e non includere titoli esterni.
- Non suggerire acquisti aggiuntivi, dimensioni di ordini o esecuzioni automatiche.
- Le azioni sono indicazioni informative per revisione umana, non consulenza finanziaria personalizzata o garanzie di rendimento.
- Prima di rispondere verifica coerenza matematica e validita sintattica del JSON.
"""


def prompt_text(tickers, period, days, chart_type, portfolio=None):
    if portfolio:
        return portfolio_prompt_text(tickers, period, days, chart_type, portfolio)
    tickers_line = ", ".join(tickers)
    portfolio = portfolio or []
    portfolio_block = ""
    if portfolio:
        positions = json.dumps(portfolio, ensure_ascii=False, indent=2)
        portfolio_block = f"""

CONTESTO PORTAFOGLIO REALE
Questi titoli sono posizioni realmente aperte, non una watchlist. Usa esattamente quantita, prezzo medio di carico, data, commissioni e note forniti qui sotto:
{positions}
Valuta ogni posizione rispetto al prezzo di carico e al rischio attuale. Non suggerire nuovi ingressi come se il titolo non fosse gia detenuto.
"""
    return f"""RUOLO E OBIETTIVO
Agisci come analista finanziario prudente e indipendente. Produci un'analisi aggiornata esclusivamente per questi titoli: {tickers_line}.

DATI DISPONIBILI
Nelle pagine successive sono inclusi, per ogni titolo, un grafico prezzo con Alligator e livelli tecnici e un grafico dei volumi. Periodo: {period}; circa {days} sessioni; rappresentazione: {chart_type}. I grafici sono dati di input da interpretare, non analisi gia validate.
{portfolio_block}

RICERCA DA ESEGUIRE
1. Cerca online le notizie piu recenti e rilevanti per ogni societa, privilegiando fonti ufficiali, comunicati societari, autorita di mercato e testate finanziarie affidabili.
2. Per ogni notizia indica titolo sintetico, data, fonte e collegamento consultabile. Separa chiaramente fatti verificati, dichiarazioni delle fonti e tue inferenze.
3. Valuta il sentiment delle notizie come positivo, neutro o negativo e spiega brevemente il motivo.
4. Stima l'impatto potenziale sul prezzo come rialzista, consolidamento o ribassista, indicando orizzonte temporale e principali rischi.
5. Interpreta prezzo e volumi identificando trend, forza o debolezza del movimento, supporti, resistenze, trigger, rischio di breakdown, scenario principale e scenario alternativo.
6. Combina notizie, sentiment e segnali grafici in una valutazione prudente e comparabile.

FORMATO DELLA RISPOSTA
- Inizia con data e ora dell'analisi e una breve nota sulla disponibilita delle fonti.
- Crea una tabella riepilogativa con: ticker, notizia/catalizzatore principale, sentiment, impatto atteso, score 0-100, trend, supporto, resistenza o trigger, scenario e priorita.
- Dedica poi una sezione a ogni titolo con: notizie e fonti; lettura del prezzo; lettura dei volumi; livelli tecnici; scenario principale; scenario alternativo; condizioni di invalidazione; rischi e dati mancanti.
- Concludi con una graduatoria motivata, i titoli da monitorare e quelli da evitare. Se i titoli sono meno di tre, classificali tutti senza aggiungerne altri.
- Dopo le analisi di dettaglio, inserisci una tabella di sintesi finale con una riga per ogni ticker e queste colonne: ticker, sentiment news, impatto atteso, score 0-100, trend, supporto principale, resistenza o trigger, scenario prevalente, rischio principale e priorita. La tabella deve permettere un confronto immediato e deve essere coerente con le conclusioni delle singole analisi.

OUTPUT JSON PER IL SOFTWARE (OBBLIGATORIO)
- Dopo tutta la risposta descrittiva, genera un unico blocco di codice JSON valido e completo, senza commenti, ellissi, placeholder o testo aggiuntivo dentro il blocco. Il blocco deve poter essere copiato e salvato direttamente con il nome `{'portfolio_analysis_output.json' if portfolio else 'ftse_mib_monitor_config.json'}`.
- Il JSON deve contenere esclusivamente questi campi radice: `schema_version`, `generated_at`, `market`, `source`, `strategy`, `signal_vocabulary`, `securities`, `agent_observation_schema`, `agent_decision_schema`.
- Usa `schema_version` = `1.0`, `generated_at` in formato ISO-8601 con fuso orario e `market` = `Borsa Italiana`.
- In `source` inserisci: `file` con il nome del PDF ricevuto se disponibile (altrimenti null), `period` = `{period}`, `sessions_approx` = {days}, `chart_type` = `{chart_type}` e `indicators_available` come array ricavato dai grafici (per esempio Alligator, support_levels, trigger_levels, volume).
- In `strategy` usa: `name` = `technical_levels_plus_news_sentiment`, `default_breakout_confirmation` = `daily_close AND volume_confirmation`, `technical_levels_validity_days` = 7 e `refresh_on` = [`breakout`, `breakdown`, `major_news`, `technical_expiry`].
- `signal_vocabulary` deve essere esattamente: [`BUY_CANDIDATE`, `BREAKOUT_CONFIRMED`, `PULLBACK_ENTRY_CANDIDATE`, `HOLD`, `HOLD_OR_TRAILING_STOP`, `WAIT`, `WARNING`, `REVIEW_POSITION`, `SETUP_INVALIDATED`, `DO_NOT_BUY`].
- `securities` deve contenere esattamente un oggetto per ciascuno dei ticker richiesti, nello stesso ordine. Ogni oggetto deve avere `ticker`, `company`, `source_page`, `position`, `sentiment_analysis`, `relevant_news`, `technical` e `rules`.
- `position` deve avere `status`, `quantity`, `entry_price`, `purchase_date`, `fees`, `current_price`, `market_value`, `unrealized_gain_eur` e `unrealized_gain_pct`. Per le posizioni fornite usa `status` = `OPEN` e conserva esattamente quantità e dati di carico; calcola i valori correnti solo con prezzi verificabili.
- Per ogni posizione aperta aggiungi `portfolio_assessment` con: `recommended_action` (`HOLD`, `HOLD_OR_TRAILING_STOP`, `REDUCE`, `REVIEW_POSITION` oppure `EXIT_CANDIDATE`), `priority` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `reason`, `risk_level` (`LOW`, `MEDIUM`, `HIGH`), `protective_level` (numero oppure null), `target_level` (numero oppure null) e `requires_human_review` (booleano). Sono indicazioni informative, non ordini automatici.
- `sentiment_analysis` e obbligatorio per ogni titolo e deve avere esattamente: `overall_sentiment` (`POSITIVE`, `NEUTRAL` oppure `NEGATIVE`), `sentiment_score` (numero da -1.0 a 1.0), `confidence_score` (numero da 0.0 a 1.0), `expected_price_impact` (`BULLISH`, `CONSOLIDATION`, `BEARISH` oppure `UNCERTAIN`), `impact_horizon` (`INTRADAY`, `SHORT_TERM`, `MEDIUM_TERM` oppure `LONG_TERM`), `summary` (stringa sintetica in italiano), `positive_drivers` (array di stringhe), `negative_drivers` (array di stringhe), `last_news_at` (data e ora ISO-8601 oppure null). Il punteggio deve riflettere le notizie verificate, non il solo andamento del grafico.
- `relevant_news` e obbligatorio per ogni titolo e deve essere un array ordinato dalla notizia piu recente alla meno recente. Includi fino a 5 notizie realmente rilevanti e aggiornate. Ogni notizia deve avere esattamente: `id` (stringa univoca nel titolo), `headline`, `published_at` (ISO-8601 oppure null se l'ora non e disponibile), `source`, `source_url` (URL completo e consultabile oppure null), `category` (`EARNINGS`, `GUIDANCE`, `M_AND_A`, `REGULATION`, `CONTRACT`, `PRODUCT`, `MANAGEMENT`, `MACRO`, `ANALYST_RATING` oppure `OTHER`), `sentiment` (`POSITIVE`, `NEUTRAL` oppure `NEGATIVE`), `impact_rating` (`LOW`, `MEDIUM`, `HIGH` oppure `CRITICAL`), `expected_price_impact` (`BULLISH`, `CONSOLIDATION`, `BEARISH` oppure `UNCERTAIN`), `summary` (2-4 frasi fattuali in italiano) e `verified` (booleano).
- Se non trovi notizie affidabili per un titolo, usa `relevant_news`: [] e imposta `sentiment_analysis.overall_sentiment` a `NEUTRAL`, `sentiment_score` a 0, `confidence_score` a 0, `expected_price_impact` a `UNCERTAIN`, `last_news_at` a null; spiega il limite nel campo `summary`. Non inventare headline, fonti, URL o date.
- La sintesi del sentiment deve essere coerente con le singole notizie: notizie ad alto impatto devono pesare piu di quelle a basso impatto; eventi piu recenti devono pesare piu di quelli obsoleti; eventuali conflitti tra fonti devono ridurre `confidence_score`.
- `technical` deve includere almeno `reference_price` e `trend`; aggiungi solo se supportati dai grafici campi numerici come `breakout_trigger`, `recovery_trigger`, `major_breakout_trigger`, `warning_level`, `major_support`, oppure intervalli a due numeri come `pullback_zone`, `warning_zone`, `recovery_zone`, `pullback_buy_zone`.
- `rules` deve essere un array di regole operative derivate dai livelli osservabili. Ogni regola deve avere `id`, `condition`, `action` e `priority`. `action` deve appartenere a `signal_vocabulary`; `priority` deve essere `LOW`, `MEDIUM`, `HIGH` oppure `CRITICAL`. Usa condizioni testuali deterministiche compatibili con esempi quali `daily_close > 12.48 AND volume_confirmation == true`.
- Non inventare livelli mancanti. Se non ci sono dati sufficienti per una regola affidabile, usa un array `rules` vuoto e spiega la mancanza nella parte descrittiva, fuori dal JSON.
- Inserisci infine questi due oggetti schema esattamente con i campi e i tipi indicati:
  `agent_observation_schema`: {{`ticker`: `string`, `timestamp`: `ISO-8601`, `price`: `number`, `daily_close`: `number|null`, `daily_change_pct`: `number|null`, `volume`: `number|null`, `volume_average_20d`: `number|null`, `volume_confirmation`: `boolean|null`, `technical_reversal`: `boolean|null`, `news_sentiment`: `POSITIVE|NEUTRAL|NEGATIVE|null`, `analyst_consensus`: `string|null`, `analyst_target_price`: `number|null`}}.
  `agent_decision_schema`: {{`ticker`: `string`, `timestamp`: `ISO-8601`, `triggered_rules`: [`string`], `signal`: `signal_vocabulary`, `priority`: `LOW|MEDIUM|HIGH|CRITICAL`, `reason`: `string`, `requires_human_review`: `boolean`}}.
- Prima di rispondere verifica mentalmente che il blocco sia JSON sintatticamente valido: doppi apici, nessuna virgola finale e nessun valore NaN/Infinity.

REGOLE DI QUALITA
- Usa informazioni aggiornate al momento dell'analisi e riporta date e collegamenti delle fonti.
- Non inventare notizie, prezzi, livelli o fonti. Se un dato non e verificabile, dichiaralo.
- Non sostituire il ticker con societa dal nome simile e non analizzare titoli diversi da quelli elencati.
- Se la ricerca online non e disponibile, dichiaralo e limita esplicitamente il risultato alla lettura dei grafici.
- Se un grafico e poco leggibile o ambiguo, segnala il limite senza colmare le lacune con supposizioni.
- Mantieni separati dati osservati, interpretazioni e scenari probabilistici.
- Usa un linguaggio informativo e prudente: non fornire consulenza finanziaria personalizzata ne garanzie di rendimento.
"""


def build_pdf(tickers, output_path, period="3mo", days=65, chart_type="candlestick", portfolio=None):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=10, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name="Box", parent=styles["BodyText"], fontSize=8.5, leading=11, backColor=colors.whitesmoke, borderColor=colors.lightgrey, borderWidth=0.5, borderPadding=6))
    title_style = ParagraphStyle(name="TitleBlue", parent=styles["Title"], textColor=colors.HexColor("#0f5ea8"), fontSize=20, leading=24)
    h2 = ParagraphStyle(name="Heading2Blue", parent=styles["Heading2"], textColor=colors.HexColor("#0f5ea8"), fontSize=13, leading=16, spaceAfter=6)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=1.2 * cm,
        leftMargin=1.2 * cm,
        topMargin=1.0 * cm,
        bottomMargin=1.0 * cm,
        title="TradingWatchAgent - dossier news e grafici",
    )
    story = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    loaded = []
    for ticker in tickers:
        loaded.append(ticker)

    # Page 1 contains self-contained instructions so the PDF can be used directly as input.
    story.append(Paragraph("Istruzioni per l'analisi finanziaria", title_style))
    story.append(Paragraph(f"Generato: {now} - Grafici puliti da librerie Python: {period} / {days} sessioni - Tipo: {chart_type}", styles["Small"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(fix_text(prompt_text(tickers, period, days, chart_type, portfolio)).replace("\n", "<br/>"), styles["Box"]))
    story.append(PageBreak())

    total = len(loaded)
    chart_kinds = PORTFOLIO_CHART_KINDS if portfolio else CHART_KINDS
    for index, ticker in enumerate(loaded, start=1):
        print(json.dumps({"type": "progress", "ticker": ticker, "index": index, "total": total, "phase": "Generazione grafici prezzo e volume"}), flush=True)
        charts = ensure_clean_chart_bundle(ticker, period, days, chart_type, chart_kinds)
        for kind, label in chart_kinds:
            chart_block = [Paragraph(f"{ticker} - {label}", h2)]
            chart = charts.get(kind)
            if chart and chart.exists():
                max_height = 8.0 * cm if kind == "price_alligator" else 6.5 * cm
                chart_block.append(Image(str(chart), width=18.0 * cm, height=max_height, kind="proportional"))
            else:
                chart_block.append(Paragraph(f"Grafico {label} non trovato/generabile per questo ticker/periodo.", styles["Small"]))
            chart_block.append(Spacer(1, 0.2 * cm))
            story.append(KeepTogether(chart_block))
        if index < total:
            story.append(PageBreak())

    print(json.dumps({"type": "progress", "index": total, "total": total, "phase": "Composizione PDF"}), flush=True)
    doc.build(story)
    return output_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tickers", required=True, help="Comma-separated ticker list")
    parser.add_argument("--period", default="3mo")
    parser.add_argument("--days", type=int, default=65)
    parser.add_argument("--chart-type", default="candlestick")
    parser.add_argument("--output", default="")
    parser.add_argument("--portfolio-json", default="")
    args = parser.parse_args()
    tickers = normalize_tickers(args.tickers.split(","))
    if not tickers:
        raise SystemExit("No tickers provided")
    output = Path(args.output) if args.output else OUTPUT_DIR / f"analysis_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    portfolio = json.loads(args.portfolio_json) if args.portfolio_json else None
    build_pdf(tickers, output, args.period, args.days, args.chart_type, portfolio)
    print(json.dumps({"ok": True, "path": str(output.resolve()), "tickers": tickers}))


if __name__ == "__main__":
    main()
