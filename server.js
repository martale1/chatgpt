const http = require('http');
const url = require('url');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const PYTHON_PATH = "C:\\Users\\theoi\\AppData\\Local\\Microsoft\\WindowsApps\\PythonSoftwareFoundation.Python.3.10_qbz5n2kfra8p0\\python.exe";
const PDF_PYTHON_PATH = "C:\\Users\\theoi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
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
  if (parsedUrl.pathname === '/api/export-pdf' && req.method === 'GET') {
    const watchlists = loadWatchlists();
    const watchlistName = parsedUrl.query.watchlist || '';
    const explicitTickers = parsedUrl.query.tickers || '';
    const requestedLimit = parseInt(parsedUrl.query.limit || '80', 10);
    const period = parsedUrl.query.period || '3mo';
    const days = parseInt(parsedUrl.query.days || '65', 10);
    const chartType = parsedUrl.query.chart_type || 'candlestick';
    let portfolio = null;
    if (parsedUrl.query.portfolio_json) {
      try { portfolio = JSON.parse(String(parsedUrl.query.portfolio_json)); } catch (e) {
        meRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        meRes.end(JSON.stringify({ error: 'Dati portafoglio JSON non validi.' }));
        return;
      }
    }
    let tickers = [];

    if (explicitTickers) {
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

    const pythonCmd = `
import json
from finance_charts.technical_charts import create_chart_bundle, download_history
try:
    create_chart_bundle('${ticker}', 'finance_charts', period='${period}', days=${days}, chart_type='${chartType}', output_suffix='${outputSuffix}')
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

    req.on('close', () => {
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
