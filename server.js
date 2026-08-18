const http = require('http');
const https = require('https');
const url = require('url');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadLocalEnv();

const PORT = 3001;
const PYTHON_PATH = "C:\\Users\\theoi\\AppData\\Local\\Microsoft\\WindowsApps\\PythonSoftwareFoundation.Python.3.10_qbz5n2kfra8p0\\python.exe";
const PDF_PYTHON_PATH = "C:\\Users\\theoi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CHATGPT_CHROME_PROFILE = path.join(__dirname, 'chrome_chatgpt_profile');
let activeScraperProcess = null;
const pdfExportJobs = new Map();

function chartOutputSuffix(period, days, chartType) {
  const safePeriod = String(period || '1y').replace(/[^A-Za-z0-9_-]+/g, '_');
  const safeType = String(chartType || 'candlestick').replace(/[^A-Za-z0-9_-]+/g, '_');
  return `${safePeriod}_${parseInt(days || 252, 10)}_${safeType}`;
}

function hasActiveScraperProcess() {
  return activeScraperProcess &&
    activeScraperProcess.exitCode === null &&
    activeScraperProcess.signalCode === null &&
    !activeScraperProcess.killed;
}

function formatExitCode(code) {
  if (code === null || code === undefined) return 'sconosciuto';
  return `${code} (0x${(code >>> 0).toString(16).toUpperCase()})`;
}

function describeScraperFailure(code, stderrText) {
  const normalizedCode = code >>> 0;
  const stderrDetails = stderrText && stderrText.trim()
    ? `\n\nDettagli stderr:\n${stderrText.trim()}`
    : '';

  if (normalizedCode === 0xC0000142) {
    return `Python/Playwright non si e' avviato correttamente: errore Windows STATUS_DLL_INIT_FAILED (${formatExitCode(code)}). Di solito e' un problema di inizializzazione DLL/runtime, profilo browser bloccato o processo Python/Chrome rimasto appeso, non un errore del ticker o della sessione ChatGPT.${stderrDetails}`;
  }

  if (code !== 0) {
    return `Lo scraper Playwright e' terminato con codice ${formatExitCode(code)} prima di produrre una risposta valida.${stderrDetails}`;
  }

  return `Nessuna risposta valida ricevuta da ChatGPT. Controlla che la sessione sia attiva.${stderrDetails}`;
}

function sendTelegramText(token, receiverId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: receiverId, text, parse_mode: 'HTML', disable_web_page_preview: true });
    const request = https.request({
      hostname: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, response => {
      let responseBody = '';
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        let payload = {};
        try { payload = JSON.parse(responseBody); } catch {}
        if (response.statusCode >= 200 && response.statusCode < 300 && payload.ok !== false) resolve(payload);
        else reject(new Error(payload.description || `Telegram HTTP ${response.statusCode}`));
      });
    });
    request.on('error', reject);
    request.setTimeout(15000, () => request.destroy(new Error('Timeout collegamento Telegram.')));
    request.end(body);
  });
}

function sendTelegramPhoto(token, receiverId, filePath, caption = '') {
  return new Promise((resolve, reject) => {
    const boundary = `----TradingWatch${Date.now().toString(16)}`;
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);
    const fields = [
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${receiverId}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`
    ].map(value => Buffer.from(value, 'utf8'));
    const closing = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([...fields, fileData, closing]);
    const request = https.request({
      hostname: 'api.telegram.org', path: `/bot${token}/sendPhoto`, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
    }, response => {
      let responseBody = '';
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        let payload = {};
        try { payload = JSON.parse(responseBody); } catch {}
        if (response.statusCode >= 200 && response.statusCode < 300 && payload.ok !== false) resolve(payload);
        else reject(new Error(payload.description || `Telegram photo HTTP ${response.statusCode}`));
      });
    });
    request.on('error', reject);
    request.setTimeout(30000, () => request.destroy(new Error('Timeout invio grafico Telegram.')));
    request.end(body);
  });
}

function escapeTelegramHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function waitForCdp(timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get('http://127.0.0.1:9222/json/version', { timeout: 1500 }, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => {
          try {
            const payload = JSON.parse(body);
            if (response.statusCode === 200 && payload.webSocketDebuggerUrl) return resolve(payload);
          } catch {}
          retry();
        });
      });
      request.on('timeout', () => request.destroy());
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('Chrome avviato ma CDP 127.0.0.1:9222 non disponibile entro 15 secondi. Chiudi eventuali istanze del profilo ChatGPT e riprova.'));
      setTimeout(probe, 500);
    };
    probe();
  });
}

function fetchTelegramYahooPrices(tickers) {
  return new Promise(resolve => {
    const script = `
import json, sys
import yfinance as yf
tickers = json.loads(sys.argv[1])
prices = {}
for ticker in tickers:
    try:
        history = yf.Ticker(ticker).history(period='5d', interval='1d', auto_adjust=False)
        closes = history['Close'].dropna()
        if not closes.empty:
            prices[ticker] = {'price': round(float(closes.iloc[-1]), 4), 'currency': 'EUR', 'source': 'Yahoo Finance'}
    except Exception:
        pass
print(json.dumps(prices))
`;
    const proc = spawn(PYTHON_PATH, ['-c', script, JSON.stringify(tickers)], { shell: false, cwd: __dirname });
    let output = '';
    proc.stdout.on('data', chunk => { output += chunk.toString(); });
    proc.on('error', () => resolve({}));
    proc.on('close', () => {
      try { resolve(JSON.parse(output.trim())); } catch { resolve({}); }
    });
  });
}

function formatTelegramStrategy(result, quote) {
  const technical = result.technical_analysis || {};
  const sentiment = result.sentiment_analysis || {};
  const assessment = result.operational_assessment || {};
  const target = result.analyst_target || {};
  const supports = Array.isArray(technical.supports) && technical.supports.length ? technical.supports.join(', ') : 'N/D';
  const resistances = Array.isArray(technical.resistances) && technical.resistances.length ? technical.resistances.join(', ') : 'N/D';
  const targetText = target.available ? `${target.target_price} ${target.currency} (${target.source}, ${target.as_of_date})` : 'Non disponibile';
  const currentPrice = quote?.price ? `${Number(quote.price).toLocaleString('it-IT', { maximumFractionDigits: 4 })} ${quote.currency || 'EUR'}` : 'Non disponibile';
  return [
    `📊 <b>${escapeTelegramHtml(result.ticker)} · ${escapeTelegramHtml(result.company || '')}</b>`,
    '',
    `💶 <b>Prezzo attuale:</b> ${escapeTelegramHtml(currentPrice)}`,
    `🧭 <b>Indicazione:</b> ${escapeTelegramHtml(assessment.action || 'N/D')}`,
    `⚡ <b>Priorità:</b> ${escapeTelegramHtml(assessment.priority || 'N/D')}`,
    `📰 <b>Sentiment:</b> ${escapeTelegramHtml(sentiment.overall_sentiment || 'N/D')}`,
    `📈 <b>Trend:</b> ${escapeTelegramHtml(technical.trend || 'N/D')}`,
    '',
    '<b>Livelli operativi</b>',
    `🟢 Supporti: ${escapeTelegramHtml(supports)}`,
    `🔴 Resistenze: ${escapeTelegramHtml(resistances)}`,
    `🚀 Trigger: ${escapeTelegramHtml(technical.breakout_trigger ?? 'N/D')}`,
    `🛑 Invalidazione: ${escapeTelegramHtml(technical.invalidation_level ?? 'N/D')}`,
    `🎯 Target analisti: ${escapeTelegramHtml(targetText)}`,
    '',
    '<b>Scenario</b>',
    escapeTelegramHtml(assessment.rationale || 'N/D'),
    '',
    '⚠️ <i>Indicazione informativa: verificare personalmente prima di operare.</i>'
  ].join('\n');
}

function formatTelegramEntrySummary(results) {
  const direct = results.filter(item => String(item.operational_assessment?.action || '').toUpperCase() === 'BUY_CANDIDATE');
  const conditional = results.filter(item => ['BREAKOUT_CANDIDATE', 'PULLBACK_CANDIDATE'].includes(String(item.operational_assessment?.action || '').toUpperCase()));
  if (direct.length) {
    return `✅ <b>Possibili candidati di ingresso:</b> ${direct.map(item => escapeTelegramHtml(item.ticker)).join(', ')}.${conditional.length ? `\n⏳ <b>Solo a condizione:</b> ${conditional.map(item => escapeTelegramHtml(item.ticker)).join(', ')}.` : ''}`;
  }
  if (conditional.length) {
    return `⏸ <b>Nessun ingresso immediato.</b>\n⏳ Candidati solo condizionati a conferma: ${conditional.map(item => escapeTelegramHtml(item.ticker)).join(', ')}.`;
  }
  return '⛔ <b>Nessun ingresso indicato dall’analisi corrente.</b> Mantenere i titoli in osservazione o evitarli secondo i dettagli successivi.';
}

function stripInvalidJsonControlChars(value) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const code = ch.charCodeAt(0);

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      result += ch;
      inString = !inString;
      continue;
    }

    if (inString && code >= 0 && code <= 0x1F) {
      result += ' ';
      continue;
    }

    result += ch;
  }

  return result;
}

function extractJsonObject(text) {
  const fenceMatch = String(text || '').match(/```json\s*([\s\S]*?)```/i);
  let jsonText = fenceMatch ? fenceMatch[1].trim() : '';
  if (!jsonText) {
    const start = String(text || '').indexOf('{');
    const end = String(text || '').lastIndexOf('}');
    if (start >= 0 && end > start) jsonText = String(text).slice(start, end + 1);
  }
  if (!jsonText) throw new Error('Nessun oggetto JSON trovato nella risposta ChatGPT.');
  try { return JSON.parse(jsonText); }
  catch (error) { return JSON.parse(stripInvalidJsonControlChars(jsonText)); }
}

// Helper to resolve company name
function getCompanyInfo(ticker) {
  const clean = ticker.trim().toUpperCase();
  const catalog = {
    "PST.MI": { company: "Poste Italiane", market: "Borsa Italiana" },
    "TEN.MI": { company: "Tenaris", market: "Borsa Italiana" },
    "PRY.MI": { company: "Prysmian", market: "Borsa Italiana" },
    "LDO.MI": { company: "Leonardo", market: "Borsa Italiana" },
    "MONC.MI": { company: "Moncler", market: "Borsa Italiana" },
    "DIA.MI": { company: "DiaSorin", market: "Borsa Italiana" },
    "CPR.MI": { company: "Campari", market: "Borsa Italiana" },
    "ENEL.MI": { company: "Enel", market: "Borsa Italiana" },
    "ENI.MI": { company: "Eni", market: "Borsa Italiana" },
    "SRG.MI": { company: "Snam", market: "Borsa Italiana" },
    "STMMI.MI": { company: "STMicroelectronics", market: "Borsa Italiana" },
    "STLAM.MI": { company: "Stellantis", market: "Borsa Italiana" },
    "BC.MI": { company: "Banca Generali", market: "Borsa Italiana" },
    "BAMI.MI": { company: "Banco BPM", market: "Borsa Italiana" },
    "ISP.MI": { company: "Intesa Sanpaolo", market: "Borsa Italiana" },
    "UCG.MI": { company: "UniCredit", market: "Borsa Italiana" },
    "G.MI": { company: "Assicurazioni Generali", market: "Borsa Italiana" },
    "LTMC.MI": { company: "Lottomatica Group S.p.A.", market: "Borsa Italiana" },
    "TIT.MI": { company: "Telecom Italia", market: "Borsa Italiana" },
    "RACE.MI": { company: "Ferrari", market: "Borsa Italiana" },
    "VOD.L": { company: "Vodafone", market: "London Stock Exchange" },
    "A2A.MI": { company: "A2A", market: "Borsa Italiana" },
    "AVIO.MI": { company: "Avio", market: "Borsa Italiana" },
    "TSLA": { company: "Tesla", market: "NASDAQ" },
    "AAPL": { company: "Apple", market: "NASDAQ" },
    "NVDA": { company: "NVIDIA", market: "NASDAQ" },
    "MSFT": { company: "Microsoft", market: "NASDAQ" },
    "AMZN": { company: "Amazon", market: "NASDAQ" },
    "GOOGL": { company: "Google", market: "NASDAQ" },
    "META": { company: "Meta Platforms", market: "NASDAQ" },
    "AMD.O": { company: "AMD", market: "NASDAQ" },
    "AMD": { company: "AMD", market: "NASDAQ" }
  };
  return catalog[clean] || { company: clean.split('.')[0], market: clean.endsWith(".MI") ? "Borsa Italiana" : clean.endsWith(".L") ? "London Stock Exchange" : "NASDAQ" };
}

// Extract JSON from ChatGPT response - no fragile regex, just JSON.parse
function parseReport(text, ticker, company) {
  // Try to extract JSON block from ```json ... ``` or raw JSON object
  let jsonStr = null;

  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    // Fallback: find first { ... } spanning the whole text
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      jsonStr = text.slice(start, end + 1);
    }
  }

  if (!jsonStr) {
    throw new Error('Nessun blocco JSON trovato nella risposta dell\'AI Agent. Risposta ricevuta:\n' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    try {
      parsed = JSON.parse(stripInvalidJsonControlChars(jsonStr));
    } catch (retryError) {
      throw new Error('JSON non valido nella risposta dell\'AI Agent: ' + retryError.message + '\n\nContenuto:\n' + jsonStr.slice(0, 500));
    }
  }

  // Always strictly override metadata with authoritative info
  const info = getCompanyInfo(ticker);
  parsed.search_metadata = parsed.search_metadata || {};
  parsed.search_metadata.ticker = ticker;
  parsed.search_metadata.company_name = info.company;
  parsed.search_metadata.market = info.market;
  parsed.search_metadata.timestamp_utc = new Date().toISOString();

  parsed.market_sentiment_summary = parsed.market_sentiment_summary || { overall_sentiment: 'Neutro', sentiment_score: 0.5, expected_impact: '', summary_explanation: '', news_highlights: [] };
  parsed.recent_news_last_3_days = parsed.recent_news_last_3_days || [];
  parsed.latest_available_news = parsed.latest_available_news || [];
  parsed.analyst_ratings_and_targets = parsed.analyst_ratings_and_targets || [];
  parsed.technical_levels = parsed.technical_levels || { supports: [], resistances: [], critical_levels_notes: '' };

  // Calculate upside potential vs current market price from Yahoo Finance
  const currentPrice = parsed.search_metadata.current_market_price;
  if (Array.isArray(parsed.analyst_ratings_and_targets)) {
    parsed.analyst_ratings_and_targets.forEach(item => {
      if (!item) return;
      const targetStr = String(item.target_price || '');
      const numMatch = targetStr.match(/([0-9]+(?:[\.,][0-9]+)?)/);
      if (numMatch && currentPrice && currentPrice > 0) {
        const targetNum = parseFloat(numMatch[1].replace(',', '.'));
        item.target_numeric = targetNum;
        item.current_price = currentPrice;
        const upsidePct = ((targetNum - currentPrice) / currentPrice) * 100;
        item.upside_percent = Math.round(upsidePct * 10) / 10;
        item.is_target_higher = targetNum > currentPrice;
      }
    });
  }

  // Sanity check: ensure response is not contaminated by previous company (e.g. Vodafone leaking into non-Vodafone ticker)
  const fullText = JSON.stringify(parsed).toLowerCase();
  if (ticker !== 'VOD.L' && (fullText.includes('vodafonethree') || fullText.includes('vodafone group'))) {
    throw new Error(`Risposta non pertinente: ChatGPT ha incluso dati relativi a Vodafone nell'analisi di ${info.company} (${ticker}). Riprova l'analisi.`);
  }

  return parsed;
}


// ── Server-Side File Cache Persistence ──────────────────────────────────────
const CACHE_DIR = path.join(__dirname, 'cache');
const TICKERS_DIR = path.join(CACHE_DIR, 'tickers');
const WATCHLISTS_FILE = path.join(CACHE_DIR, 'watchlists.json');
const ALL_TICKERS_FILE = path.join(CACHE_DIR, 'all_tickers.json');
const MIB30_TICKERS = [
  'A2A.MI', 'AMP.MI', 'AZM.MI', 'BMED.MI', 'BMPS.MI',
  'BAMI.MI', 'BPE.MI', 'BC.MI', 'CPR.MI', 'DIA.MI',
  'ENEL.MI', 'ENI.MI', 'ERG.MI', 'RACE.MI', 'FBK.MI',
  'G.MI', 'HER.MI', 'IP.MI', 'ISP.MI', 'INW.MI',
  'IG.MI', 'IVG.MI', 'LDO.MI', 'MB.MI', 'MONC.MI',
  'NEXI.MI', 'PIRC.MI', 'PST.MI', 'PRY.MI', 'REC.MI',
  'SPM.MI', 'SRG.MI', 'STLAM.MI', 'STMMI.MI', 'TIT.MI',
  'TEN.MI', 'TRN.MI', 'UCG.MI', 'UNI.MI', 'VOD.L'
];

function validateAutomationReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Output automazione non valido.');
  if (String(input.schema_version || '') !== '1.0') throw new Error('schema_version automazione non valida.');
  if (input.analysis_type !== 'FTSE_MIB_NEWS_TO_CHART_CANDIDATES') throw new Error('analysis_type automazione non valida.');
  if (!Array.isArray(input.candidates)) throw new Error('Il campo candidates deve essere un array.');
  const allowedTickers = new Set(MIB30_TICKERS);
  const seen = new Set();
  const candidates = input.candidates.slice(0, 12).map((candidate, index) => {
    const ticker = String(candidate?.ticker || '').trim().toUpperCase();
    if (!allowedTickers.has(ticker)) throw new Error(`Ticker candidato fuori universo FTSE MIB: ${ticker || `#${index + 1}`}.`);
    if (seen.has(ticker)) throw new Error(`Ticker candidato duplicato: ${ticker}.`);
    seen.add(ticker);
    const priority = String(candidate.priority || '').toUpperCase();
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(priority)) throw new Error(`${ticker}: priority non valida.`);
    return {
      rank: index + 1,
      ticker,
      company: String(candidate.company || getCompanyInfo(ticker).company),
      priority,
      news_signal: String(candidate.news_signal || 'NEUTRAL').toUpperCase(),
      news_summary: String(candidate.news_summary || ''),
      why_chart_needed: String(candidate.why_chart_needed || ''),
      questions_for_chart: Array.isArray(candidate.questions_for_chart) ? candidate.questions_for_chart.map(String).slice(0, 5) : [],
      suggested_timeframe: String(candidate.suggested_timeframe || '3m'),
      news: Array.isArray(candidate.news) ? candidate.news.slice(0, 5) : []
    };
  });
  return { ...input, schema_version: '1.0', analysis_type: 'FTSE_MIB_NEWS_TO_CHART_CANDIDATES', candidates, requires_human_review: true };
}

function validateAutomationStrategies(input, scoutReport) {
  if (!input || input.schema_version !== '1.0' || input.analysis_type !== 'FTSE_MIB_CANDIDATE_STRATEGIES') throw new Error('Contenitore strategie non valido.');
  if (!Array.isArray(input.results)) throw new Error('results deve essere un array.');
  const allowedTickers = new Set((scoutReport.candidates || []).map(item => item.ticker));
  const allowedActions = new Set(['WATCH', 'BUY_CANDIDATE', 'BREAKOUT_CANDIDATE', 'PULLBACK_CANDIDATE', 'AVOID', 'REVIEW']);
  const allowedPriorities = new Set(['HIGH', 'MEDIUM', 'LOW']);
  const expectedChartKinds = ['price_alligator', 'volume', 'oscillators', 'macd', 'adx'];
  const seen = new Set();
  const results = input.results.map((item, index) => {
    if (item?.error) throw new Error(`${item.ticker || `Candidato #${index + 1}`}: ${item.error}`);
    const ticker = String(item?.ticker || '').toUpperCase();
    if (!allowedTickers.has(ticker)) throw new Error(`Risultato per ticker non candidato: ${ticker}.`);
    if (seen.has(ticker)) throw new Error(`Risultato duplicato: ${ticker}.`);
    seen.add(ticker);
    if (item.schema_version !== '1.0' || item.analysis_type !== 'NEWS_AND_FIVE_CHARTS_STRATEGY') throw new Error(`${ticker}: schema analisi non valido.`);
    const charts = Array.isArray(item.input_evidence?.charts_attached) ? item.input_evidence.charts_attached.map(String) : [];
    if (expectedChartKinds.some(kind => !charts.some(name => name.includes(`_${kind}.png`)))) throw new Error(`${ticker}: non risultano allegati tutti i cinque grafici richiesti.`);
    const numericArray = (value, field) => {
      if (!Array.isArray(value)) throw new Error(`${ticker}: ${field} deve essere un array.`);
      const parsed = value.map(Number);
      if (parsed.some(number => !Number.isFinite(number) || number <= 0)) throw new Error(`${ticker}: ${field} contiene livelli non numerici.`);
      return parsed;
    };
    const technical = item.technical_analysis || {};
    const supports = numericArray(technical.supports || [], 'supports');
    const resistances = numericArray(technical.resistances || [], 'resistances');
    const numericOrNull = (value, field) => {
      if (value === null || value === undefined || value === '') return null;
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) throw new Error(`${ticker}: ${field} non numerico.`);
      return number;
    };
    const target = item.analyst_target || {};
    let normalizedTarget = { available: false, target_price: null, currency: null, source: null, source_url: null, as_of_date: null };
    if (target.available === true) {
      const targetPrice = numericOrNull(target.target_price, 'analyst_target.target_price');
      if (!targetPrice || !target.currency || !target.source || !/^https?:\/\//i.test(String(target.source_url || '')) || !target.as_of_date) throw new Error(`${ticker}: target analisti privo di prezzo, valuta, fonte, URL o data verificabile.`);
      normalizedTarget = { available: true, target_price: targetPrice, currency: String(target.currency), source: String(target.source), source_url: String(target.source_url), as_of_date: String(target.as_of_date) };
    }
    const assessment = item.operational_assessment || {};
    const action = String(assessment.action || '').toUpperCase();
    const priority = String(assessment.priority || '').toUpperCase();
    if (!allowedActions.has(action) || !allowedPriorities.has(priority)) throw new Error(`${ticker}: indicazione operativa o priorita non valida.`);
    return {
      ...item,
      ticker,
      technical_analysis: { ...technical, supports, resistances, breakout_trigger: numericOrNull(technical.breakout_trigger, 'breakout_trigger'), invalidation_level: numericOrNull(technical.invalidation_level, 'invalidation_level') },
      analyst_target: normalizedTarget,
      operational_assessment: { ...assessment, action, priority, requires_human_review: true }
    };
  });
  if (results.length !== allowedTickers.size) throw new Error(`Risultati incompleti: attesi ${allowedTickers.size}, ricevuti ${results.length}.`);
  return { ...input, results, requires_human_review: true };
}

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(TICKERS_DIR)) fs.mkdirSync(TICKERS_DIR, { recursive: true });

function saveTickerAnalysis(ticker, data) {
  try {
    const t = ticker.toUpperCase();
    const filePath = path.join(TICKERS_DIR, `${t}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    let all = {};
    if (fs.existsSync(ALL_TICKERS_FILE)) {
      try { all = JSON.parse(fs.readFileSync(ALL_TICKERS_FILE, 'utf8')); } catch (e) {}
    }
    all[t] = data;
    fs.writeFileSync(ALL_TICKERS_FILE, JSON.stringify(all, null, 2), 'utf8');
  } catch (e) {
    console.error(`Errore salvataggio cache per ${ticker}:`, e);
  }
}

function loadAllTickerAnalyses() {
  const result = {};
  if (fs.existsSync(ALL_TICKERS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(ALL_TICKERS_FILE, 'utf8'));
    } catch (e) {}
  }
  if (fs.existsSync(TICKERS_DIR)) {
    const files = fs.readdirSync(TICKERS_DIR);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(TICKERS_DIR, file), 'utf8');
          const parsed = JSON.parse(content);
          const t = file.replace('.json', '').toUpperCase();
          result[t] = parsed;
        } catch (e) {}
      }
    });
  }
  return result;
}

function normalizeWatchlists(data) {
  const normalized = data && typeof data === 'object' ? { ...data } : {};
  normalized.MIB30 = MIB30_TICKERS;
  return normalized;
}

function saveWatchlists(data) {
  try {
    fs.writeFileSync(WATCHLISTS_FILE, JSON.stringify(normalizeWatchlists(data), null, 2), 'utf8');
  } catch (e) {}
}

function loadWatchlists() {
  if (fs.existsSync(WATCHLISTS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(WATCHLISTS_FILE, 'utf8'));
      const normalized = normalizeWatchlists(parsed);
      if (!parsed.MIB30 || parsed.MIB30.length !== MIB30_TICKERS.length) {
        saveWatchlists(normalized);
      }
      return normalized;
    } catch (e) {}
  }
  return normalizeWatchlists(null);
}


// Create HTTP server
const server = http.createServer((req, meRes) => {
  const parsedUrl = url.parse(req.url, true);

  // Set CORS headers for all requests
  if (req.method === 'OPTIONS') {
    meRes.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    meRes.end();
    return;
  }

  // API: Get all server-persisted data (analyses & watchlists)
  if (parsedUrl.pathname === '/api/all-data' && req.method === 'GET') {
    meRes.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    const analyses = loadAllTickerAnalyses();
    const watchlists = loadWatchlists();
    meRes.end(JSON.stringify({ tickerData: analyses, watchlists: watchlists }));
    return;
  }

  // API: Save watchlists to server disk
  if (parsedUrl.pathname === '/api/save-watchlists' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        saveWatchlists(parsed);
        meRes.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        meRes.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        meRes.writeHead(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        meRes.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (parsedUrl.pathname === '/api/automation/state' && req.method === 'GET') {
    const readJsonIfPresent = fileName => {
      const filePath = path.join(CACHE_DIR, fileName);
      if (!fs.existsSync(filePath)) return null;
      try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
    };
    meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    meRes.end(JSON.stringify({
      report: readJsonIfPresent('ftse_mib_news_scout.json'),
      strategies: readJsonIfPresent('ftse_mib_candidate_strategies.json')
    }));
    return;
  }

  // API: fresh portfolio quotes fetched only from Yahoo Finance.
  if (parsedUrl.pathname === '/api/portfolio-prices' && req.method === 'GET') {
    const tickers = String(parsedUrl.query.tickers || '')
      .split(',')
      .map(item => item.trim().toUpperCase())
      .filter((item, index, values) => item && values.indexOf(item) === index)
      .slice(0, 100);
    if (!tickers.length) {
      meRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: 'Nessun ticker richiesto.' }));
      return;
    }

    const pythonCmd = `
import json
import sys
from datetime import datetime, timezone
import yfinance as yf

tickers = json.loads(sys.argv[1])
prices = {}
errors = {}
for ticker in tickers:
    try:
        instrument = yf.Ticker(ticker)
        price = None
        previous_close = None
        method = None
        market_timestamp = None
        try:
            price = instrument.fast_info.get('lastPrice')
            previous_close = instrument.fast_info.get('previousClose')
            if price is not None:
                method = 'fast_info.lastPrice'
        except Exception:
            pass
        if price is None:
            history = instrument.history(period='1d', interval='1m', actions=False, auto_adjust=False)
            if history.empty:
                history = instrument.history(period='5d', interval='1d', actions=False, auto_adjust=False)
                method = 'history.daily.Close'
            else:
                method = 'history.1m.Close'
            if not history.empty:
                price = float(history['Close'].dropna().iloc[-1])
                market_timestamp = history.index[-1].isoformat()
                if previous_close is None and len(history['Close'].dropna()) >= 2:
                    previous_close = float(history['Close'].dropna().iloc[-2])
        if price is None:
            raise ValueError('Prezzo Yahoo Finance non disponibile')
        daily_change_pct = None
        if previous_close is not None and float(previous_close) > 0:
            daily_change_pct = ((float(price) - float(previous_close)) / float(previous_close)) * 100
        prices[ticker] = {
            'price': round(float(price), 4),
            'previous_close': round(float(previous_close), 4) if previous_close is not None else None,
            'daily_change_pct': round(float(daily_change_pct), 2) if daily_change_pct is not None else None,
            'source': 'Yahoo Finance',
            'method': method,
            'market_timestamp': market_timestamp,
            'retrieved_at': datetime.now(timezone.utc).isoformat()
        }
    except Exception as exc:
        errors[ticker] = str(exc)

print(json.dumps({'prices': prices, 'errors': errors, 'source': 'Yahoo Finance'}))
    `;
    const pyProc = spawn(PYTHON_PATH, ['-c', pythonCmd, JSON.stringify(tickers)], { shell: false, cwd: __dirname });
    let output = '';
    let errorOutput = '';
    pyProc.stdout.on('data', chunk => { output += chunk.toString(); });
    pyProc.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
    pyProc.on('error', error => {
      if (meRes.writableEnded) return;
      meRes.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: error.message }));
    });
    pyProc.on('close', code => {
      if (meRes.writableEnded) return;
      try {
        const data = JSON.parse(output.trim());
        meRes.writeHead(code === 0 ? 200 : 502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        meRes.end(JSON.stringify(data));
      } catch (error) {
        meRes.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        meRes.end(JSON.stringify({ error: 'Risposta Yahoo Finance non valida.', details: errorOutput.trim() || output.trim() }));
      }
    });
    return;
  }

  if (parsedUrl.pathname === '/api/export-pdf/status' && req.method === 'GET') {
    const job = pdfExportJobs.get(String(parsedUrl.query.job_id || ''));
    if (!job) {
      meRes.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: 'Esportazione PDF non trovata.' }));
      return;
    }
    meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    meRes.end(JSON.stringify({ ...job, outputPath: undefined }));
    return;
  }

  if (parsedUrl.pathname === '/api/export-pdf/download' && req.method === 'GET') {
    const job = pdfExportJobs.get(String(parsedUrl.query.job_id || ''));
    if (!job || job.status !== 'completed' || !fs.existsSync(job.outputPath)) {
      meRes.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: 'Il PDF non e ancora disponibile.' }));
      return;
    }
    meRes.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${path.basename(job.outputPath)}"`,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(job.outputPath).pipe(meRes);
    return;
  }

  // API: Export selected tickers/watchlist to a PDF dossier with prompt + charts
  if (parsedUrl.pathname === '/api/export-pdf' && (req.method === 'GET' || req.method === 'POST')) {
    const handleExportPdf = (inputParams) => {
      const watchlists = loadWatchlists();
      const watchlistName = inputParams.watchlist || '';
      const explicitTickers = inputParams.tickers || '';
      const requestedLimit = parseInt(inputParams.limit || '80', 10);
      const period = inputParams.period || '3mo';
      const days = parseInt(inputParams.days || '65', 10);
      const chartType = inputParams.chart_type || 'candlestick';
      let portfolio = null;
      if (inputParams.portfolio) {
        portfolio = inputParams.portfolio;
      } else if (inputParams.portfolio_json) {
        try {
          portfolio = typeof inputParams.portfolio_json === 'string' ? JSON.parse(inputParams.portfolio_json) : inputParams.portfolio_json;
        } catch (e) {
          meRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          meRes.end(JSON.stringify({ error: 'Dati portafoglio JSON non validi.' }));
          return;
        }
      }
      let tickers = [];

      if (Array.isArray(explicitTickers)) {
        tickers = explicitTickers.map(t => String(t).trim().toUpperCase()).filter(Boolean);
      } else if (explicitTickers) {
        tickers = String(explicitTickers).split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
      } else if (watchlistName && Array.isArray(watchlists[watchlistName])) {
        tickers = watchlists[watchlistName].map(t => String(t).trim().toUpperCase()).filter(Boolean);
      } else if (Array.isArray(watchlists.MIB30)) {
        tickers = watchlists.MIB30;
      }

      const exportLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 80)) : 80;
      tickers = [...new Set(tickers)].slice(0, exportLimit);
      if (!tickers.length) {
        meRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        meRes.end(JSON.stringify({ error: 'Nessun ticker disponibile per export PDF.' }));
        return;
      }

      const outputDir = path.join(__dirname, 'output', 'pdf');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const safeName = String(portfolio ? 'portafoglio' : (watchlistName || 'tickers')).replace(/[^A-Za-z0-9_-]+/g, '_') || 'tickers';
      const outputPath = path.join(outputDir, `analysis_export_${safeName}_${Date.now()}.pdf`);
      const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const args = [
        path.join(__dirname, 'export_analysis_pdf.py'),
        '--tickers', tickers.join(','),
        '--period', period,
        '--days', String(days),
        '--chart-type', chartType,
        '--output', outputPath
      ];
      if (portfolio) args.push('--portfolio-json', JSON.stringify(portfolio));
      const pyProc = spawn(PDF_PYTHON_PATH, args, { shell: false, cwd: __dirname });
      let stdout = '';
      let stderr = '';
      pdfExportJobs.set(jobId, { status: 'running', percent: 2, phase: 'Avvio esportazione', ticker: '', outputPath });
      pyProc.stdout.on('data', chunk => {
        stdout += chunk.toString();
        for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'progress') {
              const percent = event.phase === 'Composizione PDF'
                ? 92
                : Math.max(5, Math.round(((event.index - 1) / Math.max(event.total, 1)) * 85) + 5);
              pdfExportJobs.set(jobId, { ...pdfExportJobs.get(jobId), percent, phase: event.phase, ticker: event.ticker || '' });
            }
          } catch (e) {}
        }
      });
      pyProc.stderr.on('data', chunk => { stderr += chunk.toString(); });
      pyProc.on('error', (error) => {
        pdfExportJobs.set(jobId, {
          ...pdfExportJobs.get(jobId),
          status: 'failed',
          percent: 0,
          phase: 'Impossibile avviare il generatore PDF',
          error: error.message
        });
      });
      pyProc.on('close', (code) => {
        if (pdfExportJobs.get(jobId)?.status === 'failed') return;
        if (code !== 0 || !fs.existsSync(outputPath)) {
          pdfExportJobs.set(jobId, { ...pdfExportJobs.get(jobId), status: 'failed', percent: 0, phase: 'Esportazione fallita', error: stderr.trim() || stdout.trim() });
          return;
        }
        pdfExportJobs.set(jobId, { ...pdfExportJobs.get(jobId), status: 'completed', percent: 100, phase: 'PDF pronto', ticker: '' });
      });
      meRes.writeHead(202, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ jobId }));
    };

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          handleExportPdf(parsed);
        } catch (e) {
          meRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          meRes.end(JSON.stringify({ error: 'Body JSON non valido.' }));
        }
      });
    } else {
      handleExportPdf(parsedUrl.query || {});
    }
    return;
  }

  // Serve generated PNG charts
  if (parsedUrl.pathname.startsWith('/finance_charts/') && req.method === 'GET') {
    const filename = path.basename(parsedUrl.pathname);
    const filePath = path.join(__dirname, 'finance_charts', filename);
    if (fs.existsSync(filePath)) {
      meRes.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(filePath).pipe(meRes);
      return;
    } else {
      meRes.writeHead(404, { 'Content-Type': 'text/plain' });
      meRes.end('Image Not Found');
      return;
    }
  }

  if (parsedUrl.pathname === '/api/chart-history' && req.method === 'GET') {
    const ticker = parsedUrl.query.ticker || 'VOD.L';
    const period = parsedUrl.query.period || '1y';
    const days = parseInt(parsedUrl.query.days || '252');
    const chartType = parsedUrl.query.chart_type || 'candlestick';
    const outputSuffix = chartOutputSuffix(period, days, chartType);
    let extraLevels = [];
    try {
      const requestedLevels = JSON.parse(String(parsedUrl.query.levels || '[]'));
      if (Array.isArray(requestedLevels)) {
        extraLevels = requestedLevels.slice(0, 12).filter(level =>
          level && Number.isFinite(Number(level.value)) && Number(level.value) > 0 &&
          ['support', 'resistance', 'trigger', 'invalidation', 'target'].includes(String(level.type))
        ).map(level => ({ value: Number(level.value), type: String(level.type), label: String(level.label || '').slice(0, 48) }));
      }
    } catch (error) {}

    const pythonCmd = `
import json
from finance_charts.technical_charts import create_chart_bundle, download_history
try:
    create_chart_bundle('${ticker}', 'finance_charts', period='${period}', days=${days}, chart_type='${chartType}', output_suffix='${outputSuffix}', extra_levels=${JSON.stringify(extraLevels)}, show_auto_levels=${extraLevels.length ? 'False' : 'True'})
except Exception:
    pass

df_full = download_history('${ticker}', period='${period}')
metrics = {}
if len(df_full) > 0:
    latest_c = float(df_full['Close'].iloc[-1])
    c_1d = float(df_full['Close'].iloc[-2]) if len(df_full) >= 2 else latest_c
    c_5d = float(df_full['Close'].iloc[-6]) if len(df_full) >= 6 else latest_c
    c_10d = float(df_full['Close'].iloc[-11]) if len(df_full) >= 11 else latest_c
    c_30d = float(df_full['Close'].iloc[-22]) if len(df_full) >= 22 else latest_c
    c_180d = float(df_full['Close'].iloc[-126]) if len(df_full) >= 126 else float(df_full['Close'].iloc[0])

    metrics = {
        'close': round(latest_c, 2),
        'var_1d': round(((latest_c - c_1d) / c_1d) * 100, 2),
        'var_5d': round(((latest_c - c_5d) / c_5d) * 100, 2),
        'var_10d': round(((latest_c - c_10d) / c_10d) * 100, 2),
        'var_30d': round(((latest_c - c_30d) / c_30d) * 100, 2),
        'var_180d': round(((latest_c - c_180d) / c_180d) * 100, 2)
    }

df = df_full.tail(${days})
bars = []
for date, row in df.iterrows():
    bars.append({
        'date': str(date.date()),
        'open': round(float(row['Open']), 2),
        'high': round(float(row['High']), 2),
        'low': round(float(row['Low']), 2),
        'close': round(float(row['Close']), 2),
        'volume': int(row['Volume'])
    })
for i in range(len(bars)):
    if i > 0:
        prev = bars[i-1]['close']
        curr = bars[i]['close']
        bars[i]['change_pct'] = round(((curr - prev) / prev) * 100, 2)
    else:
        bars[i]['change_pct'] = 0.0

print(json.dumps({'bars': bars, 'metrics': metrics}))
    `;

    const pyProc = spawn(PYTHON_PATH, ['-c', pythonCmd], { shell: false });
    let output = '';
    let errorOutput = '';
    pyProc.stdout.on('data', chunk => { output += chunk.toString(); });
    pyProc.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
    pyProc.on('close', () => {
      meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      try {
        const raw = output.trim();
        const jsonStart = raw.indexOf('{');
        const jsonEnd = raw.lastIndexOf('}');
        const jsonText = jsonStart >= 0 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;
        const data = JSON.parse(jsonText);
        meRes.end(JSON.stringify(data));
      } catch (e) {
        meRes.end(JSON.stringify({
          bars: [],
          metrics: {},
          error: e.message,
          stderr: errorOutput.trim(),
          raw: output.trim().slice(0, 500)
        }));
      }
    });
    return;
  }

  if (parsedUrl.pathname === '/api/automation/open-chatgpt-browser' && req.method === 'POST') {
    (async () => { try {
      try {
        const existing = await waitForCdp(1000);
        meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        meRes.end(JSON.stringify({ status: 'ready', cdp: 'http://127.0.0.1:9222', websocket: existing.webSocketDebuggerUrl, profile: 'chrome_chatgpt_profile' }));
        return;
      } catch {}
      const chrome = spawn(CHROME_PATH, [
        '--remote-debugging-port=9222',
        '--remote-debugging-address=127.0.0.1',
        `--user-data-dir=${CHATGPT_CHROME_PROFILE}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window',
        '--start-maximized',
        'https://chatgpt.com/'
      ], { detached: true, stdio: 'ignore', windowsHide: false });
      chrome.unref();
      const cdp = await waitForCdp(15000);
      meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ status: 'ready', cdp: 'http://127.0.0.1:9222', websocket: cdp.webSocketDebuggerUrl, profile: 'chrome_chatgpt_profile' }));
    } catch (error) {
      meRes.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: error.message }));
    } })();
    return;
  }

  if (parsedUrl.pathname === '/api/automation/send-strategies-telegram' && req.method === 'POST') {
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN_CH1;
    const receiverId = process.env.TELEGRAM_RECEIVER_ID;
    if (!token || !receiverId) {
      meRes.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: 'Configurazione Telegram assente nel file .env.' }));
      return;
    }
    const strategiesPath = path.join(CACHE_DIR, 'ftse_mib_candidate_strategies.json');
    const scoutPath = path.join(CACHE_DIR, 'ftse_mib_news_scout.json');
    try {
      if (!fs.existsSync(strategiesPath) || !fs.existsSync(scoutPath)) throw new Error('Nessuna analisi grafica validata disponibile.');
      const scout = validateAutomationReport(JSON.parse(fs.readFileSync(scoutPath, 'utf8')));
      const report = validateAutomationStrategies(JSON.parse(fs.readFileSync(strategiesPath, 'utf8')), scout);
      (async () => {
        try {
          const prices = await fetchTelegramYahooPrices(report.results.map(item => item.ticker));
          const messages = [
            `📣 <b>FTSE MIB · Analisi news e grafici</b>\n📋 <b>${report.results.length} titoli · 5 grafici per ciascuno</b>\n\n<b>ESITO INGRESSI</b>\n${formatTelegramEntrySummary(report.results)}\n\n🕒 Generata: ${escapeTelegramHtml(report.generated_at)}\n⚠️ <i>Indicazione informativa: verificare personalmente prima di operare.</i>`,
            ...report.results.map(result => formatTelegramStrategy(result, prices[result.ticker]))
          ];
          if (String(parsedUrl.query.dry_run || '') === '1') {
            meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            meRes.end(JSON.stringify({ status: 'ready', messages: messages.length, recipients: 1, prices_found: Object.keys(prices).length }));
            return;
          }
          for (const message of messages) await sendTelegramText(token, receiverId, message.slice(0, 4000));
          meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          meRes.end(JSON.stringify({ status: 'sent', messages: messages.length, recipients: 1 }));
        } catch (error) {
          meRes.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          meRes.end(JSON.stringify({ error: `Invio Telegram fallito: ${error.message}` }));
        }
      })();
    } catch (error) {
      meRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  if (parsedUrl.pathname === '/api/watchlist/send-analysis-telegram' && req.method === 'POST') {
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN_CH1;
    const receiverId = process.env.TELEGRAM_RECEIVER_ID;
    if (!token || !receiverId) {
      meRes.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      meRes.end(JSON.stringify({ error: 'Configurazione Telegram assente nel file .env.' }));
      return;
    }
    let requestBody = '';
    req.on('data', chunk => { if (requestBody.length < 100000) requestBody += chunk.toString(); });
    req.on('end', async () => {
      try {
        const input = JSON.parse(requestBody || '{}');
        const listName = String(input.watchlist_name || 'Watchlist').slice(0, 80);
        const tickers = Array.isArray(input.tickers) ? [...new Set(input.tickers.map(value => String(value).trim().toUpperCase()).filter(Boolean))].slice(0, 50) : [];
        const period = String(input.period || '3mo').replace(/[^A-Za-z0-9_-]+/g, '_');
        const days = Math.max(1, Math.min(1000, parseInt(input.days || 65, 10)));
        const chartType = String(input.chart_type || 'candlestick').replace(/[^A-Za-z0-9_-]+/g, '_');
        const chartSuffix = chartOutputSuffix(period, days, chartType);
        if (!tickers.length) throw new Error('La watchlist non contiene titoli.');
        const analyses = fs.existsSync(ALL_TICKERS_FILE) ? JSON.parse(fs.readFileSync(ALL_TICKERS_FILE, 'utf8')) : {};
        const available = tickers.filter(ticker => analyses[ticker]);
        const messages = [`📣 <b>${escapeTelegramHtml(listName)} · News e grafici aggiornati</b>\n📊 <b>${available.length}/${tickers.length} analisi disponibili</b>\n\nI cinque grafici tecnici sono stati rigenerati per la watchlist. Seguono gli esiti delle analisi news per titolo.\n\n⚠️ <i>Contenuto informativo: verificare personalmente dati e grafici prima di operare.</i>`];
        for (const ticker of available) {
          const item = analyses[ticker] || {};
          const chartItem = analyses[`${ticker}_CHART`] || {};
          const meta = item.search_metadata || {};
          const sentiment = item.market_sentiment_summary || {};
          const levels = item.technical_levels || {};
          const chartTechnical = chartItem.chart_technical_analysis || chartItem.chart_vision_analysis || chartItem.technical_analysis || {};
          const supports = Array.isArray(levels.supports) ? levels.supports.join(', ') : 'N/D';
          const resistances = Array.isArray(levels.resistances) ? levels.resistances.join(', ') : 'N/D';
          const chartSupports = Array.isArray(chartTechnical.chart_supports) ? chartTechnical.chart_supports.join(', ') : supports;
          const chartResistances = Array.isArray(chartTechnical.chart_resistances) ? chartTechnical.chart_resistances.join(', ') : resistances;
          const price = Number(meta.current_market_price);
          messages.push(`<b>${escapeTelegramHtml(ticker)} · ${escapeTelegramHtml(meta.company_name || ticker)}</b>\n💶 Prezzo analisi: <b>${Number.isFinite(price) ? price.toFixed(2) : 'N/D'}</b>\n\n📰 <b>NEWS</b>\n🧭 Sentiment: <b>${escapeTelegramHtml(sentiment.overall_sentiment || 'N/D')}</b>${Number.isFinite(Number(sentiment.sentiment_score)) ? ` · score ${Number(sentiment.sentiment_score).toFixed(2)}` : ''}\n📈 Impatto atteso: ${escapeTelegramHtml(sentiment.expected_impact || 'N/D')}\n${escapeTelegramHtml(sentiment.summary_explanation || 'Sintesi news non disponibile.')}\n\n📊 <b>ANALISI GRAFICA</b>\nTrend: <b>${escapeTelegramHtml(chartTechnical.overall_trend || chartTechnical.trend || 'N/D')}</b>\n🟢 Supporti: ${escapeTelegramHtml(chartSupports)}\n🔴 Resistenze: ${escapeTelegramHtml(chartResistances)}\n${escapeTelegramHtml(chartTechnical.key_scenario || 'Scenario grafico non disponibile.')}\n\n🎯 <b>SUMMARY COMBINATO</b>\n${escapeTelegramHtml(chartTechnical.operational_note || `${sentiment.expected_impact || 'News senza impatto conclusivo'}; verificare conferme o invalidazioni sul grafico.`)}`.slice(0, 4000));
        }
        const missing = tickers.filter(ticker => !analyses[ticker]);
        if (missing.length) messages.push(`⚠️ <b>Analisi non disponibili</b>\n${escapeTelegramHtml(missing.join(', '))}`);
        await sendTelegramText(token, receiverId, messages[0]);
        for (let index = 0; index < available.length; index++) {
          const ticker = available[index];
          const safeTicker = ticker.replaceAll('/', '_');
          const chartPath = path.join(__dirname, 'finance_charts', `${safeTicker}_${chartSuffix}_price_alligator.png`);
          if (!fs.existsSync(chartPath)) throw new Error(`Grafico Price & Levels non trovato per ${ticker}.`);
          await sendTelegramText(token, receiverId, messages[index + 1]);
          await sendTelegramPhoto(token, receiverId, chartPath, `📊 <b>${escapeTelegramHtml(ticker)} · Price & Levels</b>\n${escapeTelegramHtml(period)} · ${days} sessioni`);
        }
        for (const message of messages.slice(available.length + 1)) await sendTelegramText(token, receiverId, message);
        meRes.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        meRes.end(JSON.stringify({ status: 'sent', messages: messages.length + available.length, charts: available.length, analyzed: available.length, total: tickers.length }));
      } catch (error) {
        meRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        meRes.end(JSON.stringify({ error: `Invio Telegram watchlist fallito: ${error.message}` }));
      }
    });
    return;
  }

  if (parsedUrl.pathname === '/api/automation/ftse-mib-chart-strategies' && req.method === 'GET') {
    const res = meRes;
    const scoutPath = path.join(CACHE_DIR, 'ftse_mib_news_scout.json');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    if (!fs.existsSync(scoutPath)) {
      res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Esegui prima lo scouting news FTSE MIB.' })}\n\n`);
      res.end();
      return;
    }
    if (hasActiveScraperProcess()) {
      res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Un altro processo Playwright e gia in esecuzione.' })}\n\n`);
      res.end();
      return;
    }
    let scoutReport;
    try { scoutReport = validateAutomationReport(JSON.parse(fs.readFileSync(scoutPath, 'utf8'))); }
    catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', msg: `Report scouting non valido: ${error.message}` })}\n\n`);
      res.end();
      return;
    }
    const limit = Math.max(1, Math.min(parseInt(parsedUrl.query.limit || scoutReport.candidates.length, 10), scoutReport.candidates.length));
    const period = String(parsedUrl.query.period || '3mo');
    const days = Math.max(22, Math.min(parseInt(parsedUrl.query.days || '65', 10), 504));
    const chartType = parsedUrl.query.chart_type === 'line' ? 'line' : 'candlestick';
    res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Chart Strategy Orchestrator', msg: `Genero cinque grafici e analizzo ${limit} candidati via ChatGPT.` })}\n\n`);
    const args = ['-u', path.join(__dirname, 'chatgpt_playwright_demo.py'), '--automation-chart-batch', scoutPath, '--automation-limit', String(limit), '--period', period, '--days', String(days), '--chart-type', chartType, '--require-cdp', '--no-telegram'];
    const process = spawn(PYTHON_PATH, args, { shell: false, cwd: __dirname });
    activeScraperProcess = process;
    let stdout = '';
    let stderr = '';
    let ended = false;
    // IncomingMessage `close` may fire once the request body has completed,
    // while the SSE response is still streaming. Only cancel Playwright when
    // the client actually closes the response stream.
    res.on('close', () => { if (!ended && process && !process.killed) process.kill(); if (activeScraperProcess === process) activeScraperProcess = null; });
    process.stdout.on('data', chunk => {
      const text = chunk.toString(); stdout += text;
      text.split(/\r?\n/).filter(Boolean).forEach(line => res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright / Chart Strategy', msg: line.trim() })}\n\n`));
    });
    process.stderr.on('data', chunk => {
      stderr += chunk.toString();
      chunk.toString().split(/\r?\n/).filter(Boolean).forEach(line => res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright (stderr)', msg: line.trim() })}\n\n`));
    });
    process.on('error', error => { if (ended) return; ended = true; if (activeScraperProcess === process) activeScraperProcess = null; res.write(`data: ${JSON.stringify({ type: 'error', msg: error.message })}\n\n`); res.end(); });
    process.on('close', code => {
      if (activeScraperProcess === process) activeScraperProcess = null;
      if (ended) return;
      try {
        const marker = '--- Risposta Automazione Grafici ---';
        if (!stdout.includes(marker)) throw new Error(describeScraperFailure(code, stderr));
        const aggregateText = stdout.split(marker).slice(1).join(marker).trim();
        const report = validateAutomationStrategies(extractJsonObject(aggregateText), { ...scoutReport, candidates: scoutReport.candidates.slice(0, limit) });
        fs.writeFileSync(path.join(CACHE_DIR, 'ftse_mib_candidate_strategies.json'), JSON.stringify(report, null, 2), 'utf8');
        res.write(`data: ${JSON.stringify({ type: 'data', data: report })}\n\n`);
      } catch (error) {
        res.write(`data: ${JSON.stringify({ type: 'error', msg: `Analisi grafica non valida: ${error.message}` })}\n\n`);
      }
      ended = true;
      res.end();
    });
    return;
  }

  if (parsedUrl.pathname === '/api/automation/ftse-mib-news-scout' && req.method === 'GET') {
    const res = meRes;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    if (hasActiveScraperProcess()) {
      res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Un altro processo Playwright e gia in esecuzione.' })}\n\n`);
      res.end();
      return;
    }

    const universe = MIB30_TICKERS.join(', ');
    const prompt = `Agisci come News Scout finanziario prudente. Cerca sul web le notizie piu recenti e rilevanti per i titoli dell'universo FTSE MIB seguente: ${universe}.

Obiettivo: non definire ancora una strategia tecnica. Seleziona soltanto da 3 a 8 titoli per cui le news rendono utile richiedere un grafico tecnico prima di decidere una strategia. Privilegia eventi recenti, verificabili e potenzialmente price-sensitive. Non selezionare un titolo senza una motivazione news concreta.

Rispondi SOLO con JSON puro valido, senza markdown o testo esterno. Usa esattamente questi campi radice: schema_version, analysis_type, generated_at, universe, selection_criteria, candidates, excluded_summary, requires_human_review.

Vincoli:
- schema_version deve essere "1.0".
- analysis_type deve essere "FTSE_MIB_NEWS_TO_CHART_CANDIDATES".
- universe deve contenere name="FTSE MIB" e tickers_reviewed come array dei ticker effettivamente considerati.
- candidates deve essere un array ordinato per priorita. Ogni voce deve contenere esattamente: rank, ticker, company, priority, news_signal, news_summary, why_chart_needed, questions_for_chart, suggested_timeframe, news.
- priority: HIGH, MEDIUM o LOW. news_signal: POSITIVE, NEGATIVE, MIXED o UNCERTAIN. suggested_timeframe: 3m, 6m o 1y.
- questions_for_chart deve contenere 1-5 domande tecniche concrete che il grafico dovra chiarire.
- news deve contenere fino a 5 oggetti con headline, published_at, source, source_url, sentiment, impact_rating. Non inventare fonti, URL o date.
- excluded_summary deve essere una stringa breve che spiega perche gli altri titoli non richiedono ora un grafico.
- requires_human_review deve essere true.
- Anche se trovi poche notizie, non cambiare schema e non aggiungere campi radice.`;

    res.write(`data: ${JSON.stringify({ type: 'log', agent: 'FTSE MIB News Scout', msg: `Avvio scouting news su ${MIB30_TICKERS.length} ticker.` })}\n\n`);
    const args = ['-u', path.join(__dirname, 'chatgpt_playwright_demo.py'), prompt, '--require-cdp', '--no-telegram'];
    const scraperProcess = spawn(PYTHON_PATH, args, { shell: false, cwd: __dirname });
    activeScraperProcess = scraperProcess;
    let stdout = '';
    let stderr = '';
    let ended = false;

    res.on('close', () => {
      if (!ended && scraperProcess && !scraperProcess.killed) scraperProcess.kill();
      if (activeScraperProcess === scraperProcess) activeScraperProcess = null;
    });
    scraperProcess.stdout.on('data', chunk => {
      const text = chunk.toString();
      stdout += text;
      text.split(/\r?\n/).filter(Boolean).forEach(line => res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright / ChatGPT', msg: line.trim() })}\n\n`));
    });
    scraperProcess.stderr.on('data', chunk => {
      stderr += chunk.toString();
      chunk.toString().split(/\r?\n/).filter(Boolean).forEach(line => res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright (stderr)', msg: line.trim() })}\n\n`));
    });
    scraperProcess.on('error', error => {
      if (ended) return;
      ended = true;
      if (activeScraperProcess === scraperProcess) activeScraperProcess = null;
      res.write(`data: ${JSON.stringify({ type: 'error', msg: error.message })}\n\n`);
      res.end();
    });
    scraperProcess.on('close', code => {
      if (activeScraperProcess === scraperProcess) activeScraperProcess = null;
      if (ended) return;
      try {
        const marker = '--- Risposta ChatGPT ---';
        const responseText = stdout.includes(marker) ? stdout.split(marker).slice(1).join(marker).trim() : stdout.trim();
        if (code !== 0 || responseText.length < 50) throw new Error(describeScraperFailure(code, stderr));
        const report = validateAutomationReport(extractJsonObject(responseText));
        fs.writeFileSync(path.join(CACHE_DIR, 'ftse_mib_news_scout.json'), JSON.stringify(report, null, 2), 'utf8');
        res.write(`data: ${JSON.stringify({ type: 'data', data: report })}\n\n`);
      } catch (error) {
        res.write(`data: ${JSON.stringify({ type: 'error', msg: `Automazione non valida: ${error.message}` })}\n\n`);
      }
      ended = true;
      res.end();
    });
    return;
  }

  if ((parsedUrl.pathname === '/api/analyze' || parsedUrl.pathname === '/api/analyze-stock') && req.method === 'GET') {
    const res = meRes;
    const ticker = parsedUrl.query.ticker || 'VOD.L';
    const isChart = parsedUrl.query.type === 'chart' || parsedUrl.query.chart === 'true';
    const info = getCompanyInfo(ticker);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    if (hasActiveScraperProcess()) {
      try {
        activeScraperProcess.kill();
      } catch (e) {}
    }
    activeScraperProcess = null;
    
    res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Controller & Orchestrator Agent', msg: `Avvio dello scraper Playwright (${isChart ? 'Analisi Grafico AI' : 'Analisi News'}) per il ticker: ${ticker}` })}\n\n`);

    const period = parsedUrl.query.period || '1y';
    const days = parsedUrl.query.days || '252';
    const chartType = parsedUrl.query.chart_type || 'candlestick';

    const args = [
      '-u',
      path.join(__dirname, 'chatgpt_playwright_demo.py'),
      '--ticker', ticker,
      '--company', info.company,
      '--market', info.market,
      '--require-cdp',
      '--no-telegram'
    ];
    if (isChart) {
      args.push('--analyze-chart');
      args.push('--period', period);
      args.push('--days', String(days));
      args.push('--chart-type', chartType);
    }

    res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright Scraper Agent', msg: `Eseguo: python3 chatgpt_playwright_demo.py --ticker ${ticker} --company "${info.company}" --market "${info.market}" ${isChart ? `--analyze-chart --period ${period} --days ${days} --chart-type ${chartType}` : ''}` })}\n\n`);

    const scraperProcess = spawn(PYTHON_PATH, args, { shell: false });
    activeScraperProcess = scraperProcess;

    let scraperOutput = '';
    let scraperErrorOutput = '';
    let responseEnded = false;

    res.on('close', () => {
      if (!responseEnded && scraperProcess && !scraperProcess.killed) {
        scraperProcess.kill();
      }
      if (activeScraperProcess === scraperProcess && scraperProcess.killed) {
        activeScraperProcess = null;
      }
    });

    scraperProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      scraperOutput += text;
      
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright Scraper Agent', msg: line.trim() })}\n\n`);
        }
      });
    });

    scraperProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      scraperErrorOutput += text;
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright Scraper (Err)', msg: line.trim() })}\n\n`);
        }
      });
    });

    scraperProcess.on('error', (err) => {
      if (responseEnded) return;
      res.write(`data: ${JSON.stringify({ type: 'error', msg: `Impossibile avviare Python/Playwright: ${err.message}` })}\n\n`);
      responseEnded = true;
      if (activeScraperProcess === scraperProcess) activeScraperProcess = null;
      res.end();
    });

    scraperProcess.on('close', (code) => {
      if (activeScraperProcess === scraperProcess) activeScraperProcess = null;
      if (responseEnded) return;
      res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Controller & Orchestrator Agent', msg: `Scraper concluso con codice: ${code}` })}\n\n`);

      try {
        // Parse ChatGPT response directly from stdout (Python script prints, does not write files)
        const marker = "--- Risposta ChatGPT ---";
        let chatGptResponse = scraperOutput;
        if (scraperOutput.includes(marker)) {
          chatGptResponse = scraperOutput.split(marker)[1].trim();
        }

        if (!chatGptResponse || chatGptResponse.trim().length < 50) {
          res.write(`data: ${JSON.stringify({ type: 'error', msg: describeScraperFailure(code, scraperErrorOutput) })}\n\n`);
          responseEnded = true;
          res.end();
          return;
        }

        const cacheKey = isChart ? (ticker.trim().toUpperCase() + '_CHART') : ticker.trim().toUpperCase();
        const parsedData = parseReport(chatGptResponse, ticker.trim().toUpperCase(), info.company);
        saveTickerAnalysis(cacheKey, parsedData);
        res.write(`data: ${JSON.stringify({ type: 'data', data: parsedData, isChart: isChart })}\n\n`);
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', msg: `Errore parsing report: ${err.message}` })}\n\n`);
      }

      responseEnded = true;
      res.end();
    });

  } else {
    meRes.writeHead(404, { 'Content-Type': 'text/plain' });
    meRes.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Backend bridge server running on http://localhost:${PORT}`);
});
