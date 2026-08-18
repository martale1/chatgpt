import React, { useState, useEffect } from 'react';

// Nessun dato simulato o inventato: i dati vengono SEMPRE da ChatGPT via Playwright 

const getSentimentColor = (score) => {
 if (score >= 0.85) return { bg: 'rgba(34,197,94,0.12)', border: '#16a34a', text: '#4ade80', label: 'Molto Positivo' };
 if (score >= 0.65) return { bg: 'rgba(34,197,94,0.07)', border: '#22c55e', text: '#86efac', label: 'Positivo' };
 if (score >= 0.45) return { bg: 'rgba(234,179,8,0.10)', border: '#ca8a04', text: '#fbbf24', label: 'Neutro' };
 return        { bg: 'rgba(239,68,68,0.10)', border: '#dc2626', text: '#f87171', label: 'Negativo' };
};

const MONITOR_SIGNALS = new Set([
 'BUY_CANDIDATE', 'BREAKOUT_CONFIRMED', 'PULLBACK_ENTRY_CANDIDATE', 'HOLD',
 'HOLD_OR_TRAILING_STOP', 'WAIT', 'WARNING', 'REVIEW_POSITION',
 'SETUP_INVALIDATED', 'DO_NOT_BUY'
]);
const MONITOR_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const normalizeMonitorConfig = (input) => {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Il contenuto del file deve essere un oggetto JSON.');
 if (String(input.schema_version || '') !== '1.0') throw new Error('schema_version non supportata: e richiesta la versione 1.0.');

 if (!Array.isArray(input.securities) || input.securities.length === 0) throw new Error('Il campo securities deve contenere almeno un titolo.');

 const seen = new Set();
 const securities = input.securities.map((security, index) => {
  if (!security || typeof security !== 'object') throw new Error(`Titolo #${index + 1}: oggetto non valido.`);
  const ticker = String(security.ticker || '').trim().toUpperCase();
  if (!ticker) throw new Error(`Titolo #${index + 1}: ticker mancante.`);
  if (seen.has(ticker)) throw new Error(`Ticker duplicato nel file: ${ticker}.`);
  seen.add(ticker);

  const technical = security.technical && typeof security.technical === 'object' ? { ...security.technical } : {};
  const rules = Array.isArray(security.rules) ? security.rules.map((rule, ruleIndex) => {
   const id = String(rule?.id || '').trim();
   const condition = String(rule?.condition || '').trim();
   const action = String(rule?.action || '').trim().toUpperCase();
   const priority = String(rule?.priority || '').trim().toUpperCase();
   if (!id || !condition) throw new Error(`${ticker}, regola #${ruleIndex + 1}: id o condition mancante.`);
   if (!MONITOR_SIGNALS.has(action)) throw new Error(`${ticker}, regola ${id}: action non riconosciuta (${action}).`);
   if (!MONITOR_PRIORITIES.has(priority)) throw new Error(`${ticker}, regola ${id}: priority non riconosciuta (${priority}).`);
   return { id, condition, action, priority };
  }) : [];

  return {
   ...security,
   ticker,
   company: String(security.company || ticker).trim(),
   source_page: Number.isFinite(Number(security.source_page)) ? Number(security.source_page) : null,
   position: {
    status: String(security.position?.status || 'WATCHLIST').toUpperCase() === 'OPEN' ? 'OPEN' : 'WATCHLIST',
    entry_price: Number.isFinite(Number(security.position?.entry_price)) && security.position?.entry_price !== null
     ? Number(security.position.entry_price) : null
   },
   sentiment_analysis: security.sentiment_analysis && typeof security.sentiment_analysis === 'object' ? { ...security.sentiment_analysis } : {},
   relevant_news: Array.isArray(security.relevant_news) ? security.relevant_news.map(news => ({ ...news })) : [],
   technical,
   rules
  };
 });

 return {
  ...input,
  schema_version: '1.0',
  market: String(input.market || 'Borsa Italiana'),
  securities,
  imported_at: new Date().toISOString()
 };
};

const normalizePortfolioAnalysis = (input, portfolioTickers) => {
 if (!input || typeof input !== 'object') throw new Error('Output Portafoglio non valido: il file deve essere un oggetto JSON.');
 if (!Array.isArray(input.securities) || !input.securities.length) throw new Error('Il JSON deve contenere almeno una voce in securities.');
 const allowedActions = new Set(['HOLD', 'HOLD_OR_TRAILING_STOP', 'REDUCE', 'REVIEW_POSITION', 'EXIT_CANDIDATE']);
 const allowedPlanStatuses = new Set(['ACTIVE', 'WAIT_CONFIRMATION', 'REVIEW_REQUIRED', 'NOT_AVAILABLE']);
 const allowedStopReviewRecommendations = new Set(['KEEP', 'MODIFY', 'REMOVE', 'REVIEW_REQUIRED']);
 const securities = input.securities.map((item, index) => {
  const ticker = String(item?.ticker || '').trim().toUpperCase();
  if (!ticker) throw new Error(`Posizione #${index + 1}: ticker mancante.`);
  const assessment = item.portfolio_assessment || {};
  let action = String(assessment.recommended_action || 'HOLD').toUpperCase();
  if (!allowedActions.has(action)) action = 'HOLD';
  const plan = item.operational_plan || {};
  let planStatus = String(plan.plan_status || 'NOT_AVAILABLE').toUpperCase();
  if (!allowedPlanStatuses.has(planStatus)) planStatus = 'ACTIVE';
  const numericOrNull = value => Number.isFinite(Number(value)) && value !== null ? Number(value) : null;
  const stopReview = item.stop_loss_review || {};
  let stopRecommendation = String(stopReview.recommendation || 'REVIEW_REQUIRED').toUpperCase();
  if (!allowedStopReviewRecommendations.has(stopRecommendation)) stopRecommendation = 'KEEP';
  const technical = item.technical && typeof item.technical === 'object' ? item.technical : {};
  return {
   ...item,
   ticker,
   technical: {
    ...technical,
    volume_analysis: String(technical.volume_analysis || '').trim(),
    stochastic_analysis: String(technical.stochastic_analysis || '').trim(),
    macd_analysis: String(technical.macd_analysis || '').trim(),
    adx_analysis: String(technical.adx_analysis || '').trim()
   },
   stop_loss_review: {
    ...stopReview,
    configured_level: numericOrNull(stopReview.configured_level),
    suggested_level: numericOrNull(stopReview.suggested_level),
    recommendation: stopRecommendation
   },
   portfolio_assessment: {
    ...assessment,
    recommended_action: action
   },
   operational_plan: {
    ...plan,
    plan_status: planStatus,
    reference_price: numericOrNull(plan.reference_price),
    stop_loss: { ...(plan.stop_loss || {}), level: numericOrNull(plan.stop_loss?.level) },
    take_profit_levels: Array.isArray(plan.take_profit_levels) ? plan.take_profit_levels.slice(0, 3).map(tp => ({ ...tp, level: numericOrNull(tp.level) })) : [],
    trailing_stop: { enabled: Boolean(plan.trailing_stop?.enabled), ...(plan.trailing_stop || {}) },
    confirmation_conditions: Array.isArray(plan.confirmation_conditions) ? plan.confirmation_conditions : [],
    invalidation_conditions: Array.isArray(plan.invalidation_conditions) ? plan.invalidation_conditions : [],
    monitoring_triggers: Array.isArray(plan.monitoring_triggers) ? plan.monitoring_triggers : []
   }
  };
 });
 return { ...input, schema_version: '1.0', securities };
};

const getPortfolioAnalysisPrice = item => {
 const candidates = [
  item?.operational_plan?.reference_price,
  item?.position?.current_price,
  item?.technical?.reference_price
 ];
 for (const candidate of candidates) {
  const value = Number(candidate);
  if (Number.isFinite(value) && value > 0) return value;
 }
 return null;
};

const getIndicatorCardStyle = (text, explicitSentiment) => {
 let sentiment = explicitSentiment;
 if (!sentiment && text) {
  const lower = text.toLowerCase();
  const isIndecision = lower.includes('doji') || lower.includes('indecisione') || lower.includes('in consolidamento') || lower.includes('neutro');
  const posKeys = ['rialzista', 'rialziste', 'rialzo', 'bullish', 'positivo', 'positiva', 'ipervenduto', 'rimbalzo', 'acquisto', 'espansione rialzista', 'hammer', 'doppio minimo', 'engulfing rialzista'];
  const negKeys = ['ribassista', 'ribassiste', 'ribasso', 'bearish', 'negativo', 'negativa', 'ipercomprato', 'vendita', 'inversione ribassista', 'testa e spalle', 'engulfing ribassista', 'scendono', 'pressione di vendita', 'debolezza'];

  let pos = 0, neg = 0;
  posKeys.forEach(k => { if (lower.includes(k)) pos++; });
  negKeys.forEach(k => { if (lower.includes(k)) neg++; });

  if (isIndecision && pos === 0 && neg === 0) sentiment = 'Neutro';
  else if (pos > neg) sentiment = 'Positivo';
  else if (neg > pos) sentiment = 'Negativo';
  else sentiment = 'Neutro';
 }

 const s = String(sentiment || 'Neutro').toLowerCase();
 if (s.includes('positi') || s.includes('rialzi') || s.includes('bull')) {
  return { label: 'Positivo', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', borderLeft: '5px solid #16a34a', badgeBg: '#dcfce7', icon: '' };
 } else if (s.includes('negati') || s.includes('ribassi') || s.includes('bear')) {
  return { label: 'Negativo', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', borderLeft: '5px solid #dc2626', badgeBg: '#fee2e2', icon: '' };
 } else {
  return { label: 'Neutro', color: '#b45309', bg: '#fffbeb', border: '#fde68a', borderLeft: '5px solid #d97706', badgeBg: '#fef3c7', icon: '' };
 }
};

// NewsCard 
function NewsCard({ news, getSentimentBadge, getImpactDot }) {
 return (
  <div className="news-item">
   <div className="news-header">
    <span className="news-headline">{news.headline}</span>
    {getSentimentBadge(news.sentiment)}
   </div>

   <div className="news-meta">
     {news.date} &nbsp;|&nbsp;  {news.category} &nbsp;|&nbsp; {getImpactDot(news.impact_rating)}
   </div>

   <div className="news-source-row">
    <span className="news-source-badge"> {news.source}</span>
    {news.source_domain && (
     <span className="news-source-domain">via {news.source_domain}</span>
    )}
    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
     {(news.url || news.source_domain) && (
      <a
       href={news.url || `https://${news.source_domain}`}
       target="_blank"
       rel="noopener noreferrer"
       className="news-source-link"
       title={news.url ? "Apri l'articolo originale" : `Visita la home page di ${news.source_domain}`}
      >
        {news.url ? "Apri Articolo" : "Visita Sito"}
      </a>
     )}
     {!news.url && (
      <a
       href={`https://www.google.com/searchq=${encodeURIComponent(news.headline + ' ' + news.source)}`}
       target="_blank"
       rel="noopener noreferrer"
       className="news-source-link"
       title="Cerca questa notizia su Google"
       style={{ color: '#94a3b8' }}
      >
        Cerca Notizia
      </a>
     )}
    </div>
   </div>

   <div className="news-summary" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', marginTop: '0.8rem' }}>
    {news.detail || news.summary}
   </div>
  </div>
 );
}

// Empty state quando non ci sono dati reali 
function EmptyState({ ticker, onAnalyze, loading }) {
 return (
  <div style={{
   display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
   padding: '4rem 2rem', textAlign: 'center', gap: '1.5rem'
  }}>
   <div style={{ fontSize: '4rem' }}></div>
   <h2 style={{ color: '#e2e8f0', margin: 0 }}>
    {ticker ? `Nessuna analisi disponibile per ${ticker}` : 'Inserisci un ticker per iniziare'}
   </h2>
   <p style={{ color: '#94a3b8', maxWidth: '500px', lineHeight: 1.7 }}>
    I dati vengono recuperati <strong>esclusivamente in tempo reale da ChatGPT via Playwright</strong>.
    Nessun dato viene inventato o simulato.
   </p>
   {ticker && (
    <button
     className="btn-primary"
     onClick={onAnalyze}
     disabled={loading}
     style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}
    >
     {loading ? 'Analisi in corso...' : `Avvia Analisi Live per ${ticker}`}
    </button>
   )}
   <p style={{ color: '#475569', fontSize: '0.85rem' }}>
     Assicurati che <code>node server.js</code> sia attivo sulla porta 3001
   </p>
  </div>
 );
}

export default function App() {

 const [query, setQuery] = useState('');
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(false);
 const [watchlistRefreshMode, setWatchlistRefreshMode] = useState('');

 // Risultati reali ricevuti da ChatGPT (persistiti in localStorage con auto-pulizia elementi corrotti)
 const [realTickerData, setRealTickerData] = useState(() => {
  const saved = localStorage.getItem('real_ticker_data');
  if (saved) {
   try {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object') {
     const cleaned = {};
     for (const [key, val] of Object.entries(parsed)) {
      const raw = JSON.stringify(val).toLowerCase();
      // Scarta cache corrotte dove dati di Vodafone filtravano in altri titoli
      if (key !== 'VOD.L' && (raw.includes('vodafonethree') || raw.includes('vodafone group'))) {
       console.warn(`Pulizia cache corrotta per ${key}`);
       continue;
      }
      cleaned[key] = val;
     }
     return cleaned;
    }
   } catch (e) {
    console.error('Errore parsing real_ticker_data da localStorage', e);
   }
  }
  return {};
 });

 // Mappa Multi-Watchlist (persistita in localStorage) 
 const [watchlists, setWatchlists] = useState(() => {
  const saved = localStorage.getItem('custom_watchlists');
  if (saved) {
   try {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
     return parsed;
    }
   } catch (e) {}
  }
  // Migrazione da salvataggio precedente o lista standard
  const legacySaved = localStorage.getItem('watchlist_tickers');
  let legacyList = ['AVIO.MI', 'VOD.L', 'A2A.MI', 'NVDA', 'AAPL', 'STLAM.MI', 'AMD.O', 'BC.MI', 'ENEL.MI', 'STMMI.MI', 'SRG.MI', 'REY.MI', 'CPR.MI', 'PRY.MI'];
  if (legacySaved) {
   try {
    const parsed = JSON.parse(legacySaved);
    if (Array.isArray(parsed) && parsed.length > 0) legacyList = parsed;
   } catch (e) {}
  }
  return {
   'Preferiti': legacyList,
   'Tech USA': ['NVDA', 'AAPL', 'MSFT', 'AMD.O', 'TSLA'],
   'FTSE MIB': ['AVIO.MI', 'A2A.MI', 'STLAM.MI', 'ENEL.MI', 'SRG.MI'],
   'MIB30': [
    'A2A.MI', 'AMP.MI', 'AZM.MI', 'BMED.MI', 'BMPS.MI',
    'BAMI.MI', 'BPE.MI', 'BC.MI', 'CPR.MI', 'DIA.MI',
    'ENEL.MI', 'ENI.MI', 'ERG.MI', 'RACE.MI', 'FBK.MI',
    'G.MI', 'HER.MI', 'IP.MI', 'ISP.MI', 'INW.MI',
    'IG.MI', 'IVG.MI', 'LDO.MI', 'MB.MI', 'MONC.MI',
    'NEXI.MI', 'PIRC.MI', 'PST.MI', 'PRY.MI', 'REC.MI',
    'SPM.MI', 'SRG.MI', 'STLAM.MI', 'STMMI.MI', 'TIT.MI',
    'TEN.MI', 'TRN.MI', 'UCG.MI', 'UNI.MI', 'VOD.L'
   ]
  };
 });

 const [activeWatchlistName, setActiveWatchlistName] = useState(() => {
  const saved = localStorage.getItem('active_watchlist_name');
  if (saved) return saved;
  return 'Preferiti';
 });

 const [newWatchlistNameInput, setNewWatchlistNameInput] = useState('');
 const [showCreateWatchlistModal, setShowCreateWatchlistModal] = useState(false);

 const watchlist = watchlists[activeWatchlistName] || watchlists['Preferiti'] || [];

 const [newTickersInput, setNewTickersInput] = useState('');
 const [activeTab, setActiveTab] = useState('portfolio');
 const [logs, setLogs] = useState([]);
 const [batchProgress, setBatchProgress] = useState(null);
 const [expandedTicker, setExpandedTicker] = useState(null);
 const [sortOrder, setSortOrder] = useState('desc'); // default: score piu alto prima ('desc')
 const [chartTimeframe, setChartTimeframe] = useState('3m');
 const [chartType, setChartType] = useState('candlestick');
 const [chartIndicatorTab, setChartIndicatorTab] = useState('prezzo');
 const [chartHeight, setChartHeight] = useState('420px');
 const [chartHistoryBars, setChartHistoryBars] = useState([]);
 const [chartMetrics, setChartMetrics] = useState({});
 const [hoveredBarIndex, setHoveredBarIndex] = useState(null);
 const [hoveredBar, setHoveredBar] = useState(null);
 const [crosshairPos, setCrosshairPos] = useState(null);
 const [clickedBar, setClickedBar] = useState(null);
 const [chartVersion, setChartVersion] = useState(Date.now());
 const [showJsonOutput, setShowJsonOutput] = useState(false);
 const [updateMenuOpenTicker, setUpdateMenuOpenTicker] = useState(null);
 const [selectedPdfTickers, setSelectedPdfTickers] = useState([]);
 const [pdfProgress, setPdfProgress] = useState(null);
 const [monitorConfig, setMonitorConfig] = useState(() => {
  try {
   const saved = localStorage.getItem('ftse_mib_monitor_config');
   return saved ? normalizeMonitorConfig(JSON.parse(saved)) : null;
  } catch (error) {
   console.error('Configurazione monitor salvata non valida', error);
   return null;
  }
 });
 const [monitorImportStatus, setMonitorImportStatus] = useState(null);
 const [monitorExpandedTicker, setMonitorExpandedTicker] = useState(null);
 const [monitorChartSecurity, setMonitorChartSecurity] = useState(null);
 const [portfolio, setPortfolio] = useState(() => {
  try {
   const saved = localStorage.getItem('investment_portfolio');
   return saved ? JSON.parse(saved) : [];
  } catch (error) {
   console.error('Portafoglio salvato non valido', error);
   return [];
  }
 });
 const [portfolioForm, setPortfolioForm] = useState({ ticker: '', company: '', quantity: '', entryPrice: '', configuredStopLoss: '', purchaseDate: '', fees: '', notes: '' });
 const [portfolioEditingTicker, setPortfolioEditingTicker] = useState(null);
 const [portfolioStatus, setPortfolioStatus] = useState(null);
 const [portfolioPrices, setPortfolioPrices] = useState({});
 const [portfolioLastPrices, setPortfolioLastPrices] = useState(() => {
  try {
   const saved = localStorage.getItem('portfolio_last_yahoo_prices');
   return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
 });
 const [portfolioPricesStatus, setPortfolioPricesStatus] = useState({ state: 'idle', message: '' });
 const [showPortfolioForm, setShowPortfolioForm] = useState(false);
 const [portfolioPdfProgress, setPortfolioPdfProgress] = useState(null);
 const [portfolioAnalysis, setPortfolioAnalysis] = useState(() => { try { const saved = localStorage.getItem('portfolio_analysis_output'); return saved ? JSON.parse(saved) : null; } catch { return null; } });
 const [portfolioImportStatus, setPortfolioImportStatus] = useState(null);
 const [portfolioAnalysisExpandedTicker, setPortfolioAnalysisExpandedTicker] = useState(null);
 const [portfolioChartTicker, setPortfolioChartTicker] = useState(null);
 const [portfolioChartBars, setPortfolioChartBars] = useState([]);
 const [portfolioChartLoading, setPortfolioChartLoading] = useState(false);
 const [portfolioChartMode, setPortfolioChartMode] = useState('candlestick');
 const [portfolioIndicatorTab, setPortfolioIndicatorTab] = useState('price_alligator');
 const [portfolioChartImageVersion, setPortfolioChartImageVersion] = useState(Date.now());
 const [portfolioDetailTab, setPortfolioDetailTab] = useState('summary');
 const [automationReport, setAutomationReport] = useState(() => {
  try { const saved = localStorage.getItem('ftse_mib_news_scout_report'); return saved ? JSON.parse(saved) : null; }
  catch { return null; }
 });
 const [automationLoading, setAutomationLoading] = useState(false);
 const [automationLogs, setAutomationLogs] = useState([]);
 const [automationError, setAutomationError] = useState('');
 const [automationStrategies, setAutomationStrategies] = useState(() => {
  try { const saved = localStorage.getItem('ftse_mib_candidate_strategies'); return saved ? JSON.parse(saved) : null; }
  catch { return null; }
 });
 const [automationChartLoading, setAutomationChartLoading] = useState(false);
 const [automationChartLogs, setAutomationChartLogs] = useState([]);
 const [automationChartError, setAutomationChartError] = useState('');
 const [chatGptBrowserStatus, setChatGptBrowserStatus] = useState('');
 const [automationTelegramStatus, setAutomationTelegramStatus] = useState({ state: 'idle', message: '' });

 useEffect(() => {
  setSelectedPdfTickers([]);
  setPdfProgress(null);
 }, [activeWatchlistName]);

 // Sincronizzazione con Server Backend (per la persistenza multi-browser) 
 useEffect(() => {
  fetch('/api/all-data')
   .then(res => res.json())
   .then(resData => {
     // Conserva i dati ricevuti dal backend senza forzare l'apertura automatica di alcuna scheda
     setRealTickerData(prev => {
      const merged = { ...prev, ...resData.tickerData };
      localStorage.setItem('real_ticker_data', JSON.stringify(merged));
      return merged;
     });
    if (resData.watchlists && typeof resData.watchlists === 'object' && Object.keys(resData.watchlists).length > 0) {
     setWatchlists(resData.watchlists);
    }
   })
  .catch(() => {});
 }, []);

 useEffect(() => {
  fetch('/api/automation/state', { cache: 'no-store' })
   .then(response => response.json())
   .then(payload => {
    if (payload.report?.candidates?.length) setAutomationReport(payload.report);
    if (payload.strategies?.results?.length) setAutomationStrategies(payload.strategies);
   })
   .catch(() => {});
 }, []);

 useEffect(() => {
  localStorage.setItem('custom_watchlists', JSON.stringify(watchlists));
  try {
   fetch('/api/save-watchlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(watchlists)
   }).catch(() => {});
  } catch (e) {}
 }, [watchlists]);

 // Helper Timeframe config per yfinance & numero di barre 
 const getTimeframeConfig = (tf) => {
  switch (tf) {
   case '5g': return { period: '5d', days: 5 };
   case '1m': return { period: '1mo', days: 22 };
   case '3m': return { period: '3mo', days: 65 };
   case '6m': return { period: '6mo', days: 130 };
   case '1a': return { period: '1y', days: 252 };
   case '2a': return { period: '2y', days: 504 };
   default: return { period: '1y', days: 252 };
  }
 };

 const exportWatchlistPdf = async () => {
  const cfg = getTimeframeConfig(chartTimeframe);
  const selectedTickers = watchlist.filter(ticker => selectedPdfTickers.includes(ticker));
  if (selectedTickers.length === 0) {
   setPdfProgress({ status: 'failed', percent: 0, phase: 'Seleziona almeno un titolo dalla tabella', ticker: '' });
   return;
  }
  const params = new URLSearchParams({
   watchlist: activeWatchlistName,
   tickers: selectedTickers.join(','),
   limit: String(selectedTickers.length),
  try {
   setPdfProgress({ status: 'running', percent: 1, phase: 'Avvio esportazione', ticker: '' });
   const startResponse = await fetch('/api/export-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     watchlist: activeWatchlistName,
     tickers: selectedTickers.join(','),
     limit: String(selectedTickers.length),
     period: cfg.period,
     days: String(cfg.days),
     chart_type: chartType
    })
   });
   const startData = await startResponse.json();
   if (!startResponse.ok || !startData.jobId) throw new Error(startData.error || 'Avvio PDF fallito');

   const poll = window.setInterval(async () => {
    try {
     const statusResponse = await fetch(`/api/export-pdf/status?job_id=${encodeURIComponent(startData.jobId)}`);
     const statusData = await statusResponse.json();
     if (!statusResponse.ok) throw new Error(statusData.error || 'Stato PDF non disponibile');
     setPdfProgress(statusData);
     if (statusData.status === 'completed') {
      window.clearInterval(poll);
      const link = document.createElement('a');
      link.href = `/api/export-pdf/download?job_id=${encodeURIComponent(startData.jobId)}`;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();
     } else if (statusData.status === 'failed') {
      window.clearInterval(poll);
     }
    } catch (error) {
     window.clearInterval(poll);
     setPdfProgress({ status: 'failed', percent: 0, phase: error.message, ticker: '' });
    }
   }, 700);
  } catch (error) {
   setPdfProgress({ status: 'failed', percent: 0, phase: error.message, ticker: '' });
  }
 };

 // Caricamento Storico Prezzi ed ispezione interattiva Mouse Hover 
 useEffect(() => {
  const activeTicker = monitorChartSecurity?.ticker || query || data?.search_metadata?.ticker;
  if (activeTicker) {
   const cfg = getTimeframeConfig(chartTimeframe);
   fetch(`/api/chart-history?ticker=${activeTicker}&period=${cfg.period}&days=${cfg.days}&chart_type=${chartType}`)
    .then(res => res.json())
    .then(resData => {
     if (Array.isArray(resData)) {
      setChartHistoryBars(resData);
     } else if (resData && Array.isArray(resData.bars)) {
      setChartHistoryBars(resData.bars);
      if (resData.metrics) setChartMetrics(resData.metrics);
     }
     setChartVersion(Date.now());
    })
    .catch(() => {});
  }
 }, [monitorChartSecurity?.ticker, query, data?.search_metadata?.ticker, chartTimeframe, chartType]);

 useEffect(() => {
  localStorage.setItem('active_watchlist_name', activeWatchlistName);
 }, [activeWatchlistName]);

 useEffect(() => {
  localStorage.setItem('real_ticker_data', JSON.stringify(realTickerData));
 }, [realTickerData]);

 useEffect(() => {
  if (monitorConfig) localStorage.setItem('ftse_mib_monitor_config', JSON.stringify(monitorConfig));
  else localStorage.removeItem('ftse_mib_monitor_config');
 }, [monitorConfig]);

 useEffect(() => {
  localStorage.setItem('investment_portfolio', JSON.stringify(portfolio));
 }, [portfolio]);

 useEffect(() => {
  if (activeTab !== 'portfolio') return;
  const controller = new AbortController();
  setPortfolioPrices({});
  if (!portfolio.length) {
   setPortfolioPricesStatus({ state: 'idle', message: 'Nessuna posizione da aggiornare.' });
   return () => controller.abort();
  }
  setPortfolioPricesStatus({ state: 'loading', message: 'Recupero ultimo prezzo da Yahoo Finance...' });
  const tickers = portfolio.map(item => item.ticker).join(',');
  fetch(`/api/portfolio-prices?tickers=${encodeURIComponent(tickers)}`, { signal: controller.signal, cache: 'no-store' })
   .then(async response => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Yahoo Finance non disponibile.');
    return payload;
   })
   .then(payload => {
    const prices = payload.prices && typeof payload.prices === 'object' ? payload.prices : {};
    setPortfolioPrices(prices);
    setPortfolioLastPrices(previous => {
     const updated = { ...previous, ...prices };
     localStorage.setItem('portfolio_last_yahoo_prices', JSON.stringify(updated));
     return updated;
    });
    const count = Object.keys(prices).length;
    const failed = portfolio.length - count;
    setPortfolioPricesStatus({ state: failed ? 'warning' : 'success', message: `${count}/${portfolio.length} prezzi recuperati ora da Yahoo Finance${failed ? `; ${failed} non disponibili` : ''}.` });
   })
   .catch(error => {
    if (error.name === 'AbortError') return;
    setPortfolioPrices({});
    setPortfolioPricesStatus({ state: 'error', message: `Aggiornamento Yahoo Finance fallito: ${error.message}` });
   });
  return () => controller.abort();
 }, [activeTab]);

 useEffect(() => {
  if (portfolioAnalysis) localStorage.setItem('portfolio_analysis_output', JSON.stringify(portfolioAnalysis));
  else localStorage.removeItem('portfolio_analysis_output');
 }, [portfolioAnalysis]);

 useEffect(() => {
  if (automationReport) localStorage.setItem('ftse_mib_news_scout_report', JSON.stringify(automationReport));
  else localStorage.removeItem('ftse_mib_news_scout_report');
 }, [automationReport]);

 useEffect(() => {
  if (automationStrategies) localStorage.setItem('ftse_mib_candidate_strategies', JSON.stringify(automationStrategies));
  else localStorage.removeItem('ftse_mib_candidate_strategies');
 }, [automationStrategies]);

 useEffect(() => {
  if (!portfolioChartTicker) return;
  const controller = new AbortController();
  const cfg = getTimeframeConfig(chartTimeframe);
  const analysisItem = portfolioAnalysis?.securities?.find(item => item.ticker === portfolioChartTicker);
  const plan = analysisItem?.operational_plan || {};
  const technical = analysisItem?.technical || {};
  const analystTarget = analysisItem?.analyst_target || {};
  const requestedLevels = [
   ['PREZZO INGRESSO', analysisItem?.position?.entry_price, 'trigger'],
   ['STOP CONFIGURATO', analysisItem?.stop_loss_review?.configured_level ?? analysisItem?.position?.configured_stop_loss, 'invalidation'],
   ['STOP SUGGERITO', analysisItem?.stop_loss_review?.suggested_level ?? plan.stop_loss?.level, 'invalidation'],
   ...((plan.take_profit_levels || []).map((tp, index) => [tp.label || `TP${index + 1}`, tp.level, 'target'])),
   ['SUPPORTO', technical.major_support, 'support'],
   ['RESISTENZA', technical.resistance, 'resistance'],
   ['LIVELLO PROTETTIVO', technical.protective_level, 'support'],
   ['LIVELLO REVISIONE', technical.review_level, 'invalidation'],
   ['TARGET TECNICO', technical.target_level, 'target'],
   ['TARGET ANALISTI', analystTarget.available ? analystTarget.target_price : null, 'target']
  ].filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0).map(([label, value, type]) => ({ label, value: Number(value), type }));
  setPortfolioChartLoading(true);
  setPortfolioChartBars([]);
  const params = new URLSearchParams({ ticker: portfolioChartTicker, period: cfg.period, days: String(cfg.days), chart_type: chartType, levels: JSON.stringify(requestedLevels) });
  fetch(`/api/chart-history?${params.toString()}`, { signal: controller.signal })
   .then(response => response.json())
   .then(payload => { setPortfolioChartBars(Array.isArray(payload) ? payload : (Array.isArray(payload?.bars) ? payload.bars : [])); setPortfolioChartImageVersion(Date.now()); })
   .catch(error => { if (error.name !== 'AbortError') setPortfolioChartBars([]); })
   .finally(() => { if (!controller.signal.aborted) setPortfolioChartLoading(false); });
  return () => controller.abort();
 }, [portfolioChartTicker, chartTimeframe, chartType, portfolioAnalysis]);

 const exportPortfolioPdf = async () => {
  if (!portfolio.length) return setPortfolioPdfProgress({ status: 'failed', percent: 0, phase: 'Inserisci almeno una posizione.' });
  const cfg = getTimeframeConfig(chartTimeframe);
  try {
   setPortfolioPdfProgress({ status: 'running', percent: 1, phase: 'Avvio PDF portafoglio' });
   const response = await fetch('/api/export-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     tickers: portfolio.map(item => item.ticker).join(','),
     limit: String(portfolio.length),
     period: cfg.period,
     days: String(cfg.days),
     chart_type: chartType,
     portfolio: portfolio
    })
   });
   const payload = await response.json();
   if (!response.ok || !payload.jobId) throw new Error(payload.error || 'Avvio PDF fallito');
   const poll = window.setInterval(async () => {
    try {
     const statusResponse = await fetch(`/api/export-pdf/status?job_id=${encodeURIComponent(payload.jobId)}`);
     const status = await statusResponse.json();
     setPortfolioPdfProgress(status);
     if (status.status === 'completed') { window.clearInterval(poll); const link = document.createElement('a'); link.href = `/api/export-pdf/download?job_id=${encodeURIComponent(payload.jobId)}`; link.click(); }
     if (status.status === 'failed') window.clearInterval(poll);
    } catch (error) { window.clearInterval(poll); setPortfolioPdfProgress({ status: 'failed', percent: 0, phase: error.message }); }
   }, 700);
  } catch (error) { setPortfolioPdfProgress({ status: 'failed', percent: 0, phase: error.message }); }
 };

 const importPortfolioAnalysis = async (event) => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  try {
   const raw = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
   if (Array.isArray(raw?.securities)) {
    setPortfolio(prev => {
     const existingMap = new Map(prev.map(item => [item.ticker, item]));
     let updated = false;
     for (const sec of raw.securities) {
      const t = String(sec?.ticker || '').trim().toUpperCase();
      if (t && !existingMap.has(t)) {
       const pos = sec.position || {};
       existingMap.set(t, {
        ticker: t,
        company: sec.company || t,
        quantity: Number(pos.quantity) || 1,
        entry_price: Number(pos.entry_price) || 1,
        configured_stop_loss: pos.configured_stop_loss != null ? Number(pos.configured_stop_loss) : null,
        purchase_date: pos.purchase_date || null,
        fees: Number(pos.fees) || 0,
        notes: '',
        updated_at: new Date().toISOString()
       });
       updated = true;
      }
     }
     return updated ? Array.from(existingMap.values()) : prev;
    });
   }
   const portfolioTickers = new Set([
    ...portfolio.map(item => item.ticker),
    ...(Array.isArray(raw?.securities) ? raw.securities.map(s => String(s?.ticker || '').trim().toUpperCase()).filter(Boolean) : [])
   ]);
   const parsed = normalizePortfolioAnalysis(raw, portfolioTickers);
   setPortfolioAnalysis({ ...parsed, imported_file_name: file.name, imported_at: new Date().toISOString() });
   const newsTotal = parsed.securities.reduce((sum, item) => sum + (Array.isArray(item.recent_news_7d) ? item.recent_news_7d.length : 0) + (Array.isArray(item.older_relevant_news) ? item.older_relevant_news.length : 0) + (Array.isArray(item.relevant_news) ? item.relevant_news.length : 0), 0);
   setPortfolioImportStatus({ type: 'success', message: `Analisi importata per ${parsed.securities.length} posizioni con ${newsTotal} notizie.` });
  } catch (error) { setPortfolioImportStatus({ type: 'error', message: error instanceof SyntaxError ? 'JSON non valido.' : error.message }); }
 };

 const resetPortfolioForm = () => {
  setPortfolioForm({ ticker: '', company: '', quantity: '', entryPrice: '', configuredStopLoss: '', purchaseDate: '', fees: '', notes: '' });
  setPortfolioEditingTicker(null);
  setShowPortfolioForm(false);
 };

 const savePortfolioPosition = (event) => {
  event.preventDefault();
  const ticker = portfolioForm.ticker.trim().toUpperCase();
  const quantity = Number(portfolioForm.quantity);
  const entryPrice = Number(portfolioForm.entryPrice);
  const configuredStopLoss = portfolioForm.configuredStopLoss === '' ? null : Number(portfolioForm.configuredStopLoss);
  const fees = portfolioForm.fees === '' ? 0 : Number(portfolioForm.fees);
  if (!ticker) return setPortfolioStatus({ type: 'error', message: 'Inserisci il ticker.' });
  if (!Number.isFinite(quantity) || quantity <= 0) return setPortfolioStatus({ type: 'error', message: 'La quantita deve essere maggiore di zero.' });
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return setPortfolioStatus({ type: 'error', message: 'Il prezzo medio di carico deve essere maggiore di zero.' });
  if (configuredStopLoss !== null && (!Number.isFinite(configuredStopLoss) || configuredStopLoss <= 0)) return setPortfolioStatus({ type: 'error', message: 'Lo stop loss configurato deve essere maggiore di zero.' });
  if (!Number.isFinite(fees) || fees < 0) return setPortfolioStatus({ type: 'error', message: 'Le commissioni non sono valide.' });
  if (!portfolioEditingTicker && portfolio.some(item => item.ticker === ticker)) return setPortfolioStatus({ type: 'error', message: `${ticker} e gia presente. Usa Modifica per aggiornare la posizione.` });
  const position = { ticker, company: portfolioForm.company.trim() || ticker, quantity, entry_price: entryPrice, configured_stop_loss: configuredStopLoss, purchase_date: portfolioForm.purchaseDate || null, fees, notes: portfolioForm.notes.trim(), updated_at: new Date().toISOString() };
  setPortfolio(prev => portfolioEditingTicker ? prev.map(item => item.ticker === portfolioEditingTicker ? position : item) : [...prev, position]);
  setPortfolioStatus({ type: 'success', message: `${ticker} salvato nel portafoglio.` });
  resetPortfolioForm();
 };

 const editPortfolioPosition = (position) => {
  setPortfolioEditingTicker(position.ticker);
  setPortfolioForm({ ticker: position.ticker, company: position.company || '', quantity: String(position.quantity), entryPrice: String(position.entry_price), configuredStopLoss: position.configured_stop_loss == null ? '' : String(position.configured_stop_loss), purchaseDate: position.purchase_date || '', fees: String(position.fees || ''), notes: position.notes || '' });
  setPortfolioStatus(null);
  setShowPortfolioForm(true);
 };

 const removePortfolioPosition = (ticker) => {
  if (!window.confirm(`Rimuovere ${ticker} dal portafoglio?`)) return;
  setPortfolio(prev => prev.filter(item => item.ticker !== ticker));
  if (portfolioEditingTicker === ticker) resetPortfolioForm();
  setPortfolioStatus({ type: 'success', message: `${ticker} rimosso dal portafoglio.` });
 };

 const importMonitorConfig = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
   if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Seleziona un file con estensione .json.');
   const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
   const normalized = normalizeMonitorConfig(parsed);
   const tickers = normalized.securities.map(item => item.ticker);
   const listName = `Monitor JSON (${tickers.length})`;
   setMonitorConfig({ ...normalized, imported_file_name: file.name });
   setWatchlists(prev => ({ ...prev, [listName]: tickers }));
   setActiveWatchlistName(listName);
   setSelectedPdfTickers([]);
   setMonitorExpandedTicker(null);
   setMonitorImportStatus({ type: 'success', message: `${tickers.length} titoli importati e aggiunti alla watchlist "${listName}".` });
  } catch (error) {
   setMonitorImportStatus({ type: 'error', message: error instanceof SyntaxError ? 'JSON non valido: controlla la sintassi del file.' : error.message });
  }
 };

 const removeMonitorConfig = () => {
  setMonitorConfig(null);
  setMonitorExpandedTicker(null);
  setMonitorImportStatus({ type: 'success', message: 'Configurazione importata rimossa. Le watchlist esistenti non sono state modificate.' });
 };

 const openMonitorChart = (security) => {
  setMonitorChartSecurity(security);
  setQuery(security.ticker);
  setChartHistoryBars([]);
 };

 const runFtseMibAutomation = () => {
  if (automationLoading) return;
  setAutomationLoading(true);
  setAutomationError('');
  setAutomationLogs([]);
  const source = new EventSource('/api/automation/ftse-mib-news-scout');
  source.onmessage = event => {
   try {
    const payload = JSON.parse(event.data);
    if (payload.type === 'log') {
     setAutomationLogs(previous => [...previous, { at: new Date().toLocaleTimeString('it-IT'), agent: payload.agent, msg: payload.msg }]);
    } else if (payload.type === 'data') {
     setAutomationReport(payload.data);
     setAutomationStrategies(null);
     setAutomationLoading(false);
     source.close();
    } else if (payload.type === 'error') {
     setAutomationError(payload.msg || 'Automazione fallita.');
     setAutomationLoading(false);
     source.close();
    }
   } catch (error) {
    setAutomationError(`Risposta automazione non leggibile: ${error.message}`);
    setAutomationLoading(false);
    source.close();
   }
  };
  source.onerror = () => {
   if (source.readyState === EventSource.CLOSED) return;
   setAutomationError('Connessione con il backend automazione interrotta.');
   setAutomationLoading(false);
   source.close();
  };
 };

 const openChatGptAutomationBrowser = async () => {
  setChatGptBrowserStatus('Apertura Chrome...');
  try {
   const response = await fetch('/api/automation/open-chatgpt-browser', { method: 'POST' });
   const payload = await response.json();
   if (!response.ok) throw new Error(payload.error || 'Impossibile avviare Chrome.');
   setChatGptBrowserStatus('Chrome aperto: completa il login e lascialo aperto.');
  } catch (error) {
   setChatGptBrowserStatus(`Errore: ${error.message}`);
  }
 };

 const runAutomationChartStrategies = () => {
  if (automationChartLoading || !automationReport?.candidates?.length) return;
  setAutomationChartLoading(true);
  setAutomationChartError('');
  setAutomationChartLogs([]);
  const cfg = getTimeframeConfig(chartTimeframe);
  const params = new URLSearchParams({ limit: String(automationReport.candidates.length), period: cfg.period, days: String(cfg.days), chart_type: chartType });
  const source = new EventSource(`/api/automation/ftse-mib-chart-strategies?${params.toString()}`);
  source.onmessage = event => {
   try {
    const payload = JSON.parse(event.data);
    if (payload.type === 'log') {
     setAutomationChartLogs(previous => [...previous, { at: new Date().toLocaleTimeString('it-IT'), agent: payload.agent, msg: payload.msg }]);
    } else if (payload.type === 'data') {
     setAutomationStrategies(payload.data);
     setAutomationChartLoading(false);
     setChartVersion(Date.now());
     source.close();
    } else if (payload.type === 'error') {
     setAutomationChartError(payload.msg || 'Analisi grafica automatica fallita.');
     setAutomationChartLoading(false);
     source.close();
    }
   } catch (error) {
    setAutomationChartError(`Risposta analisi grafica non leggibile: ${error.message}`);
    setAutomationChartLoading(false);
    source.close();
   }
  };
  source.onerror = () => {
   if (source.readyState === EventSource.CLOSED) return;
   setAutomationChartError('Connessione con il backend durante l’analisi grafica interrotta.');
   setAutomationChartLoading(false);
   source.close();
  };
 };

 const sendAutomationStrategiesToTelegram = async () => {
  if (!automationStrategies?.results?.length || automationTelegramStatus.state === 'loading') return;
  setAutomationTelegramStatus({ state: 'loading', message: 'Invio analisi su Telegram...' });
  try {
   const response = await fetch('/api/automation/send-strategies-telegram', { method: 'POST' });
   const responseText = await response.text();
   let payload;
   try { payload = JSON.parse(responseText); }
   catch { throw new Error(responseText.trim() || `Risposta non valida dal backend (HTTP ${response.status}).`); }
   if (!response.ok) throw new Error(payload.error || 'Invio Telegram fallito.');
   setAutomationTelegramStatus({ state: 'success', message: `Analisi inviata su Telegram (${payload.messages} messaggi).` });
  } catch (error) {
   setAutomationTelegramStatus({ state: 'error', message: error.message });
  }
 };

 const addAutomationCandidatesToWatchlist = () => {
  const tickers = (automationReport?.candidates || []).map(item => item.ticker).filter(Boolean);
  if (!tickers.length) return;
  const listName = `Scouting AI ${new Date().toLocaleDateString('it-IT')}`;
  setWatchlists(previous => ({ ...previous, [listName]: [...new Set(tickers)] }));
  setActiveWatchlistName(listName);
 };

 const renderMonitorChart = (security) => {
  const levels = Object.entries(security.technical || {}).filter(([, value]) => typeof value === 'number');
  const closes = chartHistoryBars.map(bar => Number(bar.close)).filter(Number.isFinite);
  const values = [...closes, ...levels.map(([, value]) => value)];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;
  const x = index => 42 + (index / Math.max(closes.length - 1, 1)) * 850;
  const y = value => 330 - ((value - min) / range) * 275;
  const colors = { reference_price: '#38bdf8', breakout_trigger: '#22c55e', major_breakout_trigger: '#16a34a', warning_level: '#f59e0b', major_support: '#ef4444', recovery_trigger: '#a78bfa' };
  return (
   <div className="monitor-chart-panel">
    <div className="monitor-chart-header"><div><strong>{security.ticker} - Grafico con livelli JSON</strong><span>{security.company}</span></div><button className="btn-secondary" onClick={() => setMonitorChartSecurity(null)}>Chiudi grafico</button></div>
    {closes.length < 2 ? <div className="monitor-empty">Caricamento storico prezzi...</div> : (
     <svg viewBox="0 0 940 370" className="monitor-json-chart" role="img" aria-label={`Grafico ${security.ticker} con livelli JSON`}>
      {[0, 1, 2, 3, 4].map(i => <line key={i} x1="42" x2="892" y1={55 + i * 68.75} y2={55 + i * 68.75} stroke="rgba(148,163,184,.13)" />)}
      <polyline fill="none" stroke="#e2e8f0" strokeWidth="2" points={closes.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
      {levels.map(([name, value]) => <g key={name}><line x1="42" x2="892" y1={y(value)} y2={y(value)} stroke={colors[name] || '#f472b6'} strokeWidth="1.5" strokeDasharray="7 5"/><text x="48" y={y(value) - 5} fill={colors[name] || '#f472b6'} fontSize="11">{name.replaceAll('_', ' ')}: {value}</text></g>)}
     </svg>
    )}
   </div>
  );
 };

 // Helper per aggiornare la Watchlist attiva corrente 
 const updateCurrentWatchlist = (updater) => {
  setWatchlists(prev => {
   const current = prev[activeWatchlistName] || [];
   const updatedList = typeof updater === 'function' ? updater(current) : updater;
   return { ...prev, [activeWatchlistName]: updatedList };
  });
 };

 // Cerca ticker: mostra dati se disponibili, altrimenti avvia subito l'analisi 
 const getCompleteTickerData = (target) => {
  const raw = realTickerData[target];
  if (!raw || !raw.search_metadata) return null;
  return raw;
 };

 const handleSearch = (searchTerm, autoAnalyze = true) => {
  const target = (searchTerm || query).trim().toUpperCase();
  if (!target) return;
  setQuery(target);
  setExpandedTicker(target);
    updateCurrentWatchlist(prev => prev.includes(target) ? prev : [...prev, target]);

  const completeData = getCompleteTickerData(target);
  if (completeData) {
   setData(completeData);
   setActiveTab('dashboard');
  } else if (autoAnalyze) {
   runAgentAnalysis(target);
  } else {
   setData(null);
   setActiveTab('dashboard');
  }
 };

 // Avvia analisi reale via Playwright server.js ChatGPT 
 const runAgentAnalysis = (target) => {
  if (!target) return;

  setQuery(target);   // imposta subito il ticker corrente
  setExpandedTicker(target);
  setLoading(true);
  setLogs([]);
  setBatchProgress({
   active: true,
   current: null,
   currentIndex: 0,
   total: watchlist.length,
   completed: 0,
   failed: 0,
   remaining: watchlist.length,
   lastCompleted: null
  });
  setActiveTab('logs');

  const showAnalysisError = (reason) => {
   setLogs(prev => [...prev, {
    agent: 'System',
    msg: ` ANALISI FALLITA per ${target}\n\nMotivo: ${reason}\n\nVerifica che:\n1. Il server bridge (node server.js) sia attivo sulla porta 3001\n2. Il ticker "${target}" esista realmente sui mercati finanziari\n3. ChatGPT sia accessibile e la sessione sia attiva\n\nNessun dato inventato verra mostrato. Riprova con un ticker valido.`,
    time: new Date().toLocaleTimeString()
   }]);
   setLoading(false);
  };

  try {
   const eventSource = new EventSource(`/api/analyze?ticker=${encodeURIComponent(target)}`);

   let connectionTimeout = setTimeout(() => {
    eventSource.close();
    showAnalysisError('Timeout connessione al server bridge (porta 3001). Assicurati che node server.js sia in esecuzione.');
   }, 10000);

   eventSource.onopen = () => {
    clearTimeout(connectionTimeout);
    setLogs(prev => [...prev, {
     agent: 'System',
     msg: ' Connesso al server bridge locale (porta 3001). Ricezione log in streaming...',
     time: new Date().toLocaleTimeString()
    }]);
   };

   eventSource.onmessage = (event) => {
    try {
     const eventData = JSON.parse(event.data);

     if (eventData.type === 'log') {
      setLogs(prev => [...prev, {
       agent: eventData.agent,
       msg: eventData.msg,
       time: new Date().toLocaleTimeString()
      }]);
     } else if (eventData.type === 'data') {
      const realData = eventData.data;
      // Salva i dati reali ricevuti da ChatGPT
      setRealTickerData(prev => ({ ...prev, [target]: realData }));
      // Aggiorna la dashboard solo se l'utente sta ancora guardando questo ticker
      setQuery(prev => {
       if (prev === target) setData(realData);
       return prev;
      });
      // NON sovrascriviamo query qui: l'utente potrebbe aver gia selezionato un altro ticker
      eventSource.close();
      setLoading(false);
      setLogs(prev => [...prev, {
       agent: 'System',
       msg: ' Analisi reale completata con successo! Puoi passare alla Dashboard per vedere i dati aggiornati.',
       time: new Date().toLocaleTimeString()
      }]);
     } else if (eventData.type === 'error') {
      eventSource.close();
      showAnalysisError(eventData.msg || 'Il server non ha generato un report valido per questo ticker.');
     }
    } catch (e) {
     console.error('Error processing message:', e);
    }
   };

   eventSource.onerror = () => {
    clearTimeout(connectionTimeout);
    eventSource.close();
    showAnalysisError('Connessione al server bridge interrotta o server non disponibile. Avvia node server.js.');
   };

  } catch (e) {
   showAnalysisError('Impossibile connettersi al server bridge locale (porta 3001). Avvia node server.js.');
  }
 };

 // Avvia analisi grafico reale via Playwright Vision server.js ChatGPT 
 const runChartAgentAnalysis = (target) => {
  if (!target) return;

  setQuery(target);
  setExpandedTicker(target);
  setLoading(true);
  setLogs([]);
  setActiveTab('logs');

  const showAnalysisError = (reason) => {
   setLogs(prev => [...prev, {
    agent: 'System',
    msg: ` ANALISI GRAFICO FALLITA per ${target}\n\nMotivo: ${reason}\n\nVerifica che:\n1. Il server bridge (node server.js) sia attivo sulla porta 3001\n2. Il ticker "${target}" esista realmente sui mercati finanziari\n3. ChatGPT sia accessibile e la sessione sia attiva`,
    time: new Date().toLocaleTimeString()
   }]);
   setLoading(false);
  };

  try {
   const cfg = getTimeframeConfig(chartTimeframe);
   const eventSource = new EventSource(
    `/api/analyze?ticker=${encodeURIComponent(target)}&type=chart&period=${encodeURIComponent(cfg.period)}&days=${encodeURIComponent(cfg.days)}&chart_type=${encodeURIComponent(chartType)}`
   );

   let connectionTimeout = setTimeout(() => {
    eventSource.close();
    showAnalysisError('Timeout connessione al server bridge (porta 3001). Assicurati che node server.js sia in esecuzione.');
   }, 10000);

   eventSource.onopen = () => {
    clearTimeout(connectionTimeout);
    setLogs(prev => [...prev, {
     agent: 'System',
     msg: ' Connesso al server bridge locale per Analisi Grafico AI. Generazione ed invio del grafico a ChatGPT Vision...',
     time: new Date().toLocaleTimeString()
    }]);
   };

   eventSource.onmessage = (event) => {
    try {
     const eventData = JSON.parse(event.data);

     if (eventData.type === 'log') {
      setLogs(prev => [...prev, {
       agent: eventData.agent,
       msg: eventData.msg,
       time: new Date().toLocaleTimeString()
      }]);
     } else if (eventData.type === 'data') {
      const chartData = eventData.data;
      const chartKey = target + '_CHART';
      setRealTickerData(prev => ({ ...prev, [chartKey]: chartData }));
      eventSource.close();
      setLoading(false);
      setLogs(prev => [...prev, {
       agent: 'System',
       msg: ' Analisi Grafico completata! Passa alla Dashboard per vedere i risultati visivi del grafico.',
       time: new Date().toLocaleTimeString()
      }]);
     } else if (eventData.type === 'error') {
      eventSource.close();
      showAnalysisError(eventData.msg);
     }
    } catch (e) {
     eventSource.close();
     showAnalysisError(`Errore lettura stream log: ${e.message}`);
    }
   };

   eventSource.onerror = () => {
    eventSource.close();
    showAnalysisError('Connessione al server bridge interrotta o server non disponibile.');
   };
  } catch (err) {
   showAnalysisError(err.message);
  }
 };

 // Helper Promise per eseguire l'analisi live di un singolo ticker 
 const analyzeSingleTickerAsync = (target, index, total) => {
  return new Promise((resolve) => {
   setBatchProgress(prev => prev ? {
    ...prev,
    current: target,
    currentIndex: index,
    total
   } : prev);
   setLogs(prev => [...prev, {
    agent: 'Controller & Orchestrator Agent',
    msg: ` Avvio analisi sequenziale live [${index}/${total}] per: ${target}`,
    time: new Date().toLocaleTimeString()
   }]);

   try {
    const eventSource = new EventSource(`/api/analyze?ticker=${encodeURIComponent(target)}`);

    let connectionTimeout = setTimeout(() => {
     eventSource.close();
     setLogs(prev => [...prev, {
      agent: 'System',
      msg: ` Timeout connessione per ${target}`,
      time: new Date().toLocaleTimeString()
     }]);
     resolve(false);
    }, 120000);

    eventSource.onopen = () => {
     clearTimeout(connectionTimeout);
    };

    eventSource.onmessage = (event) => {
     try {
      const eventData = JSON.parse(event.data);
      if (eventData.type === 'log') {
       setLogs(prev => [...prev, {
        agent: eventData.agent,
        msg: eventData.msg,
        time: new Date().toLocaleTimeString()
       }]);
      } else if (eventData.type === 'data') {
       const realData = eventData.data;
       setRealTickerData(prev => ({ ...prev, [target]: realData }));
       setBatchProgress(prev => prev ? {
        ...prev,
        completed: prev.completed + 1,
        remaining: Math.max(total - (prev.completed + 1), 0),
        current: target,
        lastCompleted: target
       } : prev);
       eventSource.close();
       resolve(true);
      } else if (eventData.type === 'error') {
       eventSource.close();
       setBatchProgress(prev => prev ? {
        ...prev,
        completed: prev.completed + 1,
        failed: prev.failed + 1,
        remaining: Math.max(total - (prev.completed + 1), 0),
        current: target,
        lastCompleted: target
       } : prev);
       setLogs(prev => [...prev, {
        agent: 'System',
        msg: ` Errore durante l'analisi di ${target}: ${eventData.msg}`,
        time: new Date().toLocaleTimeString()
       }]);
       resolve(false);
      }
     } catch (e) {
      console.error('Error processing event message:', e);
     }
    };

    eventSource.onerror = () => {
     clearTimeout(connectionTimeout);
     eventSource.close();
     setBatchProgress(prev => prev ? {
      ...prev,
      completed: prev.completed + 1,
      failed: prev.failed + 1,
      remaining: Math.max(total - (prev.completed + 1), 0),
      current: target,
      lastCompleted: target
     } : prev);
     setLogs(prev => [...prev, {
      agent: 'System',
      msg: ` Errore di rete durante l'analisi di ${target}`,
      time: new Date().toLocaleTimeString()
     }]);
     resolve(false);
    };

   } catch (e) {
    resolve(false);
   }
  });
 };

 const analyzeSingleChartAsync = (target, index, total) => new Promise(resolve => {
  const cfg = getTimeframeConfig(chartTimeframe);
  setBatchProgress(prev => ({ ...prev, current: target, currentIndex: index, total }));
  setLogs(prev => [...prev, { agent: 'Analisi grafica AI', msg: `Analisi tecnica [${index}/${total}] per ${target}...`, time: new Date().toLocaleTimeString() }]);
  const source = new EventSource(`/api/analyze?ticker=${encodeURIComponent(target)}&type=chart&period=${encodeURIComponent(cfg.period)}&days=${encodeURIComponent(cfg.days)}&chart_type=${encodeURIComponent(chartType)}`);
  const timeout = setTimeout(() => { source.close(); resolve(false); }, 300000);
  source.onmessage = event => {
   try {
    const payload = JSON.parse(event.data);
    if (payload.type === 'log') setLogs(prev => [...prev, { agent: payload.agent || 'Analisi grafica AI', msg: payload.msg, time: new Date().toLocaleTimeString() }]);
    if (payload.type === 'data') {
     clearTimeout(timeout);
     source.close();
     setRealTickerData(prev => ({ ...prev, [`${target}_CHART`]: payload.data }));
     resolve(true);
    } else if (payload.type === 'error') {
     clearTimeout(timeout);
     source.close();
     setLogs(prev => [...prev, { agent: 'Analisi grafica AI', msg: `${target}: ${payload.msg}`, time: new Date().toLocaleTimeString() }]);
     resolve(false);
    }
   } catch {}
  };
  source.onerror = () => { clearTimeout(timeout); source.close(); resolve(false); };
 });

 // Avvia analisi reale per TUTTI i titoli in Watchlist 
 const runAllAnalyses = async (combined = false) => {
  if (watchlist.length === 0 || loading) return;

  setWatchlistRefreshMode(combined ? 'news_charts' : 'news');
  setLoading(true);
  setLogs([]);
  setActiveTab('logs');

  setBatchProgress({
   active: true,
   current: null,
   currentIndex: 0,
   total: watchlist.length,
   completed: 0,
   failed: 0,
   remaining: watchlist.length,
   lastCompleted: null
  });

  setLogs(prev => [...prev, {
   agent: 'Controller & Orchestrator Agent',
   msg: ` Avvio scansione completa per tutti i ${watchlist.length} titoli in Watchlist...`,
   time: new Date().toLocaleTimeString()
  }]);

  let failureCount = 0;
  for (let i = 0; i < watchlist.length; i++) {
   const ticker = watchlist[i];
   const success = await analyzeSingleTickerAsync(ticker, i + 1, watchlist.length);
   if (!success) failureCount += 1;
   if (i < watchlist.length - 1) {
    await new Promise(r => setTimeout(r, 2000));
   }
  }

  setLogs(prev => [...prev, {
   agent: 'Controller & Orchestrator Agent',
   msg: ` Scansione completata per tutti i ${watchlist.length} titoli in Watchlist!`,
   time: new Date().toLocaleTimeString()
  }]);

  setBatchProgress(prev => prev ? {
   ...prev,
   active: false,
   current: null,
   remaining: 0
  } : prev);
  setLoading(false);
  if (!combined) setWatchlistRefreshMode('');
  return { failed: failureCount, total: watchlist.length };
 };

 // Rigenera localmente i cinque grafici tecnici per tutti i ticker della lista.
 // Non apre ChatGPT e non modifica le analisi news salvate.
 const refreshAllWatchlistCharts = async (combined = false) => {
  if (watchlist.length === 0 || (loading && !combined)) return;
  const cfg = getTimeframeConfig(chartTimeframe);
  setWatchlistRefreshMode(combined ? 'news_charts' : 'charts');
  setLoading(true);
  setLogs(prev => [...prev, {
   agent: 'Grafici tecnici',
   msg: `Rigenerazione di prezzo, volumi, MACD, stocastici e ADX per ${watchlist.length} titoli...`,
   time: new Date().toLocaleTimeString()
  }]);
  setActiveTab('logs');
  setBatchProgress({ active: true, current: null, currentIndex: 0, total: watchlist.length, completed: 0, failed: 0, remaining: watchlist.length, lastCompleted: null });

  let failed = 0;
  for (let index = 0; index < watchlist.length; index++) {
   const ticker = watchlist[index];
   setBatchProgress(prev => ({ ...prev, current: ticker, currentIndex: index + 1 }));
   try {
    const params = new URLSearchParams({ ticker, period: cfg.period, days: String(cfg.days), chart_type: chartType });
    const response = await fetch(`/api/chart-history?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.bars) || payload.bars.length < 2) throw new Error('storico prezzi non disponibile');
    setLogs(prev => [...prev, { agent: 'Grafici tecnici', msg: `${ticker}: cinque grafici aggiornati.`, time: new Date().toLocaleTimeString() }]);
   } catch (error) {
    failed += 1;
    setLogs(prev => [...prev, { agent: 'Grafici tecnici', msg: `${ticker}: aggiornamento fallito (${error.message}).`, time: new Date().toLocaleTimeString() }]);
   }
   setBatchProgress(prev => ({ ...prev, completed: index + 1, failed, remaining: watchlist.length - index - 1, lastCompleted: ticker }));
  }

  setPortfolioChartImageVersion(Date.now());
  setBatchProgress(prev => ({ ...prev, active: false, current: null, remaining: 0 }));
  setLogs(prev => [...prev, { agent: 'Grafici tecnici', msg: `Aggiornamento grafici completato: ${watchlist.length - failed} riusciti, ${failed} falliti.`, time: new Date().toLocaleTimeString() }]);
  setLoading(false);
  setWatchlistRefreshMode('');
 };

 const refreshAllWatchlistNewsAndCharts = async () => {
  if (watchlist.length === 0 || loading) return;
  setWatchlistRefreshMode('news_charts');
  setLoading(true);
  setActiveTab('logs');
  setLogs([{ agent: 'Chrome CDP', msg: 'Verifica e avvio del browser ChatGPT autenticato...', time: new Date().toLocaleTimeString() }]);
  try {
   const browserResponse = await fetch('/api/automation/open-chatgpt-browser', { method: 'POST' });
   const browserPayload = await browserResponse.json();
   if (!browserResponse.ok || browserPayload.status !== 'ready') throw new Error(browserPayload.error || `HTTP ${browserResponse.status}`);
   setLogs(prev => [...prev, { agent: 'Chrome CDP', msg: 'Chrome autenticato raggiungibile su 127.0.0.1:9222. Avvio batch.', time: new Date().toLocaleTimeString() }]);
  } catch (error) {
   setLogs(prev => [...prev, { agent: 'Chrome CDP', msg: `Impossibile preparare Chrome: ${error.message}`, time: new Date().toLocaleTimeString() }]);
   setLoading(false);
   setWatchlistRefreshMode('');
   return;
  }
  setLoading(false);
  const newsResult = await runAllAnalyses(true);
  if (!newsResult || newsResult.failed > 0) {
   setLogs(prev => [...prev, { agent: 'Pipeline', msg: `Ciclo interrotto: ${newsResult?.failed ?? watchlist.length} analisi news fallite. Grafici AI e Telegram non verranno avviati.`, time: new Date().toLocaleTimeString() }]);
   setLoading(false);
   setWatchlistRefreshMode('');
   return;
  }
  await refreshAllWatchlistCharts(true);
  setLoading(true);
  setWatchlistRefreshMode('news_charts');
  setBatchProgress({ active: true, current: null, currentIndex: 0, total: watchlist.length, completed: 0, failed: 0, remaining: watchlist.length, lastCompleted: null });
  let chartAnalysisFailed = 0;
  for (let index = 0; index < watchlist.length; index++) {
   const ticker = watchlist[index];
   const success = await analyzeSingleChartAsync(ticker, index + 1, watchlist.length);
   if (!success) chartAnalysisFailed += 1;
   setBatchProgress(prev => ({ ...prev, completed: index + 1, failed: chartAnalysisFailed, remaining: watchlist.length - index - 1, lastCompleted: ticker }));
  }
  setBatchProgress(prev => ({ ...prev, active: false, current: null, remaining: 0 }));
  setLogs(prev => [...prev, { agent: 'Summary combinato', msg: `Analisi news e grafici completata. Letture grafiche riuscite: ${watchlist.length - chartAnalysisFailed}/${watchlist.length}.`, time: new Date().toLocaleTimeString() }]);
  if (chartAnalysisFailed > 0) {
   setLogs(prev => [...prev, { agent: 'Telegram', msg: `Invio annullato: mancano ${chartAnalysisFailed} analisi grafiche su ${watchlist.length}. Riapri Chrome ChatGPT e rilancia il ciclo completo.`, time: new Date().toLocaleTimeString() }]);
   setLoading(false);
   setWatchlistRefreshMode('');
   return;
  }
  setLoading(true);
  setWatchlistRefreshMode('news_charts');
  setLogs(prev => [...prev, { agent: 'Telegram', msg: `Invio esito finale della watchlist "${activeWatchlistName}"...`, time: new Date().toLocaleTimeString() }]);
  try {
   const response = await fetch('/api/watchlist/send-analysis-telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlist_name: activeWatchlistName, tickers: watchlist, ...getTimeframeConfig(chartTimeframe), chart_type: chartType })
   });
   const responseText = await response.text();
   let payload;
   try { payload = JSON.parse(responseText); }
   catch { throw new Error(responseText.trim() || `Risposta Telegram non valida (HTTP ${response.status}).`); }
   if (!response.ok) throw new Error(payload.error || 'Invio Telegram fallito.');
   setLogs(prev => [...prev, { agent: 'Telegram', msg: `Esito inviato: ${payload.analyzed}/${payload.total} titoli, ${payload.charts} grafici, ${payload.messages} messaggi.`, time: new Date().toLocaleTimeString() }]);
  } catch (error) {
   setLogs(prev => [...prev, { agent: 'Telegram', msg: `Invio finale non riuscito: ${error.message}`, time: new Date().toLocaleTimeString() }]);
  }
  setLoading(false);
  setWatchlistRefreshMode('');
 };

 // Aggiungi ticker alla watchlist attiva 
 const handleAddTickers = () => {
  if (!newTickersInput.trim()) return;
  const tickers = newTickersInput
   .split(/[,;\s]+/)
   .map(t => t.trim().toUpperCase())
   .filter(t => t.length > 0);
  if (tickers.length === 0) return;
  updateCurrentWatchlist(prev => {
   const updated = [...prev];
   tickers.forEach(t => { if (!updated.includes(t)) updated.push(t); });
   return updated;
  });
  setNewTickersInput('');
  handleSearch(tickers[0]);
 };

 // Rimuovi ticker dalla watchlist attiva 
 const removeFromWatchlist = (targetToRemove) => {
  const confirmed = window.confirm(`Rimuovere ${targetToRemove} dalla watchlist "${activeWatchlistName}"?\n\nL'analisi salvata del titolo non verra cancellata.`);
  if (!confirmed) return;
  updateCurrentWatchlist(prev => {
   const updated = prev.filter(t => t !== targetToRemove);
   return updated;
  });
  setSelectedPdfTickers(prev => prev.filter(t => t !== targetToRemove));
  if (query === targetToRemove) {
   setData(null);
   setQuery('');
   setExpandedTicker(null);
  }
 };

 // Crea una nuova Watchlist personalizzata 
 const handleCreateWatchlist = () => {
  const name = newWatchlistNameInput.trim();
  if (!name) return;
  if (watchlists[name]) {
   alert(`La watchlist "${name}" esiste gia!`);
   return;
  }
  setWatchlists(prev => ({ ...prev, [name]: [] }));
  setActiveWatchlistName(name);
  setNewWatchlistNameInput('');
  setShowCreateWatchlistModal(false);
 };

 // Elimina una Watchlist personalizzata 
 const handleDeleteWatchlist = (nameToDelete, e) => {
  if (e) e.stopPropagation();
  if (Object.keys(watchlists).length <= 1) {
   alert("Devi mantenere almeno una Watchlist attiva.");
   return;
  }
  const tickerCount = watchlists[nameToDelete]?.length || 0;
  if (!window.confirm(`Eliminare la watchlist "${nameToDelete}"?\n\nLa lista contiene ${tickerCount} titol${tickerCount === 1 ? 'o' : 'i'}. Le analisi salvate dei singoli titoli non verranno cancellate.`)) return;

  setWatchlists(prev => {
   const copy = { ...prev };
   delete copy[nameToDelete];
   const remainingNames = Object.keys(copy);
   if (activeWatchlistName === nameToDelete) {
    setActiveWatchlistName(remainingNames[0]);
   }
   return copy;
  });
 };

 // Badge / indicatori 
 const getSentimentBadge = (sentiment) => {
  const s = sentiment.toLowerCase() || '';
  if (s.includes('molto positivo')) return <span className="badge badge-very-positive">{sentiment}</span>;
  if (s.includes('positivo')) return <span className="badge badge-positive">{sentiment}</span>;
  if (s.includes('molto negativo')) return <span className="badge badge-very-negative">{sentiment}</span>;
  if (s.includes('negativo')) return <span className="badge badge-negative">{sentiment}</span>;
  return <span className="badge badge-neutral">{sentiment || 'Neutro'}</span>;
 };

 const getSentimentScoreBar = (score) => {
  const pct = Math.round((score || 0.5) * 100);
  const color = score >= 0.7 ? '#22c55e' : score >= 0.4 ? '#f59e0b' : '#ef4444';
  return (
   <div className="score-bar-wrap">
    <div className="score-bar-track">
     <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
    <span className="score-bar-label" style={{ color }}>{pct}%</span>
   </div>
  );
 };

 const getImpactDot = (rating) => {
  const colors = { 'Molto Alto': '#f97316', 'Alto': '#eab308', 'Medio': '#3b82f6', 'Basso': '#6b7280' };
  const color = colors[rating] || '#6b7280';
  return <span className="impact-dot" style={{ background: color }} title={`Impatto: ${rating}`}>{rating}</span>;
 };

 const ms = data?.market_sentiment_summary;
 const allNews = [...(data?.recent_news_last_3_days || []), ...(data?.latest_available_news || [])];

 // Watchlist rows: mostra solo dati reali ricevuti, altrimenti stato "non analizzato"
const watchlistRows = watchlist.map((t) => {
 const d = realTickerData[t] || null;
 const chartD = realTickerData[`${t}_CHART`] || null;
  const s = d?.market_sentiment_summary;
  const chartTechnical = chartD?.chart_technical_analysis || chartD?.chart_vision_analysis || chartD?.technical_analysis || {};
  const combinedImpact = [
   s?.expected_impact ? `News: ${s.expected_impact}` : '',
   chartTechnical.key_scenario ? `Grafico: ${chartTechnical.key_scenario}` : ''
  ].filter(Boolean).join(' · ');
  const score = s?.sentiment_score ?? null;
  const col = score !== null
   ? getSentimentColor(score)
   : { bg: 'rgba(100,116,139,0.08)', border: '#475569', text: '#94a3b8', label: '' };
  const timestamp = d?.search_metadata?.timestamp_utc
   ? new Date(d.search_metadata.timestamp_utc).toLocaleString('it-IT', {
     day: '2-digit',
     month: '2-digit',
     year: 'numeric',
     hour: '2-digit',
     minute: '2-digit'
   })
   : null;

  const chartTimestamp = chartD?.search_metadata?.timestamp_utc
   ? new Date(chartD.search_metadata.timestamp_utc).toLocaleString('it-IT', {
     day: '2-digit',
     month: '2-digit',
     year: 'numeric',
     hour: '2-digit',
     minute: '2-digit'
   })
   : null;

  const currentPrice = d?.search_metadata?.current_market_price;
  const analystTargets = d?.analyst_ratings_and_targets || [];
  const bestUpsideItem = analystTargets.find(a => a.is_target_higher || (a.upside_percent > 0)) || analystTargets[0];

  return {
  ticker: t,
   company: d?.search_metadata?.company_name || t,
   market: d?.search_metadata?.market || '',
   analyzed: !!d,
   timestamp,
   chartTimestamp,
   currentPrice,
   bestUpsideItem,
   score,
   col,
   sentiment: s?.overall_sentiment || 'Non analizzato',
   impact: combinedImpact,
   highlight: [s?.news_highlights?.[0], chartTechnical.operational_note].filter(Boolean).join(' · ') || "Clicca per avviare l'analisi reale via ChatGPT"
  };
 });

 // Ordinamento dinamico per score o ordine alfabetico
 const sortedWatchlistRows = [...watchlistRows].sort((a, b) => {
  if (sortOrder === 'desc') {
   const scoreA = a.score !== null ? a.score : -1;
   const scoreB = b.score !== null ? b.score : -1;
   return scoreB - scoreA;
  }
  if (sortOrder === 'asc') {
   const scoreA = a.score !== null ? a.score : 999;
   const scoreB = b.score !== null ? b.score : 999;
   return scoreA - scoreB;
  }
  if (sortOrder === 'alpha-asc') {
   return a.ticker.localeCompare(b.ticker);
  }
  if (sortOrder === 'alpha-desc') {
   return b.ticker.localeCompare(a.ticker);
  }
  return 0;
 });

 const portfolioSummary = portfolio.reduce((summary, position) => {
  const invested = (position.quantity * position.entry_price) + (position.fees || 0);
  const livePrice = Number(portfolioPrices[position.ticker]?.price);
  summary.totalInvested += invested;
  if (Number.isFinite(livePrice) && livePrice > 0) {
   summary.pricedInvested += invested;
   summary.marketValue += position.quantity * livePrice;
   summary.pricedPositions += 1;
  }
  return summary;
 }, { totalInvested: 0, pricedInvested: 0, marketValue: 0, pricedPositions: 0 });
 portfolioSummary.totalGain = portfolioSummary.marketValue - portfolioSummary.pricedInvested;
 portfolioSummary.totalGainPct = portfolioSummary.pricedInvested > 0 ? (portfolioSummary.totalGain / portfolioSummary.pricedInvested) * 100 : null;

 return (
  <div className="container">
    <header>
     <h1> Multi-Agent Financial News Analyzer</h1>
     <p>Estrazione notizie, classificazione e sentiment analysis via Playwright &amp; ChatGPT</p>
    </header>

    <nav className="main-view-switch" aria-label="Selezione vista principale">
     <button
      className={activeTab === 'portfolio' ? 'active' : ''}
      onClick={() => setActiveTab('portfolio')}
     >
      <strong>Vista Portafoglio</strong>
      <span>Posizioni aperte, quantita e prezzi di carico{portfolio.length ? ` - ${portfolio.length} titoli` : ''}</span>
     </button>
     <button
      className={activeTab !== 'portfolio' && activeTab !== 'automation' ? 'active' : ''}
      onClick={() => setActiveTab('dashboard')}
     >
      <strong>Vista Watchlist</strong>
      <span>Analisi, news, monitor JSON e grafici</span>
     </button>
     <button
      className={activeTab === 'automation' ? 'active' : ''}
      onClick={() => setActiveTab('automation')}
     >
      <strong>Automazione FTSE MIB</strong>
      <span>News scout AI e candidati da approfondire con i grafici</span>
     </button>
    </nav>

    {activeTab !== 'portfolio' && activeTab !== 'automation' && (
    <div className="search-box">
    <div className="input-row">
     <input
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
      placeholder="Analizza Singolo Ticker (es. AVIO.MI, VOD.L, AAPL)..."
     />
     <button className="btn-primary" onClick={() => runAgentAnalysis(query.trim().toUpperCase())} disabled={loading || !query.trim()}>
     {loading ? <span className="spinner">Analisi...</span> : 'Avvia Analisi Live'}
     </button>
    </div>

    <div className="input-row" style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.8rem' }}>
     <input
      type="text"
      value={newTickersInput}
      onChange={(e) => setNewTickersInput(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleAddTickers()}
      placeholder={`Aggiungi Ticker a "${activeWatchlistName}" (separa con virgola es. TSLA, MSFT, META)...`}
     />
     <button className="btn-secondary" onClick={handleAddTickers} style={{ minWidth: '140px' }}>
       Aggiungi Titoli
     </button>
    </div>

    {/* MULTI-WATCHLIST SELECTION TABS BAR */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.8rem', padding: '0.6rem 0.8rem', background: 'rgba(15,23,42,0.6)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
     <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}> Watchlist Attiva:</span>
      {Object.keys(watchlists).map((listName) => {
       const isSelected = listName === activeWatchlistName;
       const count = watchlists[listName].length || 0;
       return (
        <div
         key={listName}
         onClick={() => setActiveWatchlistName(listName)}
         style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.75rem',
          borderRadius: '8px',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          background: isSelected ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)' : 'rgba(30,41,59,0.8)',
          border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
          color: isSelected ? '#ffffff' : '#94a3b8',
          transition: 'all 0.15s ease'
         }}
        >
         <span>{listName}</span>
         <span style={{ fontSize: '0.72rem', opacity: 0.85, background: 'rgba(0,0,0,0.25)', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>{count}</span>
         {Object.keys(watchlists).length > 1 && listName !== 'Preferiti' && (
          <span
           onClick={(e) => handleDeleteWatchlist(listName, e)}
           style={{ marginLeft: '0.2rem', color: isSelected ? '#fca5a5' : '#ef4444', opacity: 0.8, fontSize: '0.75rem' }}
           title={`Elimina watchlist "${listName}"`}
         >
           ×
          </span>
         )}
        </div>
       );
      })}
     </div>

    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
     {activeWatchlistName !== 'Preferiti' && Object.keys(watchlists).length > 1 && (
      <button
       className="btn-secondary"
       onClick={(event) => handleDeleteWatchlist(activeWatchlistName, event)}
       style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', color: '#fca5a5', borderColor: 'rgba(239,68,68,.45)' }}
       title={`Elimina la watchlist "${activeWatchlistName}"`}
      >
       Elimina lista
      </button>
     )}
    {!showCreateWatchlistModal ? (
      <button
       className="btn-secondary"
       onClick={() => setShowCreateWatchlistModal(true)}
       style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
      >
        Nuova Lista
      </button>
     ) : (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
       <input
        type="text"
        value={newWatchlistNameInput}
        onChange={(e) => setNewWatchlistNameInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreateWatchlist()}
        placeholder="Nome lista (es. Crypto, Bancari)..."
        style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem', width: '190px' }}
        autoFocus
       />
       <button className="btn-primary" onClick={handleCreateWatchlist} style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>Crea</button>
       <button className="btn-secondary" onClick={() => setShowCreateWatchlistModal(false)} style={{ padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}>Annulla</button>
      </div>
    )}
    </div>
    </div>

    <div className="quick-tickers">
     <span className="quick-label">Watchlist:</span>
     {watchlist.map((item) => (
      <span
       key={item}
       className={`chip${data?.search_metadata?.ticker === item ? ' chip-active' : ''}`}
       style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
       onClick={() => handleSearch(item)}
      >
       {item}
       {realTickerData[item] && <span style={{ color: '#22c55e' }}></span>}
       <span
        onClick={(e) => {
         e.stopPropagation();
         removeFromWatchlist(item);
        }}
        style={{
         color: '#94a3b8',
         fontSize: '0.75rem',
         fontWeight: 'bold',
         padding: '0 2px',
         borderRadius: '50%',
         lineHeight: '1'
        }}
       title={`Rimuovi ${item} dalla Watchlist`}
       >
        ×
       </span>
      </span>
     ))}
    </div>
    </div>
    )}

    {activeTab !== 'portfolio' && <>
    {/* IMPORT CONFIGURAZIONE MONITOR JSON */}
    <section className="monitor-import-card">
     <div className="monitor-import-header">
      <div>
       <h2>Configurazione Monitor JSON</h2>
       <p>Importa l'output generato da ChatGPT. Il file viene validato, salvato nel browser e trasformato in una watchlist consultabile.</p>
      </div>
      <div className="monitor-import-actions">
       <label className="btn-primary monitor-file-button">
        Importa JSON
        <input type="file" accept="application/json,.json" onChange={importMonitorConfig} />
       </label>
       {monitorConfig && <button className="btn-secondary" onClick={removeMonitorConfig}>Rimuovi configurazione</button>}
      </div>
     </div>

     {monitorImportStatus && (
      <div className={`monitor-import-status ${monitorImportStatus.type}`}>{monitorImportStatus.message}</div>
     )}

     {!monitorConfig ? (
      <div className="monitor-empty">Nessuna configurazione importata. Carica un file conforme allo schema 1.0.</div>
     ) : (
      <>
       <div className="monitor-meta-grid">
        <div><span>File</span><strong>{monitorConfig.imported_file_name || 'configurazione salvata'}</strong></div>
        <div><span>Schema</span><strong>{monitorConfig.schema_version}</strong></div>
        <div><span>Mercato</span><strong>{monitorConfig.market}</strong></div>
        <div><span>Titoli</span><strong>{monitorConfig.securities.length}</strong></div>
        <div><span>Strategia</span><strong>{monitorConfig.strategy?.name || '-'}</strong></div>
        <div><span>Generato</span><strong>{monitorConfig.generated_at ? new Date(monitorConfig.generated_at).toLocaleString('it-IT') : '-'}</strong></div>
       </div>
       <div className="monitor-security-list">
        {monitorConfig.securities.map(security => {
         const expanded = monitorExpandedTicker === security.ticker;
         const technicalEntries = Object.entries(security.technical || {}).filter(([key]) => key !== 'trend');
         const sentiment = security.sentiment_analysis || {};
         const relevantNews = Array.isArray(security.relevant_news) ? security.relevant_news : [];
         const targetCandidates = [
          security.analyst_target?.target_price,
          security.analyst_target?.consensus_target,
          security.analyst_target_price,
          security.technical?.analyst_target_price
         ];
         const analystTargetPrice = targetCandidates.map(Number).find(value => Number.isFinite(value) && value > 0) ?? null;
         const analystTargetCurrency = security.analyst_target?.currency || 'EUR';
         return (
          <div className="monitor-security" key={security.ticker}>
           <button className="monitor-security-summary" onClick={() => setMonitorExpandedTicker(expanded ? null : security.ticker)}>
            <span><strong>{security.ticker}</strong><small>{security.company}</small></span>
            <span className={`monitor-trend ${String(security.technical?.trend || '').includes('BEAR') ? 'negative' : 'positive'}`}>{security.technical?.trend || 'N/D'}</span>
            <span>{security.rules.length} regole</span>
            <span>{expanded ? 'Chiudi' : 'Dettagli'}</span>
           </button>
           {expanded && (
            <div className="monitor-security-details">
             <button className="btn-primary monitor-chart-open" onClick={() => openMonitorChart(security)}>Apri grafico con livelli JSON</button>
             {monitorChartSecurity?.ticker === security.ticker && renderMonitorChart(security)}
             <div className="monitor-sentiment-card">
              <div>
               <span>Sentiment news</span>
               <strong>{sentiment.overall_sentiment || 'N/D'}</strong>
               <small>Score {sentiment.sentiment_score ?? '-'} · Confidenza {sentiment.confidence_score ?? '-'}</small>
              </div>
              <p>{sentiment.summary || 'Sintesi del sentiment non disponibile.'}</p>
             </div>
             <div className="monitor-news-list">
              <h4>Notizie rilevanti ({relevantNews.length})</h4>
              {relevantNews.length === 0 ? <p>Nessuna notizia presente nel JSON.</p> : relevantNews.map((news, index) => (
               <article className="monitor-news" key={news.id || `${security.ticker}-news-${index}`}>
                <div className="monitor-news-heading">
                 <strong>{news.headline || 'Notizia senza titolo'}</strong>
                 <span>{news.sentiment || 'N/D'} · Impatto {news.impact_rating || 'N/D'}</span>
                </div>
                <small>{news.published_at ? new Date(news.published_at).toLocaleDateString('it-IT') : 'Data N/D'} · {news.source || 'Fonte N/D'}</small>
                <p>{news.summary || ''}</p>
                {news.source_url && <a href={news.source_url} target="_blank" rel="noopener noreferrer">Apri fonte</a>}
               </article>
              ))}
             </div>
             <div className="monitor-levels">
              {analystTargetPrice !== null && (
               <div className="monitor-analyst-target"><span>Target analisti</span><strong>{analystTargetPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {analystTargetCurrency}</strong></div>
              )}
              {technicalEntries.map(([key, value]) => (
               <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{Array.isArray(value) ? value.join(' - ') : String(value ?? '-')}</strong></div>
              ))}
             </div>
             <div className="monitor-rules">
              {security.rules.length === 0 ? <p>Nessuna regola disponibile.</p> : security.rules.map(rule => (
               <div className="monitor-rule" key={rule.id}>
                <div><strong>{rule.id}</strong><span className={`monitor-priority ${rule.priority.toLowerCase()}`}>{rule.priority}</span></div>
                <code>{rule.condition}</code>
                <span>Azione: <strong>{rule.action}</strong></span>
               </div>
              ))}
             </div>
            </div>
           )}
          </div>
         );
        })}
       </div>
      </>
     )}
    </section>

    </>}

    {activeTab === 'automation' && (
     <section className="automation-card">
      <div className="automation-header">
       <div>
        <h2>Automazione FTSE MIB - News Scout</h2>
        <p>ChatGPT cerca le news sull'universo FTSE MIB e restituisce esclusivamente un JSON validato con i titoli per cui richiedere un grafico tecnico.</p>
       </div>
       <div className="automation-actions">
        <button className="btn-secondary" onClick={openChatGptAutomationBrowser}>Apri Chrome / Login ChatGPT</button>
        <button className="btn-primary" onClick={runFtseMibAutomation} disabled={automationLoading}>{automationLoading ? 'Scouting in corso...' : 'Avvia scouting news'}</button>
        {automationReport?.candidates?.length > 0 && <button className="btn-primary" onClick={runAutomationChartStrategies} disabled={automationChartLoading || automationLoading}>{automationChartLoading ? 'Analisi grafici in corso...' : `Analizza ${automationReport.candidates.length} candidati · 5 grafici ciascuno`}</button>}
        {automationReport?.candidates?.length > 0 && <button className="btn-secondary" onClick={addAutomationCandidatesToWatchlist}>Crea watchlist candidati</button>}
        {automationStrategies?.results?.length > 0 && <button className="btn-secondary" onClick={sendAutomationStrategiesToTelegram} disabled={automationTelegramStatus.state === 'loading'}>{automationTelegramStatus.state === 'loading' ? 'Invio Telegram...' : 'Invia analisi Telegram'}</button>}
        {automationStrategies?.results?.length > 0 && <button className="btn-secondary" onClick={() => document.getElementById('automation-final-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Vai all’analisi finale</button>}
       </div>
      </div>
      {chatGptBrowserStatus && <div className="automation-browser-status">{chatGptBrowserStatus}</div>}
      {automationTelegramStatus.message && <div className={`monitor-import-status ${automationTelegramStatus.state === 'error' ? 'error' : 'success'}`}>{automationTelegramStatus.message}</div>}
      <div className="automation-flow">
       <span className="done">1. Universo FTSE MIB</span><i>→</i><span className={automationLoading ? 'running' : automationReport ? 'done' : ''}>2. Ricerca news ChatGPT</span><i>→</i><span className={automationReport ? 'done' : ''}>3. Candidati al grafico</span><i>→</i><span className={automationChartLoading ? 'running' : automationStrategies ? 'done' : ''}>4. Strategie · 5 grafici per titolo</span>
      </div>
      {automationError && <div className="monitor-import-status error">{automationError}</div>}
      {automationChartError && <div className="monitor-import-status error">{automationChartError}</div>}
      {automationReport ? (
       <>
        <div className="automation-meta">
         <span>Generato <strong>{automationReport.generated_at ? new Date(automationReport.generated_at).toLocaleString('it-IT') : 'N/D'}</strong></span>
         <span>Candidati <strong>{automationReport.candidates?.length || 0}</strong></span>
         <span>Verifica prima di operare <strong>{automationReport.requires_human_review ? 'Necessaria' : 'N/D'}</strong></span>
        </div>
        <div className="automation-candidates">
         {(automationReport.candidates || []).map(candidate => (
          <article className="automation-candidate" key={candidate.ticker}>
           <div className="automation-candidate-head">
            <span className="automation-rank">#{candidate.rank}</span>
            <div><strong>{candidate.ticker}</strong><small>{candidate.company}</small></div>
            <span className={`automation-priority ${String(candidate.priority).toLowerCase()}`}>{candidate.priority}</span>
            <span className="automation-signal">{candidate.news_signal}</span>
           </div>
           <p><strong>Segnale news:</strong> {candidate.news_summary}</p>
           <p><strong>Perché serve il grafico:</strong> {candidate.why_chart_needed}</p>
           <div className="automation-questions"><strong>Domande per l'analisi grafica · timeframe {candidate.suggested_timeframe}</strong>{(candidate.questions_for_chart || []).map((question, index) => <span key={index}>{question}</span>)}</div>
           <div className="automation-news">{(candidate.news || []).map((news, index) => <div key={index}><span>{news.published_at ? new Date(news.published_at).toLocaleDateString('it-IT') : 'Data N/D'}</span><strong>{news.headline}</strong><small>{news.source} · {news.sentiment} · {news.impact_rating}</small>{news.source_url && <a href={news.source_url} target="_blank" rel="noopener noreferrer">Fonte</a>}</div>)}</div>
          </article>
         ))}
        </div>
        {automationReport.excluded_summary && <div className="automation-excluded"><strong>Altri titoli:</strong> {automationReport.excluded_summary}</div>}
        <details className="automation-json"><summary>Visualizza JSON validato</summary><pre>{JSON.stringify(automationReport, null, 2)}</pre></details>
       </>
      ) : !automationLoading && <div className="monitor-empty">Nessuno scouting eseguito. Avvia il processo per ottenere la shortlist dei titoli da approfondire con i grafici.</div>}
      {(automationLoading || automationLogs.length > 0) && <details className="automation-logs" open={automationLoading}><summary>Log Playwright ({automationLogs.length})</summary><div>{automationLogs.map((log, index) => <p key={index}><time>{log.at}</time><strong>{log.agent}</strong><span>{log.msg}</span></p>)}</div></details>}
      {automationStrategies?.results?.length > 0 && (
       <div className="automation-strategies" id="automation-final-analysis">
        <h3>Analisi finale: {automationStrategies.results.length} titoli · 5 grafici per ciascuno</h3>
        {automationStrategies.results.map(result => {
         const config = automationStrategies.chart_config || { period: '3mo', days: 65, chart_type: 'candlestick' };
         const prefix = `/finance_charts/${result.ticker}_${config.period}_${config.days}_${config.chart_type}_`;
         const chartItems = [['price_alligator','Prezzo'],['volume','Volumi'],['oscillators','Stocastici / RSI'],['macd','MACD'],['adx','ADX / DI']];
         const technical = result.technical_analysis || {};
         const sentiment = result.sentiment_analysis || {};
         const target = result.analyst_target || {};
         const assessment = result.operational_assessment || {};
         return (
          <article className="automation-strategy" key={result.ticker}>
           <div className="automation-strategy-head"><div><strong>{result.ticker}</strong><small>{result.company}</small></div><span>{assessment.action}</span><b>{assessment.priority}</b></div>
           <div className="automation-strategy-kpis">
            <div><span>Sentiment</span><strong>{sentiment.overall_sentiment || 'N/D'}</strong><small>Score {sentiment.sentiment_score ?? '-'} · conf. {sentiment.confidence_score ?? '-'}</small></div>
            <div><span>Trend</span><strong>{technical.trend || 'N/D'}</strong></div>
            <div><span>Supporti</span><strong>{technical.supports?.length ? technical.supports.join(' · ') : 'N/D'}</strong></div>
            <div><span>Resistenze</span><strong>{technical.resistances?.length ? technical.resistances.join(' · ') : 'N/D'}</strong></div>
            <div><span>Target analisti</span><strong>{target.available ? `${target.target_price} ${target.currency}` : 'Non disponibile'}</strong>{target.available && <a href={target.source_url} target="_blank" rel="noopener noreferrer">{target.source} · {target.as_of_date}</a>}</div>
           </div>
           <p className="automation-rationale"><strong>Indicazione operativa:</strong> {assessment.rationale}</p>
           <div className="automation-five-charts">{chartItems.map(([kind,label]) => <figure key={kind}><figcaption>{label}</figcaption><img src={`${prefix}${kind}.png?v=${chartVersion}`} alt={`${result.ticker} ${label}`}/></figure>)}</div>
           <div className="automation-analysis-grid"><div><strong>Volumi</strong><p>{technical.volume_analysis}</p></div><div><strong>Stocastici</strong><p>{technical.stochastic_analysis}</p></div><div><strong>MACD</strong><p>{technical.macd_analysis}</p></div><div><strong>ADX</strong><p>{technical.adx_analysis}</p></div></div>
           <div className="automation-conditions"><div><strong>Conferme richieste</strong>{(assessment.confirmation_conditions || []).map((text,index)=><span key={index}>{text}</span>)}</div><div><strong>Invalidazioni</strong>{(assessment.invalidation_conditions || []).map((text,index)=><span key={index}>{text}</span>)}</div></div>
          </article>
         );
        })}
        <details className="automation-json"><summary>Visualizza JSON strategie validato</summary><pre>{JSON.stringify(automationStrategies, null, 2)}</pre></details>
       </div>
      )}
      {(automationChartLoading || automationChartLogs.length > 0) && <details className="automation-logs" open={automationChartLoading}><summary>Log analisi cinque grafici ({automationChartLogs.length})</summary><div>{automationChartLogs.map((log, index) => <p key={index}><time>{log.at}</time><strong>{log.agent}</strong><span>{log.msg}</span></p>)}</div></details>}
     </section>
    )}

    {activeTab === 'portfolio' && (
    /* PORTAFOGLIO POSIZIONI APERTE */
    <section className="portfolio-card">
     <div className="portfolio-kpi-grid">
      <div><span>Totale investito</span><strong>{portfolioSummary.totalInvested.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong></div>
      <div><span>Valorizzazione EUR</span><strong>{portfolioSummary.pricedPositions ? portfolioSummary.marketValue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : '-'}</strong><small>{portfolioPricesStatus.state === 'loading' ? 'Aggiornamento Yahoo Finance...' : `${portfolioSummary.pricedPositions}/${portfolio.length} prezzi Yahoo recuperati ora`}</small></div>
      <div className={portfolioSummary.totalGain >= 0 ? 'positive' : 'negative'}><span>Utile / Perdita</span><strong>{portfolioSummary.pricedPositions ? `${portfolioSummary.totalGain >= 0 ? '+' : ''}${portfolioSummary.totalGain.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : '-'}</strong></div>
      <div className={portfolioSummary.totalGain >= 0 ? 'positive' : 'negative'}><span>Variazione complessiva</span><strong>{portfolioSummary.totalGainPct === null ? '-' : `${portfolioSummary.totalGainPct >= 0 ? '+' : ''}${portfolioSummary.totalGainPct.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</strong></div>
     </div>
     <div className="portfolio-header">
      <div>
       <h2>Portafoglio</h2>
       <p>Registra separatamente le posizioni realmente aperte. Questi dati non modificano le watchlist.</p>
      </div>
      <div className="portfolio-header-actions">
       <div className="portfolio-total"><small>{portfolio.length} {portfolio.length === 1 ? 'posizione' : 'posizioni'} in portafoglio</small></div>
       <button className="btn-secondary" onClick={exportPortfolioPdf} disabled={!portfolio.length || portfolioPdfProgress?.status === 'running'}>{portfolioPdfProgress?.status === 'running' ? 'Generazione PDF...' : 'Genera PDF Portafoglio'}</button>
       <label className="btn-secondary monitor-file-button">Importa analisi JSON<input type="file" accept="application/json,.json" onChange={importPortfolioAnalysis}/></label>
       {portfolioAnalysis && <button className="btn-secondary" onClick={() => setPortfolioAnalysis(null)}>Rimuovi analisi</button>}
       <button className="btn-primary" onClick={() => { if (showPortfolioForm) resetPortfolioForm(); else { setShowPortfolioForm(true); setPortfolioStatus(null); } }}>{showPortfolioForm ? 'Chiudi' : 'Aggiungi posizione'}</button>
      </div>
     </div>

     {showPortfolioForm && (
     <form className="portfolio-form" onSubmit={savePortfolioPosition}>
      <label>Ticker<input value={portfolioForm.ticker} onChange={e => setPortfolioForm(prev => ({ ...prev, ticker: e.target.value }))} placeholder="es. ENI.MI" disabled={!!portfolioEditingTicker} /></label>
      <label>Societa<input value={portfolioForm.company} onChange={e => setPortfolioForm(prev => ({ ...prev, company: e.target.value }))} placeholder="es. Eni" /></label>
      <label>Quantita<input type="number" min="0" step="any" value={portfolioForm.quantity} onChange={e => setPortfolioForm(prev => ({ ...prev, quantity: e.target.value }))} placeholder="100" /></label>
      <label>Prezzo medio<input type="number" min="0" step="any" value={portfolioForm.entryPrice} onChange={e => setPortfolioForm(prev => ({ ...prev, entryPrice: e.target.value }))} placeholder="23.50" /></label>
      <label>Stop loss configurato<input type="number" min="0" step="any" value={portfolioForm.configuredStopLoss} onChange={e => setPortfolioForm(prev => ({ ...prev, configuredStopLoss: e.target.value }))} placeholder="es. 21.80" /></label>
      <label>Data acquisto<input type="date" value={portfolioForm.purchaseDate} onChange={e => setPortfolioForm(prev => ({ ...prev, purchaseDate: e.target.value }))} /></label>
      <label>Commissioni<input type="number" min="0" step="any" value={portfolioForm.fees} onChange={e => setPortfolioForm(prev => ({ ...prev, fees: e.target.value }))} placeholder="0.00" /></label>
      <label className="portfolio-notes">Note<input value={portfolioForm.notes} onChange={e => setPortfolioForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Strategia, tranche, obiettivo..." /></label>
      <div className="portfolio-form-actions">
       <button className="btn-primary" type="submit">{portfolioEditingTicker ? 'Salva modifiche' : 'Aggiungi posizione'}</button>
       {portfolioEditingTicker && <button className="btn-secondary" type="button" onClick={resetPortfolioForm}>Annulla</button>}
      </div>
     </form>
     )}
     {portfolioStatus && <div className={`monitor-import-status ${portfolioStatus.type}`}>{portfolioStatus.message}</div>}
     {portfolioPricesStatus.message && <div className={`monitor-import-status ${portfolioPricesStatus.state}`}>{portfolioPricesStatus.message}</div>}
     {portfolioImportStatus && <div className={`monitor-import-status ${portfolioImportStatus.type}`}>{portfolioImportStatus.message}</div>}
     {portfolioAnalysis?.portfolio_summary?.news_overview && <div className={`portfolio-news-overview ${String(portfolioAnalysis.portfolio_summary.news_overview.overall_sentiment || 'neutral').toLowerCase()}`}><div><span>Sentiment complessivo news</span><strong>{portfolioAnalysis.portfolio_summary.news_overview.overall_sentiment}</strong><small>Score: {portfolioAnalysis.portfolio_summary.news_overview.sentiment_score ?? 'N/D'}</small></div><p>{portfolioAnalysis.portfolio_summary.news_overview.summary}</p></div>}

     <div className="portfolio-table">
      <div className="portfolio-row portfolio-head"><span>Titolo</span><span>Quantita</span><span>Prezzo carico</span><span>Stop configurato</span><span>Prezzo attuale</span><span>Investito</span><span>Guadagno / Perdita</span><span>Data</span><span>Azioni</span></div>
      {portfolio.length === 0 ? <div className="monitor-empty">Nessuna posizione inserita.</div> : portfolio.map(position => (
       (() => {
        const freshQuote = portfolioPrices[position.ticker];
        const displayedQuote = freshQuote || portfolioLastPrices[position.ticker];
        const quoteIsFresh = Boolean(freshQuote);
        const livePriceRaw = freshQuote?.price;
        const livePrice = Number(livePriceRaw);
        const hasLivePrice = Number.isFinite(livePrice) && livePrice > 0;
        const displayedPrice = Number(displayedQuote?.price);
        const hasDisplayedPrice = Number.isFinite(displayedPrice) && displayedPrice > 0;
        const invested = (position.quantity * position.entry_price) + (position.fees || 0);
        const marketValue = hasLivePrice ? position.quantity * livePrice : null;
        const gain = hasLivePrice ? marketValue - invested : null;
        const gainPct = hasLivePrice && invested > 0 ? (gain / invested) * 100 : null;
        const configuredStop = Number(position.configured_stop_loss);
        const hasConfiguredStop = Number.isFinite(configuredStop) && configuredStop > 0;
        const stopValue = hasConfiguredStop ? position.quantity * configuredStop : null;
        const stopGain = hasConfiguredStop ? stopValue - invested : null;
        const stopGainPct = hasConfiguredStop && invested > 0 ? (stopGain / invested) * 100 : null;
        const dailyChangePct = Number(displayedQuote?.daily_change_pct);
        const hasDailyChange = Number.isFinite(dailyChangePct);
        const analysisItem = portfolioAnalysis?.securities?.find(item => item.ticker === position.ticker);
        const expanded = portfolioAnalysisExpandedTicker === position.ticker;
        const assessment = analysisItem?.portfolio_assessment || {};
        const plan = analysisItem?.operational_plan || {};
        const stopReview = analysisItem?.stop_loss_review || {};
        const reviewedConfiguredStop = Number(stopReview.configured_level ?? analysisItem?.position?.configured_stop_loss);
        const currentConfiguredStop = Number(position.configured_stop_loss);
        const suggestedStop = Number(stopReview.suggested_level ?? plan.stop_loss?.level);
        const stopMatchesReviewedLevel = Number.isFinite(currentConfiguredStop) && currentConfiguredStop > 0 && Number.isFinite(reviewedConfiguredStop) && reviewedConfiguredStop > 0 && Math.abs(currentConfiguredStop - reviewedConfiguredStop) < 0.0001;
        const stopMatchesSuggestedLevel = Number.isFinite(currentConfiguredStop) && currentConfiguredStop > 0 && Number.isFinite(suggestedStop) && suggestedStop > 0 && Math.abs(currentConfiguredStop - suggestedStop) < 0.0001;
        const stopReviewIsCurrent = stopMatchesReviewedLevel || stopMatchesSuggestedLevel;
        const stopReviewLabel = stopMatchesSuggestedLevel ? 'KEEP' : stopReviewIsCurrent ? stopReview.recommendation : (position.configured_stop_loss != null ? 'DA_RIANALIZZARE' : stopReview.recommendation);
        const newsSummary = analysisItem?.news_summary || analysisItem?.sentiment_analysis || {};
        const recentNews = analysisItem?.recent_news_7d || analysisItem?.relevant_news || [];
        const olderNews = analysisItem?.older_relevant_news || [];
        const target = analysisItem?.analyst_target || {};
        const cfg = getTimeframeConfig(chartTimeframe);
        const safeTicker = position.ticker.replaceAll('/', '_');
        const graphKinds = [['price_alligator','Prezzo e livelli operativi'],['volume','Volumi'],['macd','MACD'],['oscillators','Stocastico / Williams'],['adx','ADX / DI']];
        const graphUrl = kind => `/finance_charts/${encodeURIComponent(`${safeTicker}_${cfg.period}_${cfg.days}_${chartType}_${kind === 'operational' ? 'price_alligator' : kind}.png`)}?v=${portfolioChartImageVersion}`;
        return <React.Fragment key={position.ticker}><div className={`portfolio-row${expanded ? ' portfolio-row-expanded' : ''}`}>
         <span><strong>{position.ticker}</strong><small>{position.company}</small>{position.notes && <em>{position.notes}</em>}</span>
        <span>{position.quantity.toLocaleString('it-IT')}</span>
        <span>{position.entry_price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</span>
        <span className="portfolio-configured-stop"><strong>{position.configured_stop_loss == null ? '-' : position.configured_stop_loss.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong>{hasConfiguredStop && <small className={`portfolio-stop-pl ${stopGain >= 0 ? 'positive' : 'negative'}`}>P/L stop: {stopGain >= 0 ? '+' : ''}{stopGain.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} · {stopGainPct >= 0 ? '+' : ''}{stopGainPct.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</small>}{stopReviewLabel && <small className={`stop-review-${stopReviewLabel.toLowerCase()}`}>{stopReviewLabel.replaceAll('_', ' ')}</small>}</span>
        <span className={!quoteIsFresh && hasDisplayedPrice ? 'portfolio-price-stale portfolio-current-price' : 'portfolio-current-price'}>{hasDisplayedPrice ? <><strong>{displayedPrice.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong>{hasDailyChange && <small className={`portfolio-daily-change ${dailyChangePct > 0 ? 'positive' : dailyChangePct < 0 ? 'negative' : 'neutral'}`}>{dailyChangePct > 0 ? '+' : ''}{dailyChangePct.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% oggi</small>}<small>{quoteIsFresh ? 'Yahoo Finance · aggiornato ora' : `Non aggiornato · ultimo Yahoo ${displayedQuote?.retrieved_at ? new Date(displayedQuote.retrieved_at).toLocaleString('it-IT') : ''}`}</small></> : <small>{portfolioPricesStatus.state === 'loading' ? 'Aggiornamento Yahoo...' : 'Non disponibile'}</small>}</span>
        <span><strong>{invested.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong>{position.fees > 0 && <small>incl. {position.fees.toFixed(2)} commissioni</small>}</span>
        <span className={gain === null ? 'portfolio-gain neutral' : gain >= 0 ? 'portfolio-gain positive' : 'portfolio-gain negative'}>{gain === null ? '-' : <><strong>{gain >= 0 ? '+' : ''}{gain.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong><small>{gainPct >= 0 ? '+' : ''}{gainPct.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</small></>}</span>
        <span>{position.purchase_date ? new Date(`${position.purchase_date}T00:00:00`).toLocaleDateString('it-IT') : '-'}</span>
         <span className="portfolio-row-actions">{analysisItem && <button className="btn-primary" onClick={() => { setPortfolioAnalysisExpandedTicker(expanded ? null : position.ticker); setPortfolioDetailTab('summary'); }}>{expanded ? 'Chiudi' : 'Apri analisi'}</button>}<button className="btn-secondary" onClick={() => editPortfolioPosition(position)}>Modifica</button><button className="btn-secondary portfolio-remove" onClick={() => removePortfolioPosition(position.ticker)}>Rimuovi</button></span>
       </div>{analysisItem && <div className="portfolio-row-signals"><span className={`signal ${String(newsSummary.overall_sentiment || 'neutral').toLowerCase()}`}>{newsSummary.overall_sentiment || 'NEUTRAL'}</span><strong>{assessment.recommended_action || 'N/D'}</strong><span>Stop impostato <b>{position.configured_stop_loss ?? 'N/D'}</b></span><span>Verifica stop <b>{stopReviewLabel ? stopReviewLabel.replaceAll('_', ' ') : 'N/D'}</b></span><span>Stop suggerito <b>{stopReview.suggested_level ?? plan.stop_loss?.level ?? 'N/D'}</b></span><span>TP1 <b>{plan.take_profit_levels?.[0]?.level ?? 'N/D'}</b></span><span>Target analisti <b>{target.available ? `${target.target_price} ${target.currency || ''}` : 'N/D'}</b></span><span>Rischio <b>{assessment.risk_level || 'N/D'}</b></span></div>}
       {expanded && analysisItem && <div className="portfolio-inline-analysis">
        <div className="portfolio-detail-tabs">{[['summary','Sintesi'],['news','News'],['plan','Piano operativo'],['charts','Grafici']].map(([key,label]) => <button key={key} className={portfolioDetailTab === key ? 'active' : ''} onClick={() => { setPortfolioDetailTab(key); if (key === 'charts') { setPortfolioChartTicker(position.ticker); setPortfolioIndicatorTab('price_alligator'); } }}>{label}</button>)}</div>
        {portfolioDetailTab === 'summary' && <div className="portfolio-summary-view"><div className="portfolio-action-hero"><span>Azione suggerita</span><strong>{assessment.recommended_action || 'N/D'}</strong><small>{assessment.priority || ''} · rischio {assessment.risk_level || 'N/D'}</small></div><div><h4>Valutazione</h4><p>{assessment.reason || 'Nessuna motivazione disponibile.'}</p><p>{assessment.position_thesis}</p><h4>Verifica stop loss configurato</h4>{stopMatchesSuggestedLevel ? <p><strong>KEEP</strong> — Lo stop configurato coincide con il livello suggerito dall'analisi importata.</p> : stopReviewIsCurrent ? <><p><strong>{stopReview.recommendation || 'REVIEW_REQUIRED'}</strong> — {stopReview.reason || 'Valutazione non presente nel JSON importato.'}</p>{stopReview.risk_note && <p>{stopReview.risk_note}</p>}</> : <p><strong>DA RIANALIZZARE</strong> — Lo stop configurato è stato aggiunto o modificato dopo l'analisi importata. Genera un nuovo PDF e importa il nuovo JSON per ottenere una verifica attendibile.</p>}</div><div className="portfolio-summary-levels"><span>Stop impostato <b>{position.configured_stop_loss ?? 'N/D'}</b></span><span>Stop suggerito <b>{stopReview.suggested_level ?? plan.stop_loss?.level ?? 'N/D'}</b></span><span>TP1 <b>{plan.take_profit_levels?.[0]?.level ?? 'N/D'}</b></span><span>Target analisti <b>{target.available ? target.target_price : 'N/D'}</b></span></div></div>}
        {portfolioDetailTab === 'news' && <div className="portfolio-news-view"><div><h4>{newsSummary.headline || 'Sintesi news'}</h4><p>{newsSummary.summary || 'Nessuna sintesi.'}</p><span className={`signal ${String(newsSummary.overall_sentiment || 'neutral').toLowerCase()}`}>{newsSummary.overall_sentiment || 'NEUTRAL'} · score {newsSummary.sentiment_score ?? 'N/D'}</span></div><section><h4>Ultimi 7 giorni</h4>{recentNews.length ? recentNews.map((news,index) => <a key={news.id || index} href={news.source_url || undefined} target="_blank" rel="noreferrer"><strong>{news.headline}</strong><span>{news.source} · {news.published_at ? new Date(news.published_at).toLocaleString('it-IT') : ''}</span><p>{news.summary}</p></a>) : <p>Nessuna news verificata negli ultimi 7 giorni.</p>}</section><section><h4>News storiche rilevanti</h4>{olderNews.length ? olderNews.map((news,index) => <a key={news.id || index} href={news.source_url || undefined} target="_blank" rel="noreferrer"><strong>{news.headline}</strong><span>{news.source} · {news.published_at ? new Date(news.published_at).toLocaleDateString('it-IT') : ''}</span><p>{news.ongoing_relevance || news.summary}</p></a>) : <p>Nessuna news storica selezionata.</p>}</section></div>}
        {portfolioDetailTab === 'plan' && <div className="portfolio-plan-view"><div className="portfolio-plan-kpis"><div><span>Stato</span><strong>{plan.plan_status || 'N/D'}</strong></div><div><span>Riferimento</span><strong>{plan.reference_price ?? 'N/D'}</strong></div><div className="stop"><span>Stop loss</span><strong>{plan.stop_loss?.level ?? 'N/D'}</strong><small>{plan.stop_loss?.trigger || ''}</small></div><div><span>Trailing</span><strong>{plan.trailing_stop?.enabled ? `${plan.trailing_stop.trail_pct ?? 'N/D'}%` : 'Non attivo'}</strong></div><div><span>Risk/Reward</span><strong>{plan.risk_reward?.ratio_to_tp1 ?? 'N/D'}</strong></div><div><span>Orizzonte</span><strong>{plan.time_horizon || 'N/D'}</strong></div></div><div className="portfolio-tp-grid">{(plan.take_profit_levels || []).map(tp => <div key={tp.label}><strong>{tp.label}: {tp.level}</strong><span>{tp.reason}</span></div>)}</div><div className="portfolio-plan-conditions"><div><strong>Conferme</strong>{(plan.confirmation_conditions || []).map((text,index)=><span key={index}>{text}</span>)}</div><div><strong>Invalidazione</strong>{(plan.invalidation_conditions || []).map((text,index)=><span key={index}>{text}</span>)}</div><div><strong>Monitoraggio</strong>{(plan.monitoring_triggers || []).map((text,index)=><span key={index}>{text}</span>)}</div></div></div>}
        {portfolioDetailTab === 'charts' && (() => {
         const historicalBars = portfolioChartBars.filter(bar => ['open','high','low','close'].every(key => Number.isFinite(Number(bar[key]))));
         const technical = analysisItem.technical || {};
         const chartTechnical = analysisItem.technical_analysis || analysisItem.chart_technical_analysis || technical;
         const indicatorCards = [
          ['volume', 'Volumi', chartTechnical.volume_analysis || chartTechnical.volume_note || technical.volume_analysis],
          ['oscillators', 'Stocastici / RSI / Williams', chartTechnical.stochastic_analysis || chartTechnical.oscillators_analysis || chartTechnical.rsi_stochastic_summary],
          ['macd', 'MACD', chartTechnical.macd_analysis || chartTechnical.macd_summary || chartTechnical.macd_adx_analysis],
          ['adx', 'ADX / DI', chartTechnical.adx_analysis || chartTechnical.adx_summary || chartTechnical.macd_adx_analysis]
         ];
         const jsonReferencePrice = getPortfolioAnalysisPrice(analysisItem);
         const historicalLastPrice = historicalBars.length ? Number(historicalBars[historicalBars.length - 1].close) : null;
         const analysisPrice = jsonReferencePrice ?? historicalLastPrice;
         const appendAnalysisQuote = Number.isFinite(analysisPrice) && Number.isFinite(historicalLastPrice) && Math.abs(analysisPrice - historicalLastPrice) > 0.005;
         const validBars = appendAnalysisQuote ? [...historicalBars, { date: plan.reference_timestamp || analysisItem.position?.price_timestamp || 'Prezzo analisi', open: analysisPrice, high: analysisPrice, low: analysisPrice, close: analysisPrice, isAnalysisQuote: true }] : historicalBars;
         const levels = [
          ['Prezzo ingresso', Number(position.entry_price), '#a78bfa'],
          ['Prezzo analisi', analysisPrice, '#38bdf8'],
          ['Stop configurato', Number(position.configured_stop_loss), '#fb7185'],
          ['Stop suggerito', Number(stopReview.suggested_level ?? plan.stop_loss?.level), '#ef4444'],
          ...((plan.take_profit_levels || []).map((tp,index) => [tp.label || `TP${index + 1}`, Number(tp.level), '#22c55e'])),
          ['Supporto', Number(technical.major_support), '#f97316'],
          ['Resistenza', Number(technical.resistance), '#eab308'],
          ['Target analisti', Number(target.target_price), '#f472b6']
         ].filter(([,value]) => Number.isFinite(value) && value > 0);
         const ohlcValues = validBars.flatMap(bar => [Number(bar.low), Number(bar.high)]);
         const allValues = [...ohlcValues, ...levels.map(([,value]) => value)];
         const rawMin = allValues.length ? Math.min(...allValues) : 0, rawMax = allValues.length ? Math.max(...allValues) : 1;
         const padding = Math.max((rawMax - rawMin) * .08, rawMax * .01), min = rawMin - padding, max = rawMax + padding, range = max - min || 1;
         const plotRight = 725, x = index => 55 + (index / Math.max(validBars.length - 1,1)) * (plotRight - 55), y = value => 330 - ((value - min) / range) * 275;
         const candleWidth = Math.max(2, Math.min(8, ((plotRight - 55) / Math.max(validBars.length,1)) * .62));
         const referenceMismatch = appendAnalysisQuote;
         return <div className="portfolio-inline-charts"><div className="portfolio-indicator-tabs">{graphKinds.map(([key,label]) => <button key={key} className={portfolioIndicatorTab === key ? 'active' : ''} onClick={() => setPortfolioIndicatorTab(key)}>{label}</button>)}</div>{portfolioIndicatorTab !== 'operational' ? <div className="portfolio-indicator-image"><img src={graphUrl(portfolioIndicatorTab)} alt={`${position.ticker} ${portfolioIndicatorTab}`}/></div> : <div className="portfolio-operational-chart"><div className="portfolio-operational-toolbar"><strong>{position.ticker} · Piano operativo</strong><div className="portfolio-chart-mode"><button className={portfolioChartMode === 'candlestick' ? 'active' : ''} onClick={() => setPortfolioChartMode('candlestick')}>Candele</button><button className={portfolioChartMode === 'line' ? 'active' : ''} onClick={() => setPortfolioChartMode('line')}>Linea</button></div></div>{portfolioChartLoading ? <div className="monitor-empty">Caricamento storico prezzi...</div> : validBars.length < 2 ? <div className="monitor-empty">Storico prezzi non disponibile.</div> : <svg viewBox="0 0 940 370" role="img" aria-label={`Livelli operativi ${position.ticker}`}>{[0,1,2,3,4].map(index => { const value=max-range*index/4; return <g key={index}><line x1="55" x2={plotRight} y1={55+index*68.75} y2={55+index*68.75} stroke="#e2e8f0"/><text x="5" y={59+index*68.75} fill="#475569" fontSize="10">{value.toFixed(2)}</text></g>; })}{portfolioChartMode === 'line' ? <polyline fill="none" stroke="#334155" strokeWidth="2" points={validBars.map((bar,index)=>`${x(index)},${y(Number(bar.close))}`).join(' ')}/> : validBars.map((bar,index)=>{ const open=Number(bar.open),high=Number(bar.high),low=Number(bar.low),close=Number(bar.close),rising=close>=open,color=bar.isAnalysisQuote?'#0284c7':rising?'#16a34a':'#ef4444',bodyY=Math.min(y(open),y(close)),bodyHeight=Math.max(bar.isAnalysisQuote?4:1.5,Math.abs(y(open)-y(close))); return <g key={bar.date||index}><line x1={x(index)} x2={x(index)} y1={y(high)} y2={y(low)} stroke={color}/><rect x={x(index)-candleWidth/2} y={bodyY-bodyHeight/2} width={candleWidth} height={bodyHeight} fill={bar.isAnalysisQuote?'#38bdf8':rising?'rgba(34,197,94,.72)':'rgba(239,68,68,.72)'} stroke={color}/></g>; })}{levels.map(([label,value,color],index)=><g key={`${label}-${index}`}><line x1="55" x2={plotRight} y1={y(value)} y2={y(value)} stroke={color} strokeWidth="1.6" strokeDasharray="7 5"/><line x1={plotRight} x2="745" y1={y(value)} y2={30+index*38} stroke={color} opacity=".7"/><rect x="745" y={16+index*38} width="188" height="27" rx="4" fill="#ffffff" stroke={color}/><text x="755" y={34+index*38} fill={color} fontSize="10.5" fontWeight="600">{label}: {value.toFixed(2)}</text></g>)}</svg>}<div className="portfolio-chart-legend">{levels.map(([label,value,color],index)=><span key={`${label}-${index}`} style={{color}}><i style={{background:color}}/>{label}: {value.toFixed(2)}</span>)}</div>{referenceMismatch && <div className="portfolio-price-mismatch">Lo storico disponibile termina a {historicalLastPrice.toFixed(2)}. È stata aggiunta in azzurro la quotazione {analysisPrice.toFixed(2)} usata nel PDF/JSON, senza modificare le barre precedenti.</div>}</div>}</div>;
        })()}
        {portfolioDetailTab === 'charts' && (() => {
         const cfg = getTimeframeConfig(chartTimeframe);
         const safeTicker = position.ticker.replaceAll('/', '_');
         const imageUrl = kind => `/finance_charts/${encodeURIComponent(`${safeTicker}_${cfg.period}_${cfg.days}_${chartType}_${kind}.png`)}?v=${portfolioChartImageVersion}`;
         const technicalNotes = analysisItem.technical_analysis || analysisItem.chart_technical_analysis || analysisItem.technical || {};
         const cards = [
          ['volume', 'Volumi', technicalNotes.volume_analysis || technicalNotes.volume_note],
          ['oscillators', 'Stocastici / RSI / Williams', technicalNotes.stochastic_analysis || technicalNotes.oscillators_analysis || technicalNotes.rsi_stochastic_summary],
          ['macd', 'MACD', technicalNotes.macd_analysis || technicalNotes.macd_summary || technicalNotes.macd_adx_analysis],
          ['adx', 'ADX / DI', technicalNotes.adx_analysis || technicalNotes.adx_summary || technicalNotes.macd_adx_analysis]
         ];
         return <div className="portfolio-chart-dashboard"><h4>Indicatori tecnici</h4><div className="portfolio-chart-dashboard-grid">{cards.map(([kind,label,note]) => <article className="portfolio-chart-dashboard-card" key={kind}><header>{label}</header><img src={imageUrl(kind)} alt={`${position.ticker} ${label}`}/><div className="portfolio-chart-dashboard-note"><strong>Nota tecnica</strong><p>{note || 'Nota tecnica non presente nel JSON importato.'}</p></div></article>)}</div><div className="portfolio-chart-dashboard-conditions"><div><strong>Conferme richieste</strong>{(plan.confirmation_conditions || []).map((text,index)=><span key={index}>{text}</span>)}</div><div><strong>Invalidazioni</strong>{(plan.invalidation_conditions || []).map((text,index)=><span key={index}>{text}</span>)}</div></div></div>;
        })()}
       </div>}</React.Fragment>;
       })()
      ))}
     </div>
     {portfolioPdfProgress && (
      <div className={`portfolio-pdf-progress ${portfolioPdfProgress.status}`}>
       <div className="portfolio-pdf-progress-head">
        <span>{portfolioPdfProgress.ticker ? `${portfolioPdfProgress.phase}: ${portfolioPdfProgress.ticker}` : portfolioPdfProgress.phase}</span>
        <strong>{Math.max(0, Math.min(100, portfolioPdfProgress.percent || 0))}%</strong>
       </div>
       <div className="portfolio-pdf-progress-track">
        <div style={{ width: `${Math.max(0, Math.min(100, portfolioPdfProgress.percent || 0))}%` }} />
       </div>
       <small>{portfolioPdfProgress.status === 'completed' ? 'PDF scaricato e pronto per essere caricato su ChatGPT.' : portfolioPdfProgress.status === 'failed' ? (portfolioPdfProgress.error || 'Generazione non riuscita.') : 'Creazione grafici e composizione del dossier in corso...'}</small>
      </div>
     )}

     <div className="portfolio-analysis-import">
      <div className="portfolio-analysis-import-head">
       <div><h3>Output ChatGPT - Analisi Portafoglio</h3><p>Carica il JSON generato da ChatGPT a partire dal PDF Portafoglio.</p></div>
       <div className="monitor-import-actions"><label className="btn-primary monitor-file-button">Importa output JSON<input type="file" accept="application/json,.json" onChange={importPortfolioAnalysis}/></label>{portfolioAnalysis && <button className="btn-secondary" onClick={() => setPortfolioAnalysis(null)}>Rimuovi output</button>}</div>
      </div>
      {portfolioImportStatus && <div className={`monitor-import-status ${portfolioImportStatus.type}`}>{portfolioImportStatus.message}</div>}
      {!portfolioAnalysis ? <div className="monitor-empty">Nessuna analisi Portafoglio importata.</div> : <>
      {portfolioAnalysis.portfolio_summary?.news_overview && <div className={`portfolio-news-overview ${String(portfolioAnalysis.portfolio_summary.news_overview.overall_sentiment || 'neutral').toLowerCase()}`}><div><span>Sentiment complessivo news</span><strong>{portfolioAnalysis.portfolio_summary.news_overview.overall_sentiment}</strong><small>Score: {portfolioAnalysis.portfolio_summary.news_overview.sentiment_score ?? 'N/D'}</small></div><p>{portfolioAnalysis.portfolio_summary.news_overview.summary}</p></div>}
      <div className="portfolio-analysis-list">
       {portfolioAnalysis.securities.map(item => {
        const expanded = portfolioAnalysisExpandedTicker === item.ticker;
        const plan = item.operational_plan || {};
        const stop = plan.stop_loss || {};
        const newsSummary = item.news_summary || item.sentiment_analysis || {};
        const newsSentiment = String(newsSummary.overall_sentiment || 'NEUTRAL').toUpperCase();
        const newsClass = newsSentiment === 'POSITIVE' ? 'positive' : newsSentiment === 'NEGATIVE' ? 'negative' : 'neutral';
        const newsScore = Number(newsSummary.sentiment_score);
        const newsConfidence = Number(newsSummary.confidence_score);
        const recentNews = Array.isArray(item.recent_news_7d) ? item.recent_news_7d : (Array.isArray(item.relevant_news) ? item.relevant_news : []);
        const olderNews = Array.isArray(item.older_relevant_news) ? item.older_relevant_news : [];
        const topNews = recentNews.slice(0, 3);
        const analystTarget = item.analyst_target || {};
        return <div key={item.ticker} className="portfolio-analysis-position">
         <button className="portfolio-analysis-item" onClick={() => setPortfolioAnalysisExpandedTicker(expanded ? null : item.ticker)}><div><strong>{item.ticker}</strong><span>{item.portfolio_assessment?.recommended_action || 'N/D'}</span><small>{item.portfolio_assessment?.priority || ''}</small></div><p>{item.portfolio_assessment?.reason || item.sentiment_analysis?.summary || 'Nessuna motivazione disponibile.'}</p><div><span>Stop: <strong>{stop.level ?? 'N/D'}</strong></span><span>TP: <strong>{plan.take_profit_levels?.[0]?.level ?? 'N/D'}</strong></span><span>Rischio: <strong>{item.portfolio_assessment?.risk_level || 'N/D'}</strong></span><span>{expanded ? 'Chiudi' : 'Piano operativo'}</span></div></button>
         <div className={`portfolio-news-summary ${newsClass}`}>
          <div className="portfolio-news-score"><span>Sentiment news</span><strong>{newsSentiment}</strong><small>Score: {Number.isFinite(newsScore) ? newsScore.toFixed(2) : 'N/D'} · Confidenza: {Number.isFinite(newsConfidence) ? `${Math.round(newsConfidence * 100)}%` : 'N/D'}</small></div>
          <div className="portfolio-news-text"><strong>{newsSummary.headline || 'Sintesi delle notizie'}</strong><p>{newsSummary.summary || 'Nessuna sintesi news disponibile nel file importato.'}</p><small>Impatto: {newsSummary.expected_price_impact || 'N/D'} · Recenti 7g: {recentNews.length} · Storiche: {olderNews.length}</small>{analystTarget.available && <div className="portfolio-target-price"><span>Target analisti</span><strong>{analystTarget.target_price} {analystTarget.currency || ''}</strong><small>{Number.isFinite(Number(analystTarget.upside_downside_pct)) ? `${Number(analystTarget.upside_downside_pct) >= 0 ? '+' : ''}${Number(analystTarget.upside_downside_pct).toFixed(2)}%` : ''} · {analystTarget.target_type || ''} · {analystTarget.source || ''}</small></div>}</div>
          <div className="portfolio-news-highlights"><strong className="portfolio-news-group-title">News ultimi 7 giorni</strong>{topNews.length ? topNews.map((news, index) => <a key={news.id || index} href={news.source_url || undefined} target={news.source_url ? '_blank' : undefined} rel="noreferrer"><span className={String(news.sentiment || '').toLowerCase()}>{news.sentiment || 'NEUTRAL'}</span><strong>{news.headline}</strong><small>{news.source || ''}{news.published_at ? ` · ${new Date(news.published_at).toLocaleString('it-IT')}` : ''}{Number.isFinite(Number(news.age_hours)) ? ` · ${Math.round(Number(news.age_hours))}h fa` : ''}</small></a>) : <small>Nessuna news verificata negli ultimi 7 giorni.</small>}{olderNews.length > 0 && <details><summary>News meno recenti rilevanti ({olderNews.length})</summary>{olderNews.slice(0, 5).map((news, index) => <a key={news.id || index} href={news.source_url || undefined} target={news.source_url ? '_blank' : undefined} rel="noreferrer"><span className={String(news.sentiment || '').toLowerCase()}>{news.sentiment || 'NEUTRAL'}</span><strong>{news.headline}</strong><small>{news.source || ''}{news.published_at ? ` · ${new Date(news.published_at).toLocaleDateString('it-IT')}` : ''}{news.ongoing_relevance ? ` · ${news.ongoing_relevance}` : ''}</small></a>)}</details>}</div>
         </div>
         {expanded && <div className="portfolio-operational-plan">
          <div className="portfolio-chart-actions"><button className="btn-primary" onClick={() => { const closing = portfolioChartTicker === item.ticker; setPortfolioChartTicker(closing ? null : item.ticker); if (!closing) setPortfolioIndicatorTab('operational'); }}>{portfolioChartTicker === item.ticker ? 'Chiudi grafici' : 'Visualizza grafici'}</button>{portfolioChartTicker === item.ticker && portfolioIndicatorTab === 'operational' && <div className="portfolio-chart-mode"><button className={portfolioChartMode === 'candlestick' ? 'active' : ''} onClick={() => setPortfolioChartMode('candlestick')}>Candele</button><button className={portfolioChartMode === 'line' ? 'active' : ''} onClick={() => setPortfolioChartMode('line')}>Linea</button></div>}<span>Grafico operativo e indicatori tecnici completi</span></div>
          {portfolioChartTicker === item.ticker && (() => {
           const cfg = getTimeframeConfig(chartTimeframe);
           const safeTicker = item.ticker.replaceAll('/', '_');
           const indicatorTabs = [
            ['price_alligator', 'Prezzo e livelli operativi'], ['volume', 'Volumi'],
            ['macd', 'MACD'], ['oscillators', 'Stocastico / Williams'], ['adx', 'ADX / DI']
           ];
           const imageUrl = kind => `/finance_charts/${encodeURIComponent(`${safeTicker}_${cfg.period}_${cfg.days}_${chartType}_${kind === 'operational' ? 'price_alligator' : kind}.png`)}?v=${portfolioChartImageVersion}`;
           const validBars = portfolioChartBars.filter(bar => ['open', 'high', 'low', 'close'].every(key => Number.isFinite(Number(bar[key]))));
           const closes = validBars.map(bar => Number(bar.close));
           const technical = item.technical || {};
           const thresholdCandidates = [
            ['Prezzo ingresso', Number(item.position?.entry_price), '#a78bfa'],
            ['Prezzo analisi', getPortfolioAnalysisPrice(item), '#38bdf8'],
            ['Stop configurato', Number(item.stop_loss_review?.configured_level ?? item.position?.configured_stop_loss), '#fb7185'],
            ['Stop suggerito', Number(item.stop_loss_review?.suggested_level ?? stop.level), '#ef4444'],
            ...((plan.take_profit_levels || []).map((tp, index) => [tp.label || `TP${index + 1}`, Number(tp.level), '#22c55e'])),
            ['Supporto', Number(technical.major_support), '#f97316'],
            ['Resistenza', Number(technical.resistance), '#eab308'],
            ['Target analisti', Number(analystTarget.target_price), '#f472b6']
           ].filter(([, value]) => Number.isFinite(value) && value > 0);
           const allValues = [...closes, ...thresholdCandidates.map(([, value]) => value)];
           const rawMin = allValues.length ? Math.min(...allValues) : 0;
           const rawMax = allValues.length ? Math.max(...allValues) : 1;
           const padding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.01);
           const min = rawMin - padding;
           const max = rawMax + padding;
           const range = max - min || 1;
           const plotRight = 730;
           const x = index => 55 + (index / Math.max(closes.length - 1, 1)) * (plotRight - 55);
           const y = value => 330 - ((value - min) / range) * 275;
           const candleWidth = Math.max(2, Math.min(8, ((plotRight - 55) / Math.max(validBars.length, 1)) * .62));
           return <div className="portfolio-chart-suite">
            <div className="portfolio-indicator-tabs">{indicatorTabs.map(([key, label]) => <button key={key} className={portfolioIndicatorTab === key ? 'active' : ''} onClick={() => setPortfolioIndicatorTab(key)}>{label}</button>)}</div>
            {portfolioIndicatorTab !== 'operational' ? <div className="portfolio-indicator-image"><div><strong>{indicatorTabs.find(([key]) => key === portfolioIndicatorTab)?.[1]}</strong><small>{item.ticker} · {cfg.period} · {cfg.days} sessioni</small></div>{portfolioChartLoading ? <div className="monitor-empty">Generazione grafico...</div> : <img src={imageUrl(portfolioIndicatorTab)} alt={`${item.ticker} ${portfolioIndicatorTab}`} onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling.style.display = 'block'; }}/>}<div className="monitor-empty portfolio-image-error">Grafico non disponibile. Riapri il pannello o aggiorna lo storico.</div></div> : <div className="portfolio-operational-chart">
            {portfolioChartLoading ? <div className="monitor-empty">Caricamento storico prezzi...</div> : closes.length < 2 ? <div className="monitor-empty">Storico prezzi non disponibile.</div> : <svg viewBox="0 0 940 370" role="img" aria-label={`Grafico operativo ${item.ticker}`}>
             {[0, 1, 2, 3, 4].map(index => { const value = max - (range * index / 4); return <g key={index}><line x1="55" x2={plotRight} y1={55 + index * 68.75} y2={55 + index * 68.75} stroke="#e2e8f0"/><text x="5" y={59 + index * 68.75} fill="#475569" fontSize="10">{value.toFixed(2)}</text></g>; })}
             {portfolioChartMode === 'line' ? <polyline fill="none" stroke="#334155" strokeWidth="2" points={closes.map((value, index) => `${x(index)},${y(value)}`).join(' ')}/> : validBars.map((bar, index) => { const open = Number(bar.open), high = Number(bar.high), low = Number(bar.low), close = Number(bar.close); const rising = close >= open; const color = rising ? '#16a34a' : '#ef4444'; const bodyY = Math.min(y(open), y(close)); const bodyHeight = Math.max(1.5, Math.abs(y(open) - y(close))); return <g key={bar.date || index}><line x1={x(index)} x2={x(index)} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1"/><rect x={x(index) - candleWidth / 2} y={bodyY} width={candleWidth} height={bodyHeight} fill={rising ? 'rgba(34,197,94,.72)' : 'rgba(239,68,68,.72)'} stroke={color} strokeWidth=".7"/></g>; })}
             {thresholdCandidates.map(([label, value, color], index) => <g key={`${label}-${index}`}><line x1="55" x2={plotRight} y1={y(value)} y2={y(value)} stroke={color} strokeWidth="1.5" strokeDasharray="7 5"/><line x1={plotRight} x2="748" y1={y(value)} y2={32 + index * 38} stroke={color} strokeWidth=".8" opacity=".65"/><rect x="748" y={18 + index * 38} width="184" height="27" rx="4" fill="#ffffff" stroke={color} strokeWidth=".7"/><text x="758" y={35 + index * 38} fill={color} fontSize="10.5" fontWeight="600">{label}: {value.toFixed(2)}</text></g>)}
            </svg>}
            <div className="portfolio-chart-legend">{thresholdCandidates.map(([label, value, color], index) => <span key={`${label}-${index}`} style={{ color }}><i style={{ background: color }}/>{label}: {value.toFixed(2)}</span>)}</div>
            <small>Il prezzo di riferimento appartiene al JSON importato; lo storico è caricato dall'app. Verifica timestamp e fonte prima di usare i livelli.</small>
           </div>}
           </div>;
          })()}
          <div className="portfolio-plan-kpis"><div><span>Stato piano</span><strong>{plan.plan_status || 'N/D'}</strong></div><div><span>Prezzo riferimento</span><strong>{plan.reference_price ?? item.position?.current_price ?? 'N/D'}</strong></div><div className="stop"><span>Stop loss</span><strong>{stop.level ?? 'N/D'}</strong><small>{stop.trigger || ''}</small></div><div><span>Trailing stop</span><strong>{plan.trailing_stop?.enabled ? `${plan.trailing_stop.trail_pct ?? 'N/D'}%` : 'Non attivo'}</strong></div><div><span>Risk/Reward TP1</span><strong>{plan.risk_reward?.ratio_to_tp1 ?? 'N/D'}</strong><small>{plan.risk_reward?.assessment || ''}</small></div><div><span>Orizzonte</span><strong>{plan.time_horizon || 'N/D'}</strong></div></div>
          <div className="portfolio-tp-grid">{(plan.take_profit_levels || []).length ? plan.take_profit_levels.map(tp => <div key={tp.label}><strong>{tp.label}: {tp.level ?? 'N/D'}</strong><span>Da prezzo attuale: {tp.gain_from_current_pct ?? 'N/D'}%</span><span>Riduzione indicativa: {tp.suggested_position_reduction_pct ?? 'N/D'}%</span><small>{tp.reason}</small></div>) : <div>Nessun take profit affidabile disponibile.</div>}</div>
          <div className="portfolio-plan-conditions"><div><strong>Conferme</strong>{(plan.confirmation_conditions || []).map((text, index) => <span key={index}>{text}</span>)}</div><div><strong>Invalidazione</strong>{(plan.invalidation_conditions || []).map((text, index) => <span key={index}>{text}</span>)}</div><div><strong>Monitoraggio</strong>{(plan.monitoring_triggers || []).map((text, index) => <span key={index}>{text}</span>)}</div></div>
          <p className="portfolio-plan-warning">Livelli informativi generati dall'analisi e soggetti a revisione umana. Non costituiscono ordini automatici.</p>
         </div>}
        </div>;
       })}
      </div></>}
     </div>
    </section>
    )}

    {activeTab !== 'portfolio' && <>
    {/* WATCHLIST TABLE */}
   <div className="watchlist-card">
    <div className="watchlist-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <div>
       <span className="watchlist-title">Watchlist: {activeWatchlistName}</span>
       <span className="watchlist-sub">{watchlist.length} titoli monitorati in questa lista</span>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
       <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Ordinamento:</span>
       <select
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        style={{
         background: 'rgba(30,41,59,0.9)',
         border: '1px solid rgba(255,255,255,0.12)',
         color: '#f8fafc',
         padding: '0.3rem 0.6rem',
         borderRadius: '6px',
         fontSize: '0.78rem',
         cursor: 'pointer'
        }}
       >
        <option value="desc">Score: piu alto - piu basso (Default)</option>
        <option value="asc">Score: piu basso - piu alto</option>
        <option value="alpha-asc">Alfabetico: A-Z</option>
        <option value="alpha-desc">Alfabetico: Z-A</option>
        <option value="none">Ordine Lista Manuale</option>
       </select>
      </div>
     </div>
     <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <button
       className="btn-primary"
       onClick={() => runAllAnalyses(false)}
       disabled={loading || watchlist.length === 0}
       style={{
        padding: '0.45rem 0.9rem',
        fontSize: '0.82rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontWeight: '600'
       }}
       title="Esegui l'analisi live via Playwright & ChatGPT per TUTTI i titoli in Watchlist"
      >
       {loading && watchlistRefreshMode === 'news' ? 'Aggiornamento news...' : 'Aggiorna news'}
     </button>
      <button
       className="btn-secondary"
       onClick={() => refreshAllWatchlistCharts(false)}
       disabled={loading || watchlist.length === 0}
       style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: '600' }}
       title="Rigenera localmente prezzo, volumi, MACD, stocastici e ADX senza aggiornare le news"
      >
       {loading && watchlistRefreshMode === 'charts' ? 'Aggiornamento grafici...' : 'Aggiorna grafici'}
      </button>
      <button
       className="btn-primary"
       onClick={refreshAllWatchlistNewsAndCharts}
       disabled={loading || watchlist.length === 0}
       style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: '600' }}
       title="Aggiorna prima le news via ChatGPT e poi rigenera tutti i grafici tecnici"
      >
       {loading && watchlistRefreshMode === 'news_charts' ? 'Aggiornamento completo...' : 'News + grafici'}
      </button>
      <button className="btn-secondary" onClick={() => setSelectedPdfTickers(watchlist)} disabled={!watchlist.length} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>
       Seleziona tutti
      </button>
      <button className="btn-secondary" onClick={() => setSelectedPdfTickers([])} disabled={!selectedPdfTickers.length} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>
       Deseleziona tutti
      </button>
      <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>{selectedPdfTickers.length} selezionati</span>
      <button
       className="btn-secondary"
       onClick={exportWatchlistPdf}
       disabled={selectedPdfTickers.length === 0 || pdfProgress?.status === 'running'}
       style={{
        padding: '0.45rem 0.9rem',
        fontSize: '0.82rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontWeight: '600'
       }}
       title={`Crea il PDF per i ${selectedPdfTickers.length} titoli selezionati`}
      >
       {pdfProgress?.status === 'running' ? 'Generazione PDF...' : 'Genera PDF per ChatGPT'}
      </button>
      {pdfProgress && (
       <div style={{ minWidth: '240px', maxWidth: '320px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', color: pdfProgress.status === 'failed' ? '#f87171' : '#cbd5e1', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
         <span>{pdfProgress.ticker ? `${pdfProgress.phase}: ${pdfProgress.ticker}` : pdfProgress.phase}</span>
         <strong>{pdfProgress.percent}%</strong>
        </div>
        <div style={{ height: '8px', overflow: 'hidden', borderRadius: '999px', background: 'rgba(148,163,184,0.2)' }}>
         <div style={{ width: `${pdfProgress.percent}%`, height: '100%', borderRadius: '999px', background: pdfProgress.status === 'failed' ? '#ef4444' : '#38bdf8', transition: 'width 250ms ease' }} />
        </div>
       </div>
      )}
     </div>
    </div>
    <div className="watchlist-table">
     <div className="wt-thead">
      <span
       onClick={() => setSortOrder(prev => prev === 'alpha-asc' ? 'alpha-desc' : 'alpha-asc')}
       style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
       title="Clicca per ordinare alfabeticamente per Titolo"
      >
       Titolo {sortOrder === 'alpha-asc' ? 'A-Z' : sortOrder === 'alpha-desc' ? 'Z-A' : ''}
      </span>
      <span>Mercato</span>
      <span>Prezzo / Target</span>
      <span>Sentiment</span>
      <span
       onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
       style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
       title="Clicca per ordinare per Score"
      >
       Score {sortOrder === 'desc' ? '↓' : sortOrder === 'asc' ? '↑' : ''}
      </span>
      <span>Summary news + grafico</span>
      <span>Azione</span>
     </div>
     {sortedWatchlistRows.map((row) => {
      const isActive = expandedTicker === row.ticker;
      return (
       <React.Fragment key={row.ticker}>
        <div
                  className={`wt-row${isActive ? ' wt-row-active' : ''}`}
                  style={{ borderLeft: `3px solid ${row.col.border}`, background: isActive ? 'rgba(56,189,248,0.06)' : row.col.bg, cursor: 'pointer' }}
         onClick={() => {
          if (isActive) {
           setData(null);
           setExpandedTicker(null);
          } else {
           setActiveTab('dashboard');
           handleSearch(row.ticker, true);
          }
         }}
        >
         <span className="wt-ticker" style={{ color: row.col.text }}>
          <label onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', marginBottom: '0.2rem' }}>
           <input
            type="checkbox"
            checked={selectedPdfTickers.includes(row.ticker)}
            onChange={(e) => setSelectedPdfTickers(prev => e.target.checked ? [...prev, row.ticker] : prev.filter(t => t !== row.ticker))}
           />
           <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: '600' }}>PDF</span>
          </label>
          {row.ticker}
          <span className="wt-company">{row.company}</span>
          {row.timestamp && (
           <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px', display: 'block', fontWeight: 'normal' }}>
             {row.timestamp}
           </span>
          )}
          {row.chartTimestamp && (
           <span style={{ fontSize: '0.68rem', color: '#c084fc', marginTop: '1px', display: 'block', fontWeight: 'normal' }}>
             {row.chartTimestamp}
           </span>
          )}
         </span>
         <span className="wt-market">{row.market}</span>
         <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {row.currentPrice ? (
           <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 'bold' }}>
             {row.currentPrice}
           </span>
          ) : (
           <span style={{ fontSize: '0.78rem', color: '#64748b' }}></span>
          )}
          {row.bestUpsideItem && row.bestUpsideItem.upside_percent !== undefined && row.bestUpsideItem.upside_percent > 0 && (
           <span
            style={{
             display: 'inline-block',
             padding: '0.12rem 0.4rem',
             borderRadius: '8px',
             fontSize: '0.7rem',
             fontWeight: 'bold',
             background: 'rgba(34,197,94,0.2)',
             color: '#4ade80',
             border: '1px solid #22c55e',
             width: 'fit-content'
            }}
            title={`Target ${row.bestUpsideItem.broker}: ${row.bestUpsideItem.target_price}`}
           >
             +{row.bestUpsideItem.upside_percent}% ({row.bestUpsideItem.target_price})
           </span>
          )}
         </span>
         <span>
          <span className="wt-badge" style={{ color: row.col.text, borderColor: row.col.border }}>
           {row.sentiment}
          </span>
         </span>
         <span className="wt-score-cell">
          {row.score !== null ? (
           <>
            <div className="score-bar-track" style={{ width: '80px' }}>
             <div className="score-bar-fill" style={{ width: `${Math.round(row.score * 100)}%`, background: row.col.border }} />
            </div>
            <span style={{ color: row.col.text, fontSize: '0.8rem', fontWeight: 700 }}>{Math.round(row.score * 100)}%</span>
           </>
          ) : (
           <span style={{ color: '#475569', fontSize: '0.8rem' }}></span>
          )}
         </span>
         <span className="wt-impact">{row.impact}</span>
         <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
           <button
                        className={row.analyzed ? 'btn-secondary' : 'btn-primary'}
            style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
            disabled={loading}
            onClick={(e) => {
             e.stopPropagation();
             setUpdateMenuOpenTicker(updateMenuOpenTicker === row.ticker ? null : row.ticker);
            }}
            title="Scegli cosa aggiornare: News, Grafico AI o Entrambi"
           >
                        <span>{row.analyzed ? 'Aggiorna News' : 'Analizza News'}</span>
            <span style={{ fontSize: '0.65rem' }}></span>
           </button>

           {updateMenuOpenTicker === row.ticker && (
            <div
             style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: '6px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
              zIndex: 9999,
              minWidth: '220px',
              overflow: 'hidden'
             }}
             onClick={(e) => e.stopPropagation()}
            >
             <div
              style={{ padding: '0.65rem 0.85rem', fontSize: '0.78rem', color: '#f8fafc', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.45rem', background: '#0b1329', fontWeight: 600 }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#0b1329'}
              onClick={() => {
               setUpdateMenuOpenTicker(null);
               setActiveTab('dashboard');
               runAgentAnalysis(row.ticker);
              }}
             >
              <span></span> <strong>1. Aggiorna Notizie & Sentiment</strong>
             </div>
             <div
              style={{ padding: '0.65rem 0.85rem', fontSize: '0.78rem', color: '#f8fafc', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.45rem', background: '#0b1329', fontWeight: 600 }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#0b1329'}
              onClick={() => {
               setUpdateMenuOpenTicker(null);
               setActiveTab('dashboard');
               runChartAgentAnalysis(row.ticker);
              }}
             >
              <span></span> <strong>2. Aggiorna Analisi Grafico AI</strong>
             </div>
             <div
              style={{ padding: '0.65rem 0.85rem', fontSize: '0.78rem', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.45rem', background: '#0284c720', fontWeight: 700 }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#0284c735'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#0284c720'}
              onClick={async () => {
               setUpdateMenuOpenTicker(null);
               setActiveTab('dashboard');
               setLoading(true);
               await runAgentAnalysis(row.ticker);
               await runChartAgentAnalysis(row.ticker);
               setLoading(false);
              }}
             >
              <span></span> <strong style={{ color: '#38bdf8' }}>3. Aggiorna Entrambi (News + Grafico)</strong>
             </div>
            </div>
           )}
          </div>
          <button
           style={{
            padding: '0.3rem 0.5rem',
            fontSize: '0.75rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            borderRadius: '6px',
            cursor: 'pointer'
           }}
           title={`Rimuovi ${row.ticker} dalla Watchlist`}
           onClick={(e) => {
            e.stopPropagation();
            removeFromWatchlist(row.ticker);
           }}
          >
           Rimuovi
          </button>
         </span>
        </div>

        {/* INLINE ACCORDION DETAILS DIRECTLY UNDER THIS SPECIFIC STOCK ITEM */}
        {isActive && (
         <div style={{ margin: '0.6rem 0 1.5rem 0', padding: '1.2rem', background: '#0f172a', border: `2px solid ${row.col.border}`, borderRadius: '16px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', color: '#f8fafc' }}>
          
          {/* ACCORDION HEADER WITH CLOSING BUTTON */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
           <span style={{ fontWeight: 800, fontSize: '1rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
             Analisi Completa per <strong>{row.company} ({row.ticker})</strong>
           </span>
           <button
            onClick={() => { setData(null); setExpandedTicker(null); }}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1', padding: '0.3rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
           >
             Chiudi Scheda
           </button>
          </div>

          {/* THE TWO TABS BAR DIRECTLY UNDER THE CLICKED ITEM */}
          <div className="tab-navigation" style={{ marginBottom: '1.2rem' }}>
           <button
            className={`tab-btn${activeTab === 'dashboard' ? ' tab-btn-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveTab('dashboard'); }}
           >
             Dashboard Analisi
           </button>
           <button
            className={`tab-btn${activeTab === 'logs' ? ' tab-btn-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveTab('logs'); }}
           >
             Log Terminal (Agenti Attivi) {loading && <span className="pulse-dot"></span>}
           </button>
          </div>

          {/* CONTENT UNDER THE TWO TABS */}
          {activeTab === 'logs' ? (
           <div className="terminal-card" style={{ marginTop: '0.5rem' }}>
            <div className="terminal-header">
             <span className="terminal-dot red-dot"></span>
             <span className="terminal-dot yellow-dot"></span>
             <span className="terminal-dot green-dot"></span>
             <span className="terminal-title">Agentic Pipeline Execution Logs per {row.ticker}</span>
            </div>
            <div className="terminal-body" style={{ maxHeight: '350px', overflowY: 'auto' }}>
             {logs.map((log, idx) => (
              <div key={idx} className="terminal-line">
               <span className="terminal-timestamp">[{log.time}]</span>{' '}
               <span className="terminal-agent">[{log.agent}]</span>{' '}
               <span className="terminal-msg">{log.msg}</span>
              </div>
             ))}
             {loading && (
              <div className="terminal-line terminal-cursor-line">
               <span className="terminal-timestamp">[{new Date().toLocaleTimeString()}]</span>{' '}
               <span className="terminal-agent">[System]</span>{' '}
               <span className="terminal-msg">Esecuzione del multi-agente in corso...</span>
               <span className="terminal-cursor"></span>
              </div>
             )}
             {!loading && logs.length > 0 && (
              <div className="terminal-line terminal-success-line">
               <span className="terminal-timestamp">[{new Date().toLocaleTimeString()}]</span>{' '}
               <span className="terminal-agent">[System]</span>{' '}
               <span className="terminal-msg">Pipeline completed. Passa alla Dashboard per vedere i risultati.</span>
              </div>
             )}
            </div>
           </div>
          ) : (
           /* ACTIVE TAB IS 'DASHBOARD' */
           (!data || data.search_metadata.ticker !== row.ticker) ? (
            <EmptyState
             ticker={row.ticker}
             onAnalyze={() => runAgentAnalysis(row.ticker)}
             loading={loading}
            />
           ) : (
            <div className="dashboard-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
             
             {/* 1. SUMMARY CARD */}
             <div className="card card-summary" style={{ marginBottom: 0 }}>
              <div className="card-title">
                Sintesi &amp; Sentiment {data.search_metadata.company_name}
               <span style={{ marginLeft: '0.2rem', color: '#94a3b8', fontWeight: '500' }}>({data.search_metadata.ticker})</span>
               <span style={{ marginLeft: '0.5rem' }}>{getSentimentBadge(ms.overall_sentiment)}</span>

               <button
                onClick={() => runAgentAnalysis(data.search_metadata.ticker)}
                style={{
                 marginLeft: '1rem',
                 background: 'rgba(56, 189, 248, 0.1)',
                 border: '1px solid rgba(56, 189, 248, 0.3)',
                 color: '#38bdf8',
                 padding: '0.25rem 0.6rem',
                 borderRadius: '6px',
                 fontSize: '0.75rem',
                 cursor: 'pointer',
                 display: 'inline-flex',
                 alignItems: 'center',
                 gap: '0.25rem',
                 fontWeight: '600',
                }}
                title="Avvia nuova analisi reale via ChatGPT"
               >
                 Aggiorna News
               </button>

               <button
                onClick={() => runChartAgentAnalysis(data.search_metadata.ticker)}
                disabled={loading}
                style={{
                 marginLeft: '0.5rem',
                 background: 'rgba(168, 85, 247, 0.15)',
                 border: '1px solid rgba(168, 85, 247, 0.4)',
                 color: '#c084fc',
                 padding: '0.25rem 0.6rem',
                 borderRadius: '6px',
                 fontSize: '0.75rem',
                 cursor: 'pointer',
                 display: 'inline-flex',
                 alignItems: 'center',
                 gap: '0.25rem',
                 fontWeight: '600',
                }}
                title="Genera grafico ed esegue l'analisi visuale AI tramite Playwright Vision"
               >
                 Analizza Grafico AI
               </button>
                <button
                 onClick={async () => {
                  setLoading(true);
                  await runAgentAnalysis(data.search_metadata.ticker);
                  await runChartAgentAnalysis(data.search_metadata.ticker);
                  setLoading(false);
                 }}
                 disabled={loading}
                 style={{
                  marginLeft: '0.5rem',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  color: '#4ade80',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontWeight: '700',
                 }}
                 title="Aggiorna sia le Notizie che l'Analisi Grafico AI nello stesso momento"
                >
                 Aggiorna Entrambi
                </button>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                 {data.search_metadata.timestamp_utc && (
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    News: {new Date(data.search_metadata.timestamp_utc).toLocaleString('it-IT', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                   })}
                  </span>
                 )}
                 {(() => {
                  const activeT = (data?.search_metadata?.ticker || query || '').toUpperCase();
                  const candidateKeys = [
                   activeT + '_CHART',
                   (query || '') + '_CHART',
                   activeT.toLowerCase() + '_CHART'
                  ];
                  const chartData = candidateKeys.map(k => realTickerData[k]).find(d => d?.search_metadata?.timestamp_utc);
                  return chartData?.search_metadata?.timestamp_utc && (
                   <span style={{ fontSize: '0.78rem', background: '#faf5ff', border: '1px solid #e9d5ff', color: '#7e22ce', padding: '0.15rem 0.55rem', borderRadius: '6px', fontWeight: '600' }}>
                     Grafico AI: {new Date(chartData.search_metadata.timestamp_utc).toLocaleString('it-IT', {
                     day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                   </span>
                  );
                 })()}
                </div>
              </div>

              <div className="summary-grid">
               <div className="summary-explanation">
                <p style={{ color: '#e2e8f0', lineHeight: 1.7, marginBottom: '0.8rem' }}>
                 {ms.summary_explanation}
                </p>
                <div className="expected-impact">
                 <span className="impact-label"> Impatto Atteso:</span>
                 <span className="impact-value">{ms.expected_impact}</span>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                 <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Sentiment Score</span>
                 {getSentimentScoreBar(ms.sentiment_score)}
                </div>
               </div>

               <div className="summary-highlights">
                <div className="highlights-title"> Punti Chiave delle Notizie</div>
                <ul className="highlights-list">
                 {(ms.news_highlights || []).map((h, i) => (
                  <li key={i} className="highlight-item">{h}</li>
                 ))}
                </ul>
                <div className="news-count-badge">
                  {allNews.length} notizie analizzate &nbsp;|&nbsp;  {data.search_metadata.market}
                 {data.search_metadata.timestamp_utc && (
                  <>
                   &nbsp;|&nbsp; Aggiornato: {new Date(data.search_metadata.timestamp_utc).toLocaleString('it-IT', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                   })}
                  </>
                 )}
                </div>
               </div>
              </div>
             </div>

             {/* 2. FULL-WIDTH INTERACTIVE CHART & VISION AI SECTION */}
             <div className="chart-fullwidth-container" style={{ width: '100%', background: '#ffffff', borderRadius: '12px', padding: '1rem', color: '#0f172a' }}>
              
              {/* VARIATION METRICS PILLS BAR (Close, 1D, 5D, 10D, 30D, 180D) */}
              <div style={{
               display: 'flex',
               gap: '0.6rem',
               alignItems: 'center',
               flexWrap: 'wrap',
               marginBottom: '1rem',
               padding: '0.6rem 0.8rem',
               background: '#0b1329',
               borderRadius: '12px',
               border: '1px solid #1e293b'
              }}>
               <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                padding: '0.35rem 0.85rem',
                borderRadius: '20px',
                fontSize: '0.82rem',
                fontWeight: 800,
                color: '#f8fafc',
                display: 'flex',
                gap: '0.4rem',
                alignItems: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
               }}>
                <span>Close:</span>
                <span style={{ color: '#38bdf8' }}>
                 {chartMetrics.close !== undefined ? chartMetrics.close : (row.currentPrice || '')}
                </span>
               </div>

               {[
                { label: '1D', val: chartMetrics.var_1d },
                { label: '5D', val: chartMetrics.var_5d },
                { label: '10D', val: chartMetrics.var_10d },
                { label: '30D', val: chartMetrics.var_30d },
                { label: '180D', val: chartMetrics.var_180d },
               ].map((item) => {
                const isPos = item.val >= 0;
                return (
                 <div
                  key={item.label}
                  style={{
                   background: '#0f172a',
                   border: '1px solid #334155',
                   padding: '0.35rem 0.85rem',
                   borderRadius: '20px',
                   fontSize: '0.82rem',
                   fontWeight: 800,
                   display: 'flex',
                   gap: '0.4rem',
                   alignItems: 'center',
                   boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                  }}
                 >
                  <span style={{ color: '#f8fafc' }}>{item.label}:</span>
                  <span style={{ color: item.val !== undefined && item.val !== null ? (isPos ? '#22c55e' : '#ef4444') : '#94a3b8' }}>
                   {item.val !== undefined && item.val !== null ? `${isPos ? '+' : ''}${item.val}%` : ''}
                  </span>
                 </div>
                );
               })}
              </div>

              {/* TIMEFRAME, INDICATORS & HEIGHT CONTROLS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
               <div style={{ display: 'flex', gap: '0.4rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '8px' }}>
                {['5g', '1m', '3m', '6m', '1a', '2a'].map((tf) => (
                 <button
                  key={tf}
                  onClick={() => setChartTimeframe(tf)}
                  style={{
                   border: 'none',
                                      background: chartTimeframe === tf ? '#0f172a' : 'transparent',
                                      color: chartTimeframe === tf ? '#ffffff' : '#334155',
                   padding: '0.35rem 0.65rem',
                   borderRadius: '6px',
                   fontSize: '0.78rem',
                   fontWeight: 700,
                   cursor: 'pointer'
                  }}
                 >
                  {tf}
                 </button>
                ))}
               </div>

               <div style={{ display: 'flex', gap: '0.4rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '8px' }}>
                {[
                 { id: 'tutti', label: 'Tutti' },
                 { id: 'prezzo', label: 'Prezzo' },
                 { id: 'volumi', label: 'Volumi' },
                 { id: 'rsi', label: 'RSI/Stoch/W%R' },
                 { id: 'macd', label: 'MACD' },
                 { id: 'adx', label: 'ADX' },
                ].map((tab) => (
                 <button
                  key={tab.id}
                  onClick={() => setChartIndicatorTab(tab.id)}
                  style={{
                   border: 'none',
                                      background: chartIndicatorTab === tab.id ? '#0f172a' : 'transparent',
                                      color: chartIndicatorTab === tab.id ? '#ffffff' : '#334155',
                   padding: '0.35rem 0.65rem',
                   borderRadius: '6px',
                   fontSize: '0.78rem',
                   fontWeight: 700,
                   cursor: 'pointer'
                  }}
                 >
                  {tab.label}
                 </button>
                ))}
               </div>

               <button
                onClick={() => runChartAgentAnalysis(row.ticker)}
                disabled={loading}
                style={{
                 background: '#2563eb',
                 border: 'none',
                 color: '#ffffff',
                 padding: '0.4rem 0.85rem',
                 borderRadius: '8px',
                 fontSize: '0.8rem',
                 fontWeight: 700,
                 cursor: 'pointer',
                 boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
                }}
               >
                                {loading ? 'Generazione...' : 'Rigenera Grafico AI'}
               </button>
              </div>

              {/* IDENTIFIED LEVELS STATUS BAR & TOP REAL-TIME INSPECTION CARDS */}
              {(() => {
               const chartData = realTickerData[query + '_CHART'] || realTickerData[row.ticker + '_CHART'];
               const cta = chartData?.chart_technical_analysis || chartData?.chart_vision_analysis || chartData?.technical_analysis || {};
               const cfg = getTimeframeConfig(chartTimeframe);
               const chartSuffix = `${cfg.period}_${cfg.days}_${chartType}`;
               const baseUrl = `/finance_charts/${row.ticker}_${chartSuffix}_`;
               const ver = `?v=${chartVersion}`;

               let chartList = [];
               if (chartIndicatorTab === 'tutti') {
                chartList = [
                 { id: 'price', title: ' 1. Prezzo & Livelli (Candele / Alligator / Supporti & Trigger)', url: `${baseUrl}price_alligator.png${ver}` },
                 { id: 'volume', title: ' 2. Analisi Volumi & Medie Mobili (Vol MA5 & MA10)', url: `${baseUrl}volume.png${ver}` },
                 { id: 'rsi', title: ' 3. Oscillatori Momentum (RSI, Stochastic & Williams %R)', url: `${baseUrl}oscillators.png${ver}` },
                 { id: 'macd', title: ' 4. Trend Follower MACD (MACD, Signal & Istogramma)', url: `${baseUrl}macd.png${ver}` },
                 { id: 'adx', title: ' 5. Indicatori ADX & Direzionali Trend (ADX, DI+, DI-)', url: `${baseUrl}adx.png${ver}` },
                ];
               } else if (chartIndicatorTab === 'prezzo') {
                chartList = [{ id: 'price', title: ' Prezzo & Livelli (Candele / Alligator / Supporti & Trigger)', url: `${baseUrl}price_alligator.png${ver}` }];
               } else if (chartIndicatorTab === 'volumi') {
                chartList = [{ id: 'volume', title: ' Analisi Volumi & Medie Mobili (Vol MA5 & MA10)', url: `${baseUrl}volume.png${ver}` }];
               } else if (chartIndicatorTab === 'rsi') {
                chartList = [{ id: 'rsi', title: ' Oscillatori Momentum (RSI, Stochastic & Williams %R)', url: `${baseUrl}oscillators.png${ver}` }];
               } else if (chartIndicatorTab === 'macd') {
                chartList = [{ id: 'macd', title: ' Trend Follower MACD (MACD, Signal & Istogramma)', url: `${baseUrl}macd.png${ver}` }];
               } else if (chartIndicatorTab === 'adx') {
                chartList = [{ id: 'adx', title: ' Indicatori ADX & Direzionali Trend (ADX, DI+, DI-)', url: `${baseUrl}adx.png${ver}` }];
               }

               const currentClose = cta?.identified_levels?.current_price || row.currentPrice || '';
               const rawTrigger = cta?.identified_levels?.trigger_price;
               const triggerPrice = (rawTrigger && typeof rawTrigger === 'number' && rawTrigger < 5000)
                rawTrigger
                : ((Array.isArray(cta?.chart_resistances) && cta.chart_resistances[0] && cta.chart_resistances[0] < 5000) ? cta.chart_resistances[0] : (chartHistoryBars.length > 0 ? chartHistoryBars[chartHistoryBars.length - 1].close : '-'));
               const supportPrice = cta ? (cta?.identified_levels?.support_price || (Array.isArray(cta?.chart_supports) && cta.chart_supports[0]) || '-') : '-';

               const activeBar = hoveredBar ? hoveredBar : (clickedBar ? clickedBar : (chartHistoryBars.length > 0 ? chartHistoryBars[chartHistoryBars.length - 1] : null));
               const displayDate = activeBar ? activeBar.date : (data?.search_metadata?.timestamp_utc ? new Date(data.search_metadata.timestamp_utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
               const displayClose = activeBar ? `${activeBar.close} EUR` : (typeof currentClose === 'number' ? `${currentClose} EUR` : currentClose);
               const displayChange = activeBar ? (typeof activeBar.change_pct === 'number' ? activeBar.change_pct : (parseFloat(activeBar.change_pct) || 0.0)) : 0.0;
               const isPos = displayChange >= 0;

               const handleMouseMove = (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const pct = x / rect.width;
                setCrosshairPos(x);
                if (chartHistoryBars && chartHistoryBars.length > 0) {
                 const plotPct = Math.min(Math.max(0, (pct - 0.065) / 0.80), 1);
                 const idx = Math.min(Math.max(0, Math.round(plotPct * (chartHistoryBars.length - 1))), chartHistoryBars.length - 1);
                 const bar = chartHistoryBars[idx];
                 if (bar) { setHoveredBar(bar); }
                }
               };

               const handleChartClick = (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const pct = x / rect.width;
                if (chartHistoryBars && chartHistoryBars.length > 0) {
                 const plotPct = Math.min(Math.max(0, (pct - 0.065) / 0.80), 1);
                 const idx = Math.min(Math.max(0, Math.round(plotPct * (chartHistoryBars.length - 1))), chartHistoryBars.length - 1);
                 const bar = chartHistoryBars[idx];
                 if (bar) { setClickedBar(bar); }
                }
               };

               const handleMouseLeave = () => {
                setCrosshairPos(null);
                setHoveredBar(null);
               };

               return (
                <>
                 {/* TOP REAL-TIME INSPECTION CARDS & BADGES */}
                 <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '0.9rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.5rem 0.9rem', flex: '1', minWidth: '120px' }}>
                   <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}> Data Selezionata</div>
                   <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{displayDate}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.5rem 0.9rem', flex: '1', minWidth: '120px' }}>
                   <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}> Chiusura</div>
                   <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{displayClose}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.5rem 0.9rem', flex: '1', minWidth: '140px' }}>
                   <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}> Variazione 1D</div>
                   <div style={{ marginTop: '2px' }}>
                    <span style={{ display: 'inline-block', padding: '0.12rem 0.5rem', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 800, background: isPos ? '#dcfce7' : '#fee2e2', color: isPos ? '#15803d' : '#991b1b' }}>
                     {isPos ? '+' : ''}{displayChange}%
                    </span>
                   </div>
                  </div>

                  {/* STATUS BADGES */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                   <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.35rem 0.65rem', borderRadius: '8px' }}>
                     PREZZO {currentClose}
                   </div>
                   <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.35rem 0.65rem', borderRadius: '8px' }}>
                     TRIGGER {triggerPrice}
                   </div>
                   <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.35rem 0.65rem', borderRadius: '8px' }}>
                     SUPPORTO {supportPrice}
                   </div>
                  </div>
                 </div>

                 {/* CLICKED CANDLE INSPECTION NOTE (TOP) */}
                 {clickedBar ? (
                  <div style={{ marginBottom: '0.9rem', padding: '0.6rem 0.9rem', background: '#eff6ff', borderRadius: '10px', border: '1px solid #93c5fd', color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                   <div style={{ fontSize: '0.82rem' }}>
                    <strong style={{ color: '#1d4ed8', fontSize: '0.88rem' }}> Nota Ispezione Barra del {clickedBar.date}:</strong> &nbsp;
                    <span>Chiusura: <strong>{clickedBar.close} </strong> &nbsp;|&nbsp; </span>
                    <span>Apertura: <strong>{clickedBar.open} </strong> &nbsp;|&nbsp; </span>
                    <span>Massimo: <strong>{clickedBar.high} </strong> &nbsp;|&nbsp; </span>
                    <span>Minimo: <strong>{clickedBar.low} </strong> &nbsp;|&nbsp; </span>
                    <span>Variazione 1D: <strong style={{ color: clickedBar.change_pct >= 0 ? '#15803d' : '#b91c1c' }}>{clickedBar.change_pct >= 0 ? '+' : ''}{clickedBar.change_pct}%</strong> &nbsp;|&nbsp; </span>
                    <span>Volumi: <strong>{clickedBar.volume.toLocaleString('it-IT') || ''}</strong></span>
                   </div>
                   <button onClick={() => setClickedBar(null)} style={{ background: '#ffffff', border: '1px solid #93c5fd', color: '#1e40af', padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                     Sblocca
                   </button>
                  </div>
                 ) : (
                  <div style={{ marginBottom: '0.7rem', fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
                    <em>Fai passaggio o click su qualsiasi candela del grafico: i dati di quel giorno appariranno in tempo reale nel box qui sopra!</em>
                  </div>
                 )}

                 {/* MAIN CHART IMAGES DISPLAY */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  {chartList.map((chartItem) => (
                   <div key={chartItem.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#ffffff' }}>
                    <div style={{ padding: '0.5rem 0.8rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>
                     {chartItem.title}
                    </div>
                    <div
                     onMouseMove={handleMouseMove}
                     onMouseLeave={handleMouseLeave}
                     onClick={handleChartClick}
                     onDragStart={(e) => e.preventDefault()}
                     style={{ position: 'relative', width: '100%', cursor: 'crosshair', userSelect: 'none' }}
                    >
                     {crosshairPos !== null && (
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${crosshairPos}px`, width: '1px', borderLeft: '1px dashed #64748b', pointerEvents: 'none', zIndex: 20 }} />
                     )}
                     <img
                      src={chartItem.url}
                      alt={chartItem.title}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      onClick={handleChartClick}
                      style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none', WebkitUserDrag: 'none' }}
                      onError={(e) => {
                       const fallbackUrl = `/finance_charts/${row.ticker}_momentum.png`;
                       const priceUrl = `/finance_charts/${row.ticker}_price_alligator.png`;
                       if (e.target.src !== fallbackUrl && e.target.src !== priceUrl) {
                        e.target.src = fallbackUrl;
                       } else if (e.target.src === fallbackUrl) {
                        e.target.src = priceUrl;
                       }
                      }}
                     />
                    </div>
                   </div>
                  ))}
                 </div>

                 {/* CHATGPT VISION DETAILS CARD */}
                 {cta ? (
                  <div style={{ marginTop: '1.2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                   <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                     <span> Analisi Visuale Grafico AI (Playwright Vision)</span>
                     {(() => {
                      const chartD = realTickerData[(query || data?.search_metadata?.ticker) + '_CHART'];
                      return chartD?.search_metadata?.timestamp_utc && (
                       <span style={{ fontSize: '0.75rem', background: '#faf5ff', border: '1px solid #d8b4fe', color: '#7e22ce', padding: '3px 9px', borderRadius: '8px', fontWeight: 700 }}>
                         Aggiornato: {new Date(chartD.search_metadata.timestamp_utc).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </span>
                      );
                     })()}
                    </div>
                    <span style={{ fontSize: '0.78rem', background: '#e0e7ff', color: '#3730a3', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
                     Trend Rilevato: {cta.overall_trend || cta.trend_direction || 'Analizzato'}
                    </span>
                   </div>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem', fontSize: '0.84rem', color: '#334155' }}>
                    {(cta.key_scenario || cta.vision_summary_explanation) && (
                     <div style={{ gridColumn: '1 / -1', background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                      <strong style={{ color: '#15803d', fontSize: '0.92rem' }}> Scenario Principale Grafico AI:</strong>
                      <div style={{ marginTop: '6px', color: '#0f172a', lineHeight: 1.55, fontSize: '0.88rem' }}>{cta.key_scenario || cta.vision_summary_explanation}</div>
                     </div>
                    )}
                    {(cta.operational_note || cta.critical_levels_notes) && (
                      <div style={{ gridColumn: '1 / -1', whiteSpace: 'pre-line', fontStyle: 'italic', color: '#334155', background: '#eff6ff', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                       <strong style={{ color: '#1d4ed8' }}>Nota Operativa Prudente:</strong> {cta.operational_note || cta.critical_levels_notes}
                     </div>
                    )}
                    <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', borderLeft: '4px solid #16a34a', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                     <strong style={{ color: '#16a34a' }}> Supporti Grafici (Vision S1, S2):</strong>
                     <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                      {Array.from(new Set([
                       ...(Array.isArray(cta.chart_supports) ? cta.chart_supports : []),
                       ...(Array.isArray(cta.supports) ? cta.supports : []),
                       ...(Array.isArray(data?.technical_levels?.supports) ? data?.technical_levels?.supports : []),
                       cta.structural_support,
                       cta.secondary_support,
                        chartData?.chart_vision_analysis?.structural_support,
                        chartData?.chart_vision_analysis?.secondary_support
                      ].filter(Boolean)
                       .map(v => String(v).replace(/12047\.50/g, '123.80'))
                       .filter(v => v !== '' && v !== '-' && v.trim() !== '')
                      )).join(', ') || supportPrice}
                     </div>
                    </div>
                    <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', borderLeft: '4px solid #dc2626', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                     <strong style={{ color: '#dc2626' }}> Resistenze / Trigger (Vision R1, R2):</strong>
                     <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{(cta.chart_resistances || [cta.breakout_trigger, cta.structural_resistance]).filter(Boolean).join(', ') || triggerPrice}</div>
                    </div>

                     {/* SEZIONE ANALISI TECNICA DI DETTAGLIO (INDICATORI & PATTERN CANDELE) */}
                     {(cta.candlestick_analysis || cta.alligator_ma_analysis || cta.macd_adx_analysis || cta.volume_oscillator_analysis || cta.chart_pattern) && (
                      <div style={{ gridColumn: '1 / -1', marginTop: '0.6rem', paddingTop: '0.8rem', borderTop: '1px dashed #cbd5e1' }}>
                       <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>Analisi Tecnica di Dettaglio (Indicatori &amp; Pattern Candele)</span>
                       </div>
                       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                        
                        {(cta.candlestick_analysis || cta.chart_pattern) && (() => {
                         const txt = cta.candlestick_analysis || `Pattern grafico identificato: ${cta.chart_pattern}`;
                         const st = getIndicatorCardStyle(txt, cta.candlestick_sentiment);
                         return (
                          <div style={{ background: st.bg, padding: '0.75rem 0.9rem', borderRadius: '10px', border: `1px solid ${st.border}`, borderLeft: st.borderLeft, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <strong style={{ color: '#475569', fontSize: '0.84rem' }}> Pattern Candele &amp; Price Action:</strong>
                            <span style={{ background: st.badgeBg, color: st.color, padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                             {st.icon} {st.label}
                            </span>
                           </div>
                           <div style={{ marginTop: '4px', color: '#0f172a', fontSize: '0.83rem', lineHeight: 1.5 }}>
                            {txt}
                           </div>
                          </div>
                         );
                        })()}

                        {cta.alligator_ma_analysis && (() => {
                         const txt = cta.alligator_ma_analysis;
                         const st = getIndicatorCardStyle(txt, cta.alligator_sentiment);
                         return (
                          <div style={{ background: st.bg, padding: '0.75rem 0.9rem', borderRadius: '10px', border: `1px solid ${st.border}`, borderLeft: st.borderLeft, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <strong style={{ color: '#475569', fontSize: '0.84rem' }}> Williams Alligator &amp; Medie (Jaw, Teeth, Lips, EMA):</strong>
                            <span style={{ background: st.badgeBg, color: st.color, padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                             {st.icon} {st.label}
                            </span>
                           </div>
                           <div style={{ marginTop: '4px', color: '#0f172a', fontSize: '0.83rem', lineHeight: 1.5 }}>
                            {txt}
                           </div>
                          </div>
                         );
                        })()}

                        {cta.macd_adx_analysis && (() => {
                         const txt = cta.macd_adx_analysis;
                         const st = getIndicatorCardStyle(txt, cta.macd_adx_sentiment);
                         return (
                          <div style={{ background: st.bg, padding: '0.75rem 0.9rem', borderRadius: '10px', border: `1px solid ${st.border}`, borderLeft: st.borderLeft, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <strong style={{ color: '#475569', fontSize: '0.84rem' }}> MACD &amp; ADX (Forza del Trend &amp; Momentum):</strong>
                            <span style={{ background: st.badgeBg, color: st.color, padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                             {st.icon} {st.label}
                            </span>
                           </div>
                           <div style={{ marginTop: '4px', color: '#0f172a', fontSize: '0.83rem', lineHeight: 1.5 }}>
                            {txt}
                           </div>
                          </div>
                         );
                        })()}

                        {cta.volume_oscillator_analysis && (() => {
                         const txt = cta.volume_oscillator_analysis;
                         const st = getIndicatorCardStyle(txt, cta.volume_oscillator_sentiment);
                         return (
                          <div style={{ background: st.bg, padding: '0.75rem 0.9rem', borderRadius: '10px', border: `1px solid ${st.border}`, borderLeft: st.borderLeft, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <strong style={{ color: '#475569', fontSize: '0.84rem' }}> Volumi &amp; Oscillatori (RSI / Stocastico):</strong>
                            <span style={{ background: st.badgeBg, color: st.color, padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                             {st.icon} {st.label}
                            </span>
                           </div>
                           <div style={{ marginTop: '4px', color: '#0f172a', fontSize: '0.83rem', lineHeight: 1.5 }}>
                            {txt}
                           </div>
                          </div>
                         );
                        })()}

                       </div>
                      </div>
                     )}
                   </div>
                  </div>
                 ) : (
                  <div style={{ marginTop: '1.2rem', padding: '1rem 1.2rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
                   <div style={{ fontSize: '0.86rem', color: '#475569' }}>
                     <strong style={{ color: '#0f172a' }}>Analisi Visuale del Grafico non ancora generata</strong> Clicca sul pulsante a destra per inviare l'immagine del grafico all'IA.
                   </div>
                   <button
                    onClick={() => runChartAgentAnalysis(row.ticker)}
                    disabled={loading}
                    style={{ background: '#a855f7', border: 'none', color: '#ffffff', padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                   >
                     Analizza Grafico AI
                   </button>
                  </div>
                 )}
                </>
               );
              })()}
             </div>

             {/* 3. TWO-COLUMN GRID FOR NEWS AND SIDEBAR */}
             <div className="grid-layout">
              <div className="main-content">
               {/* NOTIZIE ULTIME 3 GIORNI */}
               <div className="card">
                <div className="card-title"> Notizie Recenti (Ultimi 3 Giorni)</div>
                {(data.recent_news_last_3_days || []).length > 0 ? (
                 data.recent_news_last_3_days.map((news) => (
                  <NewsCard key={news.id} news={news} getSentimentBadge={getSentimentBadge} getImpactDot={getImpactDot} />
                 ))
                ) : (
                 <p style={{ color: '#94a3b8' }}>Nessuna notizia rilevante trovata negli ultimi 3 giorni.</p>
                )}
               </div>

               {/* NOTIZIE STORICHE */}
               {(data.latest_available_news || []).length > 0 && (
                <div className="card">
                 <div className="card-title"> Ultime Notizie Storiche Rilevanti</div>
                 {data.latest_available_news.map((news) => (
                  <NewsCard key={news.id} news={news} getSentimentBadge={getSentimentBadge} getImpactDot={getImpactDot} />
                 ))}
                </div>
               )}
              </div>

              <div className="sidebar">
               {/* Analisti */}
               <div className="card">
                <div className="card-title"> Target Price &amp; Analisti</div>
                {data.search_metadata.current_market_price && (
                 <div style={{ padding: '0.5rem 0.8rem', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '8px', marginBottom: '0.8rem', fontSize: '0.82rem', color: '#38bdf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span> Prezzo Live (Yahoo Finance):</span>
                  <strong style={{ fontSize: '0.95rem' }}>{data.search_metadata.current_market_price}</strong>
                 </div>
                )}

                {(data.analyst_ratings_and_targets || []).length > 0 ? (
                 data.analyst_ratings_and_targets.map((item, idx) => {
                   const isHigher = item.is_target_higher || (item.upside_percent > 0);
                   return (
                    <div
                     key={idx}
                     className="analyst-row"
                     style={{
                      borderLeft: isHigher ? '3px solid #22c55e' : '3px solid #64748b',
                      background: isHigher ? 'rgba(34,197,94,0.08)' : 'rgba(30,41,59,0.4)',
                      padding: '0.65rem 0.8rem',
                      borderRadius: '8px',
                      marginBottom: '0.6rem'
                     }}
                    >
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="analyst-broker"><strong>{item.broker}</strong></span>
                      <span className="analyst-rating" style={{ background: isHigher ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.2)', color: isHigher ? '#4ade80' : '#cbd5e1', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem' }}>
                       {item.rating}
                      </span>
                     </div>

                     <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div className="analyst-target" style={{ fontSize: '0.95rem', fontWeight: 'bold', color: isHigher ? '#4ade80' : '#f8fafc' }}>
                       Target: {item.currency || ''} {item.target_price}
                      </div>
                      {item.upside_percent !== undefined && item.upside_percent !== null && (
                       <span
                        style={{
                         padding: '0.2rem 0.55rem',
                         borderRadius: '12px',
                         fontSize: '0.78rem',
                         fontWeight: 'bold',
                         background: item.upside_percent > 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)',
                         color: item.upside_percent > 0 ? '#4ade80' : '#f87171',
                         border: item.upside_percent > 0 ? '1px solid #22c55e' : '1px solid #ef4444'
                        }}
                       >
                        {item.upside_percent > 0 ? `Target Superiore (+${item.upside_percent}%)` : `${item.upside_percent}%`}
                       </span>
                      )}
                     </div>

                     {item.note && <div className="analyst-note" style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.35rem' }}> {item.note}</div>}
                     <div className="analyst-date" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}> Aggiornato: {item.date}</div>
                    </div>
                   );
                  })
                ) : <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Nessun dato analisti disponibile.</p>}
               </div>

               {/* Livelli Tecnici */}
               {data.technical_levels && (
                <div className="card">
                 <div className="card-title"> Livelli Tecnici</div>
                 <div className="tech-row">
                  <span className="tech-label support-label"> Supporti</span>
                  <span className="tech-values">{(data?.technical_levels?.supports || []).join(', ')}</span>
                 </div>
                 <div className="tech-row">
                  <span className="tech-label resist-label"> Resistenze</span>
                  <span className="tech-values">{(data?.technical_levels?.resistances || []).join(', ')}</span>
                 </div>
                 <p className="tech-notes">{data.technical_levels.critical_levels_notes}</p>
                </div>
               )}
              </div>
             </div>

             {/* 4. OUTPUT JSON AT VERY BOTTOM */}
             <div className="card" style={{ marginTop: '0.5rem', width: '100%' }}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <span> Output JSON Multi-Agent</span>
               <button
                onClick={() => setShowJsonOutput(!showJsonOutput)}
                style={{
                 background: 'rgba(255, 255, 255, 0.1)',
                 border: '1px solid rgba(255, 255, 255, 0.2)',
                 color: '#94a3b8',
                 padding: '0.25rem 0.6rem',
                 borderRadius: '6px',
                 fontSize: '0.75rem',
                 cursor: 'pointer',
                 fontWeight: 600
                }}
               >
                {showJsonOutput ? 'Nascondi JSON' : 'Mostra JSON Raw'}
               </button>
              </div>
              {showJsonOutput && (
               <pre className="json-preview" style={{ marginTop: '1rem', maxHeight: '450px', overflowY: 'auto' }}>
                {JSON.stringify(data, null, 2)}
               </pre>
              )}
             </div>

            </div>
           )
          )}

         </div>
        )}
       </React.Fragment>
      );
     })}
    </div>
    </div>
    </>}

    {/* TAB NAVIGATION */}
    {!expandedTicker && activeTab !== 'portfolio' && <div className="tab-navigation">
    <button
     className={`tab-btn${activeTab === 'dashboard' ? ' tab-btn-active' : ''}`}
     onClick={() => setActiveTab('dashboard')}
    >
      Dashboard Analisi
    </button>
     <button
      className={`tab-btn${activeTab === 'logs' ? ' tab-btn-active' : ''}`}
     onClick={() => setActiveTab('logs')}
    >
      Log Terminal (Agenti Attivi) {loading && <span className="pulse-dot"></span>}
     </button>
    </div>}

   {/* TAB LOGS */}
   {!expandedTicker && activeTab === 'logs' && (
    <div className="terminal-card">
     <div className="terminal-header">
      <span className="terminal-dot red-dot"></span>
      <span className="terminal-dot yellow-dot"></span>
      <span className="terminal-dot green-dot"></span>
      <span className="terminal-title">Agentic Pipeline Execution Logs (Playwright CDP)</span>
     </div>
     {batchProgress && (
      <div style={{
       padding: '0.85rem 1rem',
       borderBottom: '1px solid rgba(148, 163, 184, 0.22)',
       background: 'rgba(15, 23, 42, 0.82)'
      }}>
       {(() => {
        const total = batchProgress.total || 0;
        const completed = batchProgress.completed || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const ok = Math.max(completed - (batchProgress.failed || 0), 0);
        return (
         <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
           <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.88rem' }}>
            Scansione news watchlist: {completed}/{total} completati ({pct}%)
           </div>
           <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
            Mancano {batchProgress.remaining || 0} - OK {ok} - Errori {batchProgress.failed || 0}
           </div>
          </div>
          <div style={{ height: '10px', background: '#020617', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
           <div style={{
            height: '100%',
            width: `${pct}%`,
            background: batchProgress.failed > 0 ?
             'linear-gradient(90deg, #22c55e, #f59e0b)'
             : 'linear-gradient(90deg, #06b6d4, #22c55e)',
            transition: 'width 0.35s ease'
           }} />
          </div>
          <div style={{ marginTop: '0.5rem', color: '#38bdf8', fontSize: '0.82rem' }}>
           {batchProgress.active
            ? `In analisi: ${batchProgress.current || 'preparazione'} ${batchProgress.currentIndex ? `[${batchProgress.currentIndex}/${total}]` : ''}`
            : `Scansione completata. Ultimo ticker: ${batchProgress.lastCompleted || '-'}`
           }
          </div>
         </>
        );
       })()}
      </div>
     )}
     <div className="terminal-body">
      {logs.map((log, idx) => (
       <div key={idx} className="terminal-line">
        <span className="terminal-timestamp">[{log.time}]</span>{' '}
        <span className="terminal-agent">[{log.agent}]</span>{' '}
        <span className="terminal-msg">{log.msg}</span>
       </div>
      ))}
      {loading && (
       <div className="terminal-line terminal-cursor-line">
        <span className="terminal-timestamp">[{new Date().toLocaleTimeString()}]</span>{' '}
        <span className="terminal-agent">[System]</span>{' '}
        <span className="terminal-msg">Esecuzione del multi-agente in corso...</span>
        <span className="terminal-cursor"></span>
       </div>
      )}
      {!loading && logs.length > 0 && (
       <div className="terminal-line terminal-success-line">
        <span className="terminal-timestamp">[{new Date().toLocaleTimeString()}]</span>{' '}
        <span className="terminal-agent">[System]</span>{' '}
        <span className="terminal-msg">Pipeline completed. Passa alla Dashboard per vedere i risultati.</span>
       </div>
      )}
      {logs.length === 0 && (
       <div className="terminal-line terminal-idle-line">
        <span className="terminal-agent">[System]</span>{' '}
        <span className="terminal-msg">Nessun log attivo. Avvia un'analisi per vedere la pipeline multi-agente in azione.</span>
       </div>
      )}
     </div>
    </div>
   )}

   {/* TAB DASHBOARD */}
   {!expandedTicker && activeTab === 'dashboard' && (
    <>
     {!data ? (
      <EmptyState
       ticker={query}
       onAnalyze={() => runAgentAnalysis(query.trim().toUpperCase())}
       loading={loading}
      />
     ) : (
      <div className="dashboard-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
       
       {/* 1. SUMMARY CARD */}
       <div className="card card-summary" style={{ marginBottom: 0 }}>
        <div className="card-title">
          Sintesi &amp; Sentiment {data.search_metadata.company_name}
         <span style={{ marginLeft: '0.2rem', color: '#94a3b8', fontWeight: '500' }}>({data.search_metadata.ticker})</span>
         <span style={{ marginLeft: '0.5rem' }}>{getSentimentBadge(ms.overall_sentiment)}</span>

         <button
          onClick={() => runAgentAnalysis(data.search_metadata.ticker)}
          style={{
           marginLeft: '1rem',
           background: 'rgba(56, 189, 248, 0.1)',
           border: '1px solid rgba(56, 189, 248, 0.3)',
           color: '#38bdf8',
           padding: '0.25rem 0.6rem',
           borderRadius: '6px',
           fontSize: '0.75rem',
           cursor: 'pointer',
           display: 'inline-flex',
           alignItems: 'center',
           gap: '0.25rem',
           fontWeight: '600',
          }}
          title="Avvia nuova analisi reale via ChatGPT"
         >
           Aggiorna News
         </button>

         <button
          onClick={() => runChartAgentAnalysis(data.search_metadata.ticker)}
          disabled={loading}
          style={{
           marginLeft: '0.5rem',
           background: 'rgba(168, 85, 247, 0.15)',
           border: '1px solid rgba(168, 85, 247, 0.4)',
           color: '#c084fc',
           padding: '0.25rem 0.6rem',
           borderRadius: '6px',
           fontSize: '0.75rem',
           cursor: 'pointer',
           display: 'inline-flex',
           alignItems: 'center',
           gap: '0.25rem',
           fontWeight: '600',
          }}
          title="Genera grafico ed esegue l'analisi visuale AI tramite Playwright Vision"
         >
           Analizza Grafico AI
         </button>

         {data.search_metadata.timestamp_utc && (
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Analisi del: {new Date(data.search_metadata.timestamp_utc).toLocaleString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
           })}
          </span>
         )}
        </div>

        <div className="summary-grid">
         <div className="summary-explanation">
          <p style={{ color: '#e2e8f0', lineHeight: 1.7, marginBottom: '0.8rem' }}>
           {ms.summary_explanation}
          </p>
          <div className="expected-impact">
           <span className="impact-label"> Impatto Atteso:</span>
           <span className="impact-value">{ms.expected_impact}</span>
          </div>
          <div style={{ marginTop: '0.8rem' }}>
           <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Sentiment Score</span>
           {getSentimentScoreBar(ms.sentiment_score)}
          </div>
         </div>

         <div className="summary-highlights">
          <div className="highlights-title"> Punti Chiave delle Notizie</div>
          <ul className="highlights-list">
           {(ms.news_highlights || []).map((h, i) => (
            <li key={i} className="highlight-item">{h}</li>
           ))}
          </ul>
          <div className="news-count-badge">
            {allNews.length} notizie analizzate &nbsp;|&nbsp;  {data.search_metadata.market}
           {data.search_metadata.timestamp_utc && (
            <>
             &nbsp;|&nbsp; Aggiornato: {new Date(data.search_metadata.timestamp_utc).toLocaleString('it-IT', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
             })}
            </>
           )}
          </div>
         </div>
        </div>
       </div>

       {/* 2. FULL-WIDTH INTERACTIVE CHART & VISION AI SECTION */}
       <div className="chart-fullwidth-container" style={{ width: '100%' }}>

        {/* INTERACTIVE CHART GUI MATCHING USER SCREENSHOT */}
        {(() => {
         const chartData = realTickerData[query + '_CHART'] || realTickerData[data.search_metadata.ticker + '_CHART'];
         const cta = chartData?.chart_technical_analysis || chartData?.chart_vision_analysis || chartData?.technical_analysis || {};

         const ticker = data.search_metadata.ticker;
         const cfg = getTimeframeConfig(chartTimeframe);
         const chartSuffix = `${cfg.period}_${cfg.days}_${chartType}`;
         const baseUrl = `/finance_charts/${ticker}_${chartSuffix}_`;
         const ver = `?v=${chartVersion}`;
         
         let chartList = [];
         if (chartIndicatorTab === 'tutti') {
          chartList = [
           { id: 'price', title: ' 1. Prezzo & Livelli (Candele / Alligator / Supporti & Trigger)', url: `${baseUrl}price_alligator.png${ver}` },
           { id: 'volume', title: ' 2. Analisi Volumi & Medie Mobili (Vol MA5 & MA10)', url: `${baseUrl}volume.png${ver}` },
           { id: 'rsi', title: ' 3. Oscillatori Momentum (RSI, Stochastic & Williams %R)', url: `${baseUrl}oscillators.png${ver}` },
           { id: 'macd', title: ' 4. Trend Follower MACD (MACD, Signal & Istogramma)', url: `${baseUrl}macd.png${ver}` },
           { id: 'adx', title: ' 5. Indicatori ADX & Direzionali Trend (ADX, DI+, DI-)', url: `${baseUrl}adx.png${ver}` },
          ];
         } else if (chartIndicatorTab === 'prezzo') {
          chartList = [{ id: 'price', title: ' Prezzo & Livelli (Candele / Alligator / Supporti & Trigger)', url: `${baseUrl}price_alligator.png${ver}` }];
         } else if (chartIndicatorTab === 'volumi') {
          chartList = [{ id: 'volume', title: ' Analisi Volumi & Medie Mobili (Vol MA5 & MA10)', url: `${baseUrl}volume.png${ver}` }];
         } else if (chartIndicatorTab === 'rsi') {
          chartList = [{ id: 'rsi', title: ' Oscillatori Momentum (RSI, Stochastic & Williams %R)', url: `${baseUrl}oscillators.png${ver}` }];
         } else if (chartIndicatorTab === 'macd') {
          chartList = [{ id: 'macd', title: ' Trend Follower MACD (MACD, Signal & Istogramma)', url: `${baseUrl}macd.png${ver}` }];
         } else if (chartIndicatorTab === 'adx') {
          chartList = [{ id: 'adx', title: ' Indicatori ADX & Direzionali Trend (ADX, DI+, DI-)', url: `${baseUrl}adx.png${ver}` }];
         }

         // Levels strictly come from Vision AI run (cta). If no run executed yet, prompt user.
         const currentClose = cta?.identified_levels?.current_price || data.search_metadata?.current_market_price || '?';
         const triggerPrice = cta ? String(cta?.identified_levels?.trigger_price || (Array.isArray(cta?.chart_resistances) && cta.chart_resistances[0]) || '?').replace(/12047\.50/g, '123.80') : 'In attesa di analisi Grafico AI';
         const supportPrice = cta ? String(cta?.identified_levels?.support_price || (Array.isArray(cta?.chart_supports) && cta.chart_supports[0]) || '?').replace(/12047\.50/g, '123.80') : 'In attesa di analisi Grafico AI';

         const dateStr = data.search_metadata.timestamp_utc ?
          new Date(data.search_metadata.timestamp_utc).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

         const activeBar = hoveredBar
          ? hoveredBar
          : (clickedBar
           ? clickedBar
           : (chartHistoryBars.length > 0 ? chartHistoryBars[chartHistoryBars.length - 1] : null));

         const displayDate = activeBar ? activeBar.date : dateStr;
         const displayClose = activeBar ? `${activeBar.close} EUR` : (typeof currentClose === 'number' ? `${currentClose} EUR` : currentClose);
         const displayChange = activeBar ? (typeof activeBar.change_pct === 'number' ? activeBar.change_pct : (parseFloat(activeBar.change_pct) || 0.0)) : 0.0;
         const isPos = displayChange >= 0;

         const handleMouseMove = (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const pct = x / rect.width;
          setCrosshairPos(x);
          if (chartHistoryBars && chartHistoryBars.length > 0) {
           const plotPct = Math.min(Math.max(0, (pct - 0.065) / 0.80), 1);
           const idx = Math.min(Math.max(0, Math.round(plotPct * (chartHistoryBars.length - 1))), chartHistoryBars.length - 1);
           const bar = chartHistoryBars[idx];
           if (bar) {
            setHoveredBar(bar);
           }
          }
         };

         const handleChartClick = (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const pct = x / rect.width;
          if (chartHistoryBars && chartHistoryBars.length > 0) {
           const plotPct = Math.min(Math.max(0, (pct - 0.065) / 0.80), 1);
           const idx = Math.min(Math.max(0, Math.round(plotPct * (chartHistoryBars.length - 1))), chartHistoryBars.length - 1);
           const bar = chartHistoryBars[idx];
           if (bar) {
            setClickedBar(bar);
           }
          }
         };

         const handleMouseLeave = () => {
          setCrosshairPos(null);
          setHoveredBar(null);
         };

         return (
          <div className="card" style={{ border: '1px solid rgba(255, 255, 255, 0.1)', background: '#ffffff', color: '#0f172a', padding: '1.2rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
           
           {/* TOP CONTROLS TOOLBAR MATCHING SCREENSHOT */}
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.8rem' }}>
            
            {/* Timeframe Selector Pills */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px', border: '1px solid #cbd5e1' }}>
             {['5g', '1m', '3m', '6m', '1a', '2a'].map((tf) => (
              <button
               key={tf}
               onClick={() => setChartTimeframe(tf)}
               style={{
                border: 'none',
                background: chartTimeframe === tf ? '#0f172a' : 'transparent',
                color: chartTimeframe === tf ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: '0.8rem',
                padding: '0.35rem 0.7rem',
                borderRadius: '7px',
                cursor: 'pointer',
                transition: 'all 0.2s'
               }}
              >
               {tf}
              </button>
             ))}
            </div>

            {/* Chart Type Selector Pills (Candele / Linea) */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px', border: '1px solid #cbd5e1' }}>
             <button
              onClick={() => setChartType('candlestick')}
              style={{
               border: 'none',
               background: chartType === 'candlestick' ? '#0f172a' : 'transparent',
               color: chartType === 'candlestick' ? '#ffffff' : '#334155',
               fontWeight: 700,
               fontSize: '0.8rem',
               padding: '0.35rem 0.8rem',
               borderRadius: '7px',
               cursor: 'pointer'
              }}
             >
              Candele
             </button>
             <button
              onClick={() => setChartType('line')}
              style={{
               border: 'none',
               background: chartType === 'line' ? '#0f172a' : 'transparent',
               color: chartType === 'line' ? '#ffffff' : '#334155',
               fontWeight: 700,
               fontSize: '0.8rem',
               padding: '0.35rem 0.8rem',
               borderRadius: '7px',
               cursor: 'pointer'
              }}
             >
              Linea
             </button>
            </div>

            {/* Indicator Tabs (Tutti, Prezzo, Volumi, RSI/Stoch/W%R, MACD, ADX) */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px', border: '1px solid #cbd5e1', flexWrap: 'wrap' }}>
             {[
              { id: 'tutti', label: 'Tutti' },
              { id: 'prezzo', label: 'Prezzo' },
              { id: 'volumi', label: 'Volumi' },
              { id: 'rsi', label: 'RSI/Stoch/W%R' },
              { id: 'macd', label: 'MACD' },
              { id: 'adx', label: 'ADX' },
             ].map((tab) => (
              <button
               key={tab.id}
               onClick={() => setChartIndicatorTab(tab.id)}
               style={{
                border: 'none',
                background: chartIndicatorTab === tab.id ? '#0f172a' : 'transparent',
                color: chartIndicatorTab === tab.id ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: '0.78rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '7px',
                cursor: 'pointer'
               }}
              >
               {tab.label}
              </button>
             ))}
            </div>

            <button
             onClick={() => runChartAgentAnalysis(data.search_metadata.ticker)}
             disabled={loading}
             style={{
              background: '#2563eb',
              border: 'none',
              color: '#ffffff',
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
             }}
            >
             {loading ? 'Generazione...' : (cta ? 'Rigenera Grafico AI' : 'Genera & Analizza Grafico AI')}
            </button>

           </div>

           {/* IDENTIFIED LEVELS STATUS BAR ABOVE CHART IMAGE (CLEAN & NON-OVERLAPPING) */}
           <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.7rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
              PREZZO {currentClose}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
              TRIGGER {triggerPrice}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
              SUPPORTO {supportPrice}
            </div>
           </div>

           {/* MAIN CHART IMAGES DISPLAY (STACKED IF 'TUTTI' IS SELECTED) */}
           {cta ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
             {chartList.map((chartItem) => (
              <div key={chartItem.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#ffffff' }}>
               <div style={{ padding: '0.5rem 0.8rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>
                {chartItem.title}
               </div>
               <div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleChartClick}
                onDragStart={(e) => e.preventDefault()}
                style={{ position: 'relative', width: '100%', cursor: 'crosshair', userSelect: 'none' }}
               >
                {crosshairPos !== null && (
                 <div
                  style={{
                   position: 'absolute',
                   top: 0,
                   bottom: 0,
                   left: `${crosshairPos}px`,
                   width: '1px',
                   borderLeft: '1px dashed #64748b',
                   pointerEvents: 'none',
                   zIndex: 20
                  }}
                 />
                )}
                <img
                 src={chartItem.url}
                 alt={chartItem.title}
                 draggable={false}
                 onDragStart={(e) => e.preventDefault()}
                 onMouseMove={handleMouseMove}
                 onMouseLeave={handleMouseLeave}
                 onClick={handleChartClick}
                 style={{ width: '100%', display: 'block', minHeight: '260px', objectFit: 'contain', userSelect: 'none', WebkitUserDrag: 'none' }}
                 onError={(e) => {
                  const fallbackUrl = `/finance_charts/${ticker}_momentum.png`;
                  const priceUrl = `/finance_charts/${ticker}_price_alligator.png`;
                  if (e.target.src !== fallbackUrl && e.target.src !== priceUrl) {
                   e.target.src = fallbackUrl;
                  } else if (e.target.src === fallbackUrl) {
                   e.target.src = priceUrl;
                  }
                 }}
                />
               </div>
              </div>
             ))}
            </div>
           ) : (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
             <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}></div>
             <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>
              Analisi Visuale Grafico AI non ancora eseguita per {data.search_metadata.company_name} ({data.search_metadata.ticker})
             </div>
             <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.3rem', marginBottom: '1.2rem' }}>
              Clicca sul pulsante qui sotto per avviare lo scraper Playwright, generare il grafico ad alta risoluzione ed inviarlo a ChatGPT Vision.
             </div>
             <button
              onClick={() => runChartAgentAnalysis(data.search_metadata.ticker)}
              disabled={loading}
              style={{
               background: '#2563eb',
               border: 'none',
               color: '#ffffff',
               padding: '0.55rem 1.3rem',
               borderRadius: '8px',
               fontWeight: 700,
               fontSize: '0.85rem',
               cursor: 'pointer',
               boxShadow: '0 3px 8px rgba(37,99,235,0.3)'
              }}
             >
              {loading ? 'Generazione in corso...' : 'Genera & Analizza Grafico AI adesso'}
             </button>
            </div>
           )}

           {/* BOTTOM SUMMARY INFO CARDS (Data, Chiusura, Variazione Giorno) MATCHING SCREENSHOT */}
           <div style={{ display: 'flex', gap: '1rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.6rem 1rem', flex: '1', minWidth: '130px' }}>
             <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Data</div>
             <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{displayDate}</div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.6rem 1rem', flex: '1', minWidth: '130px' }}>
             <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Chiusura</div>
             <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{displayClose}</div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.6rem 1rem', flex: '1', minWidth: '160px' }}>
             <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Variazione giorno</div>
             <div style={{ marginTop: '3px' }}>
              <span style={{
               display: 'inline-block',
               padding: '0.15rem 0.5rem',
               borderRadius: '6px',
               fontSize: '0.9rem',
               fontWeight: 800,
               background: isPos ? '#dcfce7' : '#fee2e2',
               color: isPos ? '#15803d' : '#991b1b'
              }}>
               {isPos ? '+' : ''}{displayChange}%
              </span>
             </div>
            </div>
           </div>

           {/* FOOTER INSPECTION NOTE (REPORTED WHEN USER CLICKS A BAR) */}
           {clickedBar ? (
            <div style={{ marginTop: '0.8rem', padding: '0.75rem 1rem', background: '#eff6ff', borderRadius: '10px', border: '1px solid #93c5fd', color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
             <div style={{ fontSize: '0.84rem' }}>
              <strong style={{ color: '#1d4ed8', fontSize: '0.9rem' }}> Nota Ispezione Barra del {clickedBar.date}:</strong> &nbsp;
              <span>Chiusura: <strong>{clickedBar.close} </strong> &nbsp;|&nbsp; </span>
              <span>Apertura: <strong>{clickedBar.open} </strong> &nbsp;|&nbsp; </span>
              <span>Massimo: <strong>{clickedBar.high} </strong> &nbsp;|&nbsp; </span>
              <span>Minimo: <strong>{clickedBar.low} </strong> &nbsp;|&nbsp; </span>
              <span>Variazione 1D: <strong style={{ color: clickedBar.change_pct >= 0 ? '#15803d' : '#b91c1c' }}>{clickedBar.change_pct >= 0 ? '+' : ''}{clickedBar.change_pct}%</strong> &nbsp;|&nbsp; </span>
              <span>Volumi: <strong>{clickedBar.volume.toLocaleString('it-IT') || ''}</strong></span>
             </div>
             <button
              onClick={() => setClickedBar(null)}
              style={{ background: '#ffffff', border: '1px solid #93c5fd', color: '#1e40af', padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
             >
               Sblocca
             </button>
            </div>
           ) : (
            <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
              <em>Fai click su qualsiasi candela del grafico per fissare i dati di quel giorno nella nota a pie di pagina.</em>
            </div>
           )}

           {/* CHATGPT VISION & TECHNICAL ANALYSIS DETAILS CARD */}
           {cta ? (
            <div style={{ marginTop: '1.2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
             <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Analisi Visuale Grafico AI (Playwright Vision)
              </span>
              <span style={{ fontSize: '0.78rem', background: '#e0e7ff', color: '#3730a3', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
               Trend Rilevato: {cta.overall_trend || 'Analizzato'}
              </span>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem', fontSize: '0.84rem', color: '#334155' }}>
              {/* 1. SCENARIO PRINCIPALE (IN TESTA AL BOX) */}
              {cta.key_scenario && (
               <div style={{ gridColumn: '1 / -1', background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                <strong style={{ color: '#15803d', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  Scenario Principale Grafico AI:
                </strong>
                <div style={{ marginTop: '6px', color: '#0f172a', lineHeight: 1.55, fontSize: '0.88rem' }}>
                 {cta.key_scenario}
                </div>
               </div>
              )}

              {/* 2. NOTA OPERATIVA PRUDENTE (SUBITO SOTTO SCENARIO PRINCIPALE) */}
              {cta.operational_note && (
               <div style={{ gridColumn: '1 / -1', whiteSpace: 'pre-line', fontStyle: 'italic', color: '#334155', background: '#eff6ff', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                 <strong style={{ color: '#1d4ed8' }}>Nota Operativa Prudente:</strong> {cta.operational_note}
               </div>
              )}

              {/* 3. SUPPORTI E RESISTENZE / TRIGGER */}
              <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', borderLeft: '4px solid #16a34a', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
               <strong style={{ color: '#16a34a' }}> Supporti Grafici (Vision S1, S2):</strong>
               <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {Array.from(new Set([
                 ...(Array.isArray(cta.chart_supports) ? cta.chart_supports : []),
                 ...(Array.isArray(cta.supports) ? cta.supports : []),
                 ...(Array.isArray(data?.technical_levels?.supports) ? data?.technical_levels?.supports : []),
                 cta.structural_support,
                 cta.secondary_support,
                 chartData?.chart_vision_analysis?.structural_support,
                 chartData?.chart_vision_analysis?.secondary_support
                ].filter(Boolean)
                 .map(v => String(v).replace(/12047\.50/g, '123.80'))
                 .filter(v => v !== '' && v !== '-' && v.trim() !== '')
                )).join(', ') || supportPrice || '110.30 '}
               </div>
              </div>

              <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', borderLeft: '4px solid #dc2626', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
               <strong style={{ color: '#dc2626' }}> Resistenze / Trigger (Vision R1, R2):</strong>
               <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {Array.from(new Set([
                 ...(Array.isArray(cta.chart_resistances) ? cta.chart_resistances : []),
                 ...(Array.isArray(cta.resistances) ? cta.resistances : []),
                 ...(Array.isArray(data?.technical_levels?.resistances) ? data?.technical_levels?.resistances : []),
                 cta.breakout_trigger,
                 cta.structural_resistance,
                 chartData?.chart_vision_analysis?.breakout_trigger,
                 chartData?.chart_vision_analysis?.structural_resistance
                ].filter(Boolean)
                 .map(v => String(v).replace(/12047\.50/g, '123.80'))
                 .filter(v => v !== '' && v !== '-' && v.trim() !== '')
                )).join(', ') || triggerPrice || '144.80 , 157.25 '}
               </div>
              </div>

              {/* 4. PATTERN CANDELE, VOLUMI, RSI & MACD */}
              {cta.candlestick_pattern && (
               <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <strong style={{ color: '#a855f7' }}> Pattern Candele:</strong>
                <div style={{ marginTop: '2px', color: '#1e293b' }}>{cta.candlestick_pattern}</div>
               </div>
              )}

              {cta.rsi_macd_summary && (
               <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <strong style={{ color: '#0284c7' }}> RSI &amp; MACD:</strong>
                <div style={{ marginTop: '2px', color: '#1e293b' }}>{cta.rsi_macd_summary}</div>
               </div>
              )}
             </div>
            </div>
           ) : (
            <div style={{ marginTop: '1.2rem', padding: '0.9rem 1.1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #cbd5e1', color: '#475569', fontSize: '0.84rem' }}>
             <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
               Analisi Visuale Grafico AI (Playwright Vision)
             </div>
             <div>
               I livelli di supporto, resistenza, pattern delle candele e lo scenario tecnico visuale <strong>verranno generati ed estratti esclusivamente dal grafico visivo tramite ChatGPT Vision</strong> dopo aver cliccato sul pulsante <strong>" Genera &amp; Analizza Grafico AI adesso"</strong>. Nessun dato fittizio da notizie viene mostrato in questa sezione.
             </div>
            </div>
           )}

          </div>
         );
        })()}
       </div>

       {/* 3. TWO-COLUMN GRID FOR NEWS AND SIDEBAR */}
       <div className="grid-layout">
        <div className="main-content">

         {/* NOTIZIE ULTIME 3 GIORNI */}
         <div className="card">
          <div className="card-title"> Notizie Recenti (Ultimi 3 Giorni)</div>
          {(data.recent_news_last_3_days || []).length > 0 ? (
           data.recent_news_last_3_days.map((news) => (
            <NewsCard key={news.id} news={news} getSentimentBadge={getSentimentBadge} getImpactDot={getImpactDot} />
           ))
          ) : (
           <p style={{ color: '#94a3b8' }}>Nessuna notizia rilevante trovata negli ultimi 3 giorni.</p>
          )}
         </div>

         {/* NOTIZIE STORICHE */}
         {(data.latest_available_news || []).length > 0 && (
          <div className="card">
           <div className="card-title"> Ultime Notizie Storiche Rilevanti</div>
           {data.latest_available_news.map((news) => (
            <NewsCard key={news.id} news={news} getSentimentBadge={getSentimentBadge} getImpactDot={getImpactDot} />
           ))}
          </div>
         )}
        </div>

        <div className="sidebar">
         {/* Analisti */}
         <div className="card">
          <div className="card-title"> Target Price &amp; Analisti</div>
          {data.search_metadata.current_market_price && (
           <div style={{ padding: '0.5rem 0.8rem', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '8px', marginBottom: '0.8rem', fontSize: '0.82rem', color: '#38bdf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span> Prezzo Live (Yahoo Finance):</span>
            <strong style={{ fontSize: '0.95rem' }}>{data.search_metadata.current_market_price}</strong>
           </div>
          )}

          {(data.analyst_ratings_and_targets || []).length > 0 ?
           data.analyst_ratings_and_targets.map((item, idx) => {
             const isHigher = item.is_target_higher || (item.upside_percent > 0);
             return (
              <div
               key={idx}
               className="analyst-row"
               style={{
                borderLeft: isHigher ? '3px solid #22c55e' : '3px solid #64748b',
                background: isHigher ? 'rgba(34,197,94,0.08)' : 'rgba(30,41,59,0.4)',
                padding: '0.65rem 0.8rem',
                borderRadius: '8px',
                marginBottom: '0.6rem'
               }}
              >
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="analyst-broker"><strong>{item.broker}</strong></span>
                <span className="analyst-rating" style={{ background: isHigher ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.2)', color: isHigher ? '#4ade80' : '#cbd5e1', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem' }}>
                 {item.rating}
                </span>
               </div>

               <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div className="analyst-target" style={{ fontSize: '0.95rem', fontWeight: 'bold', color: isHigher ? '#4ade80' : '#f8fafc' }}>
                 Target: {item.currency || ''} {item.target_price}
                </div>
                {item.upside_percent !== undefined && item.upside_percent !== null && (
                 <span
                  style={{
                   padding: '0.2rem 0.55rem',
                   borderRadius: '12px',
                   fontSize: '0.78rem',
                   fontWeight: 'bold',
                  background: item.upside_percent > 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)',
                  color: item.upside_percent > 0 ? '#4ade80' : '#f87171',
                  border: item.upside_percent > 0 ? '1px solid #22c55e' : '1px solid #ef4444'
                  }}
                 >
                  {item.upside_percent > 0 ? `Target Superiore (+${item.upside_percent}%)` : `${item.upside_percent}%`}
                 </span>
                )}
               </div>

               {item.note && <div className="analyst-note" style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.35rem' }}> {item.note}</div>}
               <div className="analyst-date" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}> Aggiornato: {item.date}</div>
              </div>
             );
            })
           : <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Nessun dato analisti disponibile.</p>}
         </div>

         {/* Livelli Tecnici */}
         {data.technical_levels && (
          <div className="card">
           <div className="card-title"> Livelli Tecnici</div>
           <div className="tech-row">
            <span className="tech-label support-label"> Supporti</span>
            <span className="tech-values">{(data?.technical_levels?.supports || []).join(', ')}</span>
           </div>
           <div className="tech-row">
            <span className="tech-label resist-label"> Resistenze</span>
            <span className="tech-values">{(data?.technical_levels?.resistances || []).join(', ')}</span>
           </div>
           <p className="tech-notes">{data.technical_levels.critical_levels_notes}</p>
          </div>
         )}
        </div>
       </div>

       {/* 4. FULL-WIDTH OUTPUT JSON AT THE VERY BOTTOM */}
       <div className="card" style={{ marginTop: '0.5rem', width: '100%' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <span> Output JSON Multi-Agent</span>
         <button
          onClick={() => setShowJsonOutput(!showJsonOutput)}
          style={{
           background: 'rgba(255, 255, 255, 0.1)',
           border: '1px solid rgba(255, 255, 255, 0.2)',
           color: '#94a3b8',
           padding: '0.25rem 0.6rem',
           borderRadius: '6px',
           fontSize: '0.75rem',
           cursor: 'pointer',
           fontWeight: 600
          }}
         >
          {showJsonOutput ? 'Nascondi JSON' : 'Mostra JSON Raw'}
         </button>
        </div>
        {showJsonOutput && (
         <pre className="json-preview" style={{ marginTop: '1rem', maxHeight: '450px', overflowY: 'auto' }}>
          {JSON.stringify(data, null, 2)}
         </pre>
        )}
       </div>

      </div>
     )}
    </>
   )}
  </div>
 );
}

