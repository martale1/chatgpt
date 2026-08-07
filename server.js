const http = require('http');
const url = require('url');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const PYTHON_PATH = "C:\\Users\\theoi\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe";

// Helper to resolve company name
function getCompanyInfo(ticker) {
  const clean = ticker.trim().toUpperCase();
  const catalog = {
    "VOD.L": { company: "Vodafone", market: "London Stock Exchange" },
    "A2A.MI": { company: "A2A", market: "Borsa Italiana" },
    "AVIO.MI": { company: "Avio", market: "Borsa Italiana" },
    "STLAM.MI": { company: "Stellantis", market: "Borsa Italiana" },
    "ISP.MI": { company: "Intesa Sanpaolo", market: "Borsa Italiana" },
    "UCG.MI": { company: "UniCredit", market: "Borsa Italiana" },
    "TSLA": { company: "Tesla", market: "NASDAQ" },
    "AAPL": { company: "Apple", market: "NASDAQ" },
    "NVDA": { company: "NVIDIA", market: "NASDAQ" },
    "MSFT": { company: "Microsoft", market: "NASDAQ" }
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
    throw new Error('Nessun blocco JSON trovato nella risposta di ChatGPT. Risposta ricevuta:\n' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON non valido nella risposta di ChatGPT: ' + e.message + '\n\nContenuto:\n' + jsonStr.slice(0, 500));
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


// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/api/analyze') {
    const ticker = parsedUrl.query.ticker || 'AVIO.MI';
    const info = getCompanyInfo(ticker);
    
    // Set headers for SSE (Server-Sent Events)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // disable buffering for proxy servers
    });

    res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Controller & Orchestrator Agent', msg: `Avvio dello scraper Playwright per il ticker: ${ticker}` })}\n\n`);

    const args = [
      path.join(__dirname, 'chatgpt_playwright_demo.py'),
      '--ticker', ticker,
      '--company', info.company,
      '--market', info.market,
      '--no-telegram'
    ];

    res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright Scraper Agent', msg: `Eseguo: python3 chatgpt_playwright_demo.py --ticker ${ticker} --company "${info.company}" --market "${info.market}"` })}\n\n`);

    const scraperProcess = spawn(PYTHON_PATH, args, { shell: false });

    let scraperOutput = '';

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
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright Scraper (Err)', msg: line.trim() })}\n\n`);
        }
      });
    });

    scraperProcess.on('close', (code) => {
      res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Controller & Orchestrator Agent', msg: `Scraper concluso con codice: ${code}` })}\n\n`);

      try {
        // Parse ChatGPT response directly from stdout (Python script prints, does not write files)
        const marker = "--- Risposta ChatGPT ---";
        let chatGptResponse = scraperOutput;
        if (scraperOutput.includes(marker)) {
          chatGptResponse = scraperOutput.split(marker)[1].trim();
        }

        if (!chatGptResponse || chatGptResponse.trim().length < 50) {
          res.write(`data: ${JSON.stringify({ type: 'error', msg: `Nessuna risposta valida ricevuta da ChatGPT. Controlla che la sessione sia attiva.` })}\n\n`);
          res.end();
          return;
        }

        const parsedData = parseReport(chatGptResponse, ticker.trim().toUpperCase(), info.company);
        res.write(`data: ${JSON.stringify({ type: 'data', data: parsedData })}\n\n`);
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', msg: `Errore parsing report: ${err.message}` })}\n\n`);
      }

      res.end();
    });

  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Backend bridge server running on http://localhost:${PORT}`);
});
