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

// Simple parser for the ChatGPT report
function parseReport(text, ticker, company) {
  const isItalian = ticker.endsWith(".MI");
  const isLondon = ticker.endsWith(".L");
  const currency = isItalian ? "EUR" : isLondon ? "GBp" : "USD";

  const result = {
    search_metadata: {
      query_input: ticker,
      company_name: company,
      ticker: ticker,
      market: isItalian ? "Borsa Italiana" : isLondon ? "London Stock Exchange" : "NASDAQ / NYSE",
      timestamp_utc: new Date().toISOString(),
    },
    market_sentiment_summary: {
      overall_sentiment: "Neutro",
      sentiment_score: 0.5,
      expected_impact: "Laterale",
      summary_explanation: "",
      news_highlights: []
    },
    recent_news_last_3_days: [],
    latest_available_news: [],
    analyst_ratings_and_targets: [],
    technical_levels: {
      supports: [],
      resistances: [],
      critical_levels_notes: ""
    }
  };

  try {
    // Extract Sentiment General
    const sentimentMatch = text.match(/Sintesi del Sentiment generale:\s*\n*([^]*?)(?=\n\n|\n🔗|\n🎨|\n🎯|\n📈|$)/i);
    if (sentimentMatch) {
      const summaryText = sentimentMatch[1].trim();
      result.market_sentiment_summary.summary_explanation = summaryText;
      
      const lower = summaryText.toLowerCase();
      if (lower.includes("molto positivo") || lower.includes("rialzista forte")) {
        result.market_sentiment_summary.overall_sentiment = "Molto Positivo";
        result.market_sentiment_summary.sentiment_score = 0.88;
        result.market_sentiment_summary.expected_impact = "Rialzista di breve termine";
      } else if (lower.includes("positivo") || lower.includes("rialzista")) {
        result.market_sentiment_summary.overall_sentiment = "Positivo";
        result.market_sentiment_summary.sentiment_score = 0.72;
        result.market_sentiment_summary.expected_impact = "Moderatamente rialzista";
      } else if (lower.includes("molto negativo") || lower.includes("ribassista forte")) {
        result.market_sentiment_summary.overall_sentiment = "Negativo";
        result.market_sentiment_summary.sentiment_score = 0.12;
        result.market_sentiment_summary.expected_impact = "Ribassista forte";
      } else if (lower.includes("negativo") || lower.includes("ribassista")) {
        result.market_sentiment_summary.overall_sentiment = "Liev. Negativo";
        result.market_sentiment_summary.sentiment_score = 0.35;
        result.market_sentiment_summary.expected_impact = "Moderatamente ribassista";
      }
    }

    // Extract News items
    const newsSection = text.match(/📰 News rilevanti:\s*\n*([^]*?)(?=\n\n|\n🎯|\n📈|\n🧭|$)/i);
    if (newsSection) {
      // Split on news bullet points (ex: - [date] Title or - Title)
      const newsLines = newsSection[1].split(/(?=\n-\s*\[)/);
      newsLines.forEach((block, idx) => {
        const headlineMatch = block.match(/-\s*\[(.*?)\]\s*(.*?)(?:\n|$)/);
        if (!headlineMatch) return;
        
        const date = headlineMatch[1].trim();
        const headline = headlineMatch[2].trim();
        
        const sintesiMatch = block.match(/\*\s*(?:Testo Completo|Testo|Sintesi|Dettaglio):\s*([^]*?)(?=\n\s*\*|\n-\s*\[|$)/i);
        const sentimentMatchNews = block.match(/\*\s*Sentiment:\s*(.*?)(?:\n|$)/i);
        const impattoMatch = block.match(/\*\s*Impatto:\s*(.*?)(?:\n|$)/i);
        const linkMatch = block.match(/\*\s*Link Fonte:\s*(.*?)(?:\n|$)/i);

        const summary = sintesiMatch ? sintesiMatch[1].trim() : "";
        const sentiment = sentimentMatchNews ? sentimentMatchNews[1].trim() : "Neutro";
        const impact = impattoMatch ? impattoMatch[1].trim() : "Medio";
        let url = linkMatch && linkMatch[1].trim() !== "non disponibile" ? linkMatch[1].trim() : "";
        if (url && !url.startsWith("http")) {
          url = "";
        }

        const newsItem = {
          id: `${ticker.toLowerCase()}_live_news_${idx}`,
          headline,
          date,
          source: url ? new URL(url).hostname.replace('www.', '') : ticker.endsWith(".MI") ? "Milano Finanza" : "Reuters",
          source_domain: url ? new URL(url).hostname : ticker.endsWith(".MI") ? "milanofinanza.it" : "reuters.com",
          category: "Live News",
          summary,
          detail: summary,
          sentiment,
          impact_rating: impact,
          url
        };
        
        result.recent_news_last_3_days.push(newsItem);
        result.market_sentiment_summary.news_highlights.push(`📰 ${headline} (${sentiment})`);
      });
    }

    // Extract Analyst Ratings
    const analystSection = text.match(/🎯 Target price \/ analisti[^]*?:\s*\n*([^]*?)(?=\n\n|\n📈|\n🧭|$)/i);
    if (analystSection) {
      const lines = analystSection[1].split('\n').filter(l => l.trim().startsWith('-'));
      lines.forEach(line => {
        const parts = line.replace(/^-\s*/, '').split(':');
        if (parts.length < 2) return;
        const broker = parts[0].trim();
        const details = parts[1].split('-');
        if (details.length >= 2) {
          const targetPrice = details[0].trim();
          const rating = details[1].trim();
          const date = details[2] ? details[2].trim() : "Recente";
          result.analyst_ratings_and_targets.push({
            broker,
            rating,
            target_price: targetPrice,
            currency,
            date,
            note: `Valutazione espressa dagli analisti di ${broker}.`
          });
        }
      });
    }

    // Extract technical levels
    const levelsSection = text.match(/📈 Livelli tecnici chiave:\s*\n*([^]*?)(?=\n\n|\n🧭|\n🔗|$)/i);
    if (levelsSection) {
      const supMatch = levelsSection[1].match(/Supporti:\s*S1:\s*(.*?),?\s*S2:\s*(.*?)(?:\n|,|$)/i);
      const resMatch = levelsSection[1].match(/Resistenze:\s*R1:\s*(.*?),?\s*R2:\s*(.*?)(?:\n|,|$)/i);
      
      if (supMatch) {
        result.technical_levels.supports = [supMatch[1].trim(), supMatch[2].trim()];
      }
      if (resMatch) {
        result.technical_levels.resistances = [resMatch[1].trim(), resMatch[2].trim()];
      }
      
      result.technical_levels.critical_levels_notes = `Supporti e resistenze chiave estratti dall'analisi tecnica di ChatGPT. Resistenza spartiacque a quota ${result.technical_levels.resistances[0] || 'N/A'}.`;
    }

  } catch (err) {
    console.error("Error parsing ChatGPT report text:", err);
  }

  // Fallback default arrays if empty
  if (result.recent_news_last_3_days.length === 0) {
    result.recent_news_last_3_days.push({
      id: `${ticker.toLowerCase()}_fallback_1`,
      headline: `Nessuna notizia strutturata trovata nel testo di ChatGPT`,
      date: new Date().toISOString().split('T')[0],
      source: "ChatGPT Scraper",
      source_domain: "chatgpt.com",
      category: "Info",
      summary: "ChatGPT non ha restituito notizie strutturate nel formato richiesto. Ispeziona i log completi nel terminale per leggere la risposta testuale grezza.",
      detail: text,
      sentiment: "Neutro",
      impact_rating: "Basso"
    });
  }

  return result;
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
      '--company', `"${info.company}"`,
      '--market', `"${info.market}"`,
      '--no-telegram'
    ];

    res.write(`data: ${JSON.stringify({ type: 'log', agent: 'Playwright Scraper Agent', msg: `Eseguo: python3 chatgpt_playwright_demo.py --ticker ${ticker} --company "${info.company}"` })}\n\n`);

    const scraperProcess = spawn(`"${PYTHON_PATH}"`, args, { shell: true });

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
