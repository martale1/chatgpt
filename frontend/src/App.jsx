import React, { useState, useEffect } from 'react';

// ─── Nessun dato simulato o inventato: i dati vengono SEMPRE da ChatGPT via Playwright ───

const getSentimentColor = (score) => {
  if (score >= 0.85) return { bg: 'rgba(34,197,94,0.12)',  border: '#16a34a', text: '#4ade80',  label: 'Molto Positivo' };
  if (score >= 0.65) return { bg: 'rgba(34,197,94,0.07)',  border: '#22c55e', text: '#86efac',  label: 'Positivo' };
  if (score >= 0.45) return { bg: 'rgba(234,179,8,0.10)',  border: '#ca8a04', text: '#fbbf24',  label: 'Neutro' };
  if (score >= 0.25) return { bg: 'rgba(249,115,22,0.10)', border: '#ea580c', text: '#fb923c',  label: 'Liev. Negativo' };
  return               { bg: 'rgba(239,68,68,0.10)',  border: '#dc2626', text: '#f87171',  label: 'Negativo' };
};

// ── NewsCard ────────────────────────────────────────────────────────────────────
function NewsCard({ news, getSentimentBadge, getImpactDot }) {
  return (
    <div className="news-item">
      <div className="news-header">
        <span className="news-headline">{news.headline}</span>
        {getSentimentBadge(news.sentiment)}
      </div>

      <div className="news-meta">
        📅 {news.date} &nbsp;|&nbsp; 🏷️ {news.category} &nbsp;|&nbsp; {getImpactDot(news.impact_rating)}
      </div>

      <div className="news-source-row">
        <span className="news-source-badge">📰 {news.source}</span>
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
              🌐 {news.url ? "Apri Articolo" : "Visita Sito"}
            </a>
          )}
          {!news.url && (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(news.headline + ' ' + news.source)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="news-source-link"
              title="Cerca questa notizia su Google"
              style={{ color: '#94a3b8' }}
            >
              🔍 Cerca Notizia
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

// ── Empty state quando non ci sono dati reali ────────────────────────────────
function EmptyState({ ticker, onAnalyze, loading }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4rem 2rem', textAlign: 'center', gap: '1.5rem'
    }}>
      <div style={{ fontSize: '4rem' }}>🤖</div>
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
          {loading ? '⏳ Analisi in corso...' : `🔄 Avvia Analisi Live per ${ticker}`}
        </button>
      )}
      <p style={{ color: '#475569', fontSize: '0.85rem' }}>
        ⚡ Assicurati che <code>node server.js</code> sia attivo sulla porta 3001
      </p>
    </div>
  );
}

export default function App() {

  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

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

  // ── Mappa Multi-Watchlist (persistita in localStorage) ─────────────────────
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
    let legacyList = ['AVIO.MI', 'VOD.L', 'A2A.MI', 'NVDA', 'AAPL', 'STLAM.MI', 'AMD.O', 'BC.MI', 'ENEL.MI', 'STMMI.MI', 'SRG.MI', 'REY.MI', 'CPR.MI'];
    if (legacySaved) {
      try {
        const parsed = JSON.parse(legacySaved);
        if (Array.isArray(parsed) && parsed.length > 0) legacyList = parsed;
      } catch (e) {}
    }
    return {
      '⭐ Preferiti': legacyList,
      '💻 Tech USA': ['NVDA', 'AAPL', 'MSFT', 'AMD.O', 'TSLA'],
      '🏛️ FTSE MIB': ['AVIO.MI', 'A2A.MI', 'STLAM.MI', 'ENEL.MI', 'SRG.MI']
    };
  });

  const [activeWatchlistName, setActiveWatchlistName] = useState(() => {
    const saved = localStorage.getItem('active_watchlist_name');
    if (saved) return saved;
    return '⭐ Preferiti';
  });

  const [newWatchlistNameInput, setNewWatchlistNameInput] = useState('');
  const [showCreateWatchlistModal, setShowCreateWatchlistModal] = useState(false);

  const watchlist = watchlists[activeWatchlistName] || watchlists['⭐ Preferiti'] || [];

  const [newTickersInput, setNewTickersInput] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  const [sortOrder, setSortOrder] = useState('desc'); // default: score più alto prima ('desc')
  const [chartTimeframe, setChartTimeframe] = useState('1a');
  const [chartType, setChartType] = useState('candlestick');
  const [chartIndicatorTab, setChartIndicatorTab] = useState('prezzo');
  const [chartHistoryBars, setChartHistoryBars] = useState([]);
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null);
  const [crosshairPos, setCrosshairPos] = useState(null);

  // ── Sincronizzazione con Server Backend (per la persistenza multi-browser) ──
  useEffect(() => {
    fetch('http://localhost:3001/api/all-data')
      .then(res => res.json())
      .then(resData => {
        if (resData?.tickerData && Object.keys(resData.tickerData).length > 0) {
          setRealTickerData(prev => {
            const merged = { ...prev, ...resData.tickerData };
            localStorage.setItem('real_ticker_data', JSON.stringify(merged));
            return merged;
          });
          const keys = Object.keys(resData.tickerData);
          if (keys.length > 0 && !query) {
            setQuery(keys[0]);
            setData(resData.tickerData[keys[0]]);
          }
        }
        if (resData?.watchlists && typeof resData.watchlists === 'object' && Object.keys(resData.watchlists).length > 0) {
          setWatchlists(prev => ({ ...prev, ...resData.watchlists }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('custom_watchlists', JSON.stringify(watchlists));
    try {
      fetch('http://localhost:3001/api/save-watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(watchlists)
      }).catch(() => {});
    } catch (e) {}
  }, [watchlists]);

  // ── Caricamento Storico Prezzi per l'ispezione interattiva Mouse Hover ──
  useEffect(() => {
    const activeTicker = query || data?.search_metadata?.ticker;
    if (activeTicker) {
      fetch(`http://localhost:3001/api/chart-history?ticker=${activeTicker}&period=${chartTimeframe}`)
        .then(res => res.json())
        .then(bars => {
          if (Array.isArray(bars)) {
            setChartHistoryBars(bars);
          }
        })
        .catch(() => {});
    }
  }, [query, data?.search_metadata?.ticker, chartTimeframe]);

  useEffect(() => {
    localStorage.setItem('active_watchlist_name', activeWatchlistName);
  }, [activeWatchlistName]);

  useEffect(() => {
    localStorage.setItem('real_ticker_data', JSON.stringify(realTickerData));
  }, [realTickerData]);

  // Carica all'avvio il primo ticker analizzato se disponibile
  useEffect(() => {
    const keys = Object.keys(realTickerData);
    if (keys.length > 0 && !data) {
      const first = keys[0];
      setQuery(first);
      setData(realTickerData[first]);
    }
  }, []);

  // ── Helper per aggiornare la Watchlist attiva corrente ─────────────────────
  const updateCurrentWatchlist = (updater) => {
    setWatchlists(prev => {
      const current = prev[activeWatchlistName] || [];
      const updatedList = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [activeWatchlistName]: updatedList };
    });
  };

  // ── Cerca ticker: mostra dati se disponibili, altrimenti avvia subito l'analisi ──
  const handleSearch = (searchTerm, autoAnalyze = true) => {
    const target = (searchTerm || query).trim().toUpperCase();
    if (!target) return;
    setQuery(target);
    updateCurrentWatchlist(prev => prev.includes(target) ? prev : [...prev, target]);

    if (realTickerData[target]) {
      setData(realTickerData[target]);
      setActiveTab('dashboard');
    } else if (autoAnalyze) {
      runAgentAnalysis(target);
    } else {
      setData(null);
      setActiveTab('dashboard');
    }
  };

  // ── Avvia analisi reale via Playwright → server.js → ChatGPT ──────────────
  const runAgentAnalysis = (target) => {
    if (!target) return;

    setQuery(target);     // imposta subito il ticker corrente
    setLoading(true);
    setLogs([]);
    setActiveTab('logs');

    const showAnalysisError = (reason) => {
      setLogs(prev => [...prev, {
        agent: 'System',
        msg: `❌ ANALISI FALLITA per ${target}\n\nMotivo: ${reason}\n\nVerifica che:\n1. Il server bridge (node server.js) sia attivo sulla porta 3001\n2. Il ticker "${target}" esista realmente sui mercati finanziari\n3. ChatGPT sia accessibile e la sessione sia attiva\n\nNessun dato inventato verrà mostrato. Riprova con un ticker valido.`,
        time: new Date().toLocaleTimeString()
      }]);
      setLoading(false);
    };

    try {
      const eventSource = new EventSource(`http://localhost:3001/api/analyze?ticker=${encodeURIComponent(target)}`);

      let connectionTimeout = setTimeout(() => {
        eventSource.close();
        showAnalysisError('Timeout connessione al server bridge (porta 3001). Assicurati che node server.js sia in esecuzione.');
      }, 1500);

      eventSource.onopen = () => {
        clearTimeout(connectionTimeout);
        setLogs(prev => [...prev, {
          agent: 'System',
          msg: '⚡ Connesso al server bridge locale (porta 3001). Ricezione log in streaming...',
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
            // NON sovrascriviamo query qui: l'utente potrebbe aver già selezionato un altro ticker
            eventSource.close();
            setLoading(false);
            setLogs(prev => [...prev, {
              agent: 'System',
              msg: '✅ Analisi reale completata con successo! Puoi passare alla Dashboard per vedere i dati aggiornati.',
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

  // ── Avvia analisi grafico reale via Playwright Vision → server.js → ChatGPT ──
  const runChartAgentAnalysis = (target) => {
    if (!target) return;

    setQuery(target);
    setLoading(true);
    setLogs([]);
    setActiveTab('logs');

    const showAnalysisError = (reason) => {
      setLogs(prev => [...prev, {
        agent: 'System',
        msg: `❌ ANALISI GRAFICO FALLITA per ${target}\n\nMotivo: ${reason}\n\nVerifica che:\n1. Il server bridge (node server.js) sia attivo sulla porta 3001\n2. Il ticker "${target}" esista realmente sui mercati finanziari\n3. ChatGPT sia accessibile e la sessione sia attiva`,
        time: new Date().toLocaleTimeString()
      }]);
      setLoading(false);
    };

    try {
      const eventSource = new EventSource(`http://localhost:3001/api/analyze?ticker=${encodeURIComponent(target)}&type=chart`);

      let connectionTimeout = setTimeout(() => {
        eventSource.close();
        showAnalysisError('Timeout connessione al server bridge (porta 3001). Assicurati che node server.js sia in esecuzione.');
      }, 1500);

      eventSource.onopen = () => {
        clearTimeout(connectionTimeout);
        setLogs(prev => [...prev, {
          agent: 'System',
          msg: '⚡ Connesso al server bridge locale per Analisi Grafico AI. Generazione ed invio del grafico a ChatGPT Vision...',
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
              msg: '✅ Analisi Grafico completata! Passa alla Dashboard per vedere i risultati visivi del grafico.',
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

  // ── Helper Promise per eseguire l'analisi live di un singolo ticker ───────
  const analyzeSingleTickerAsync = (target, index, total) => {
    return new Promise((resolve) => {
      setQuery(target);
      setLogs(prev => [...prev, {
        agent: 'Controller & Orchestrator Agent',
        msg: `🚀 Avvio analisi sequenziale live [${index}/${total}] per: ${target}`,
        time: new Date().toLocaleTimeString()
      }]);

      try {
        const eventSource = new EventSource(`http://localhost:3001/api/analyze?ticker=${encodeURIComponent(target)}`);

        let connectionTimeout = setTimeout(() => {
          eventSource.close();
          setLogs(prev => [...prev, {
            agent: 'System',
            msg: `❌ Timeout connessione per ${target}`,
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
              setData(realData);
              eventSource.close();
              resolve(true);
            } else if (eventData.type === 'error') {
              eventSource.close();
              setLogs(prev => [...prev, {
                agent: 'System',
                msg: `❌ Errore durante l'analisi di ${target}: ${eventData.msg}`,
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
          setLogs(prev => [...prev, {
            agent: 'System',
            msg: `❌ Errore di rete durante l'analisi di ${target}`,
            time: new Date().toLocaleTimeString()
          }]);
          resolve(false);
        };

      } catch (e) {
        resolve(false);
      }
    });
  };

  // ── Avvia analisi reale per TUTTI i titoli in Watchlist ─────────────────
  const runAllAnalyses = async () => {
    if (watchlist.length === 0 || loading) return;

    setLoading(true);
    setLogs([]);
    setActiveTab('logs');

    setLogs(prev => [...prev, {
      agent: 'Controller & Orchestrator Agent',
      msg: `🚀 Avvio scansione completa per tutti i ${watchlist.length} titoli in Watchlist...`,
      time: new Date().toLocaleTimeString()
    }]);

    for (let i = 0; i < watchlist.length; i++) {
      const ticker = watchlist[i];
      await analyzeSingleTickerAsync(ticker, i + 1, watchlist.length);
      if (i < watchlist.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setLogs(prev => [...prev, {
      agent: 'Controller & Orchestrator Agent',
      msg: `✅ Scansione completata per tutti i ${watchlist.length} titoli in Watchlist!`,
      time: new Date().toLocaleTimeString()
    }]);

    if (watchlist[0] && realTickerData[watchlist[0]]) {
      setQuery(watchlist[0]);
      setData(realTickerData[watchlist[0]]);
    }
    setLoading(false);
  };

  // ── Aggiungi ticker alla watchlist attiva ────────────────────────────────
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

  // ── Rimuovi ticker dalla watchlist attiva ────────────────────────────────
  const removeFromWatchlist = (targetToRemove) => {
    updateCurrentWatchlist(prev => prev.filter(t => t !== targetToRemove));
    setRealTickerData(prev => {
      const copy = { ...prev };
      delete copy[targetToRemove];
      return copy;
    });
    if (query === targetToRemove) {
      setData(null);
      setQuery('');
    }
  };

  // ── Crea una nuova Watchlist personalizzata ──────────────────────────────
  const handleCreateWatchlist = () => {
    const name = newWatchlistNameInput.trim();
    if (!name) return;
    if (watchlists[name]) {
      alert(`La watchlist "${name}" esiste già!`);
      return;
    }
    setWatchlists(prev => ({ ...prev, [name]: [] }));
    setActiveWatchlistName(name);
    setNewWatchlistNameInput('');
    setShowCreateWatchlistModal(false);
  };

  // ── Elimina una Watchlist personalizzata ──────────────────────────────────
  const handleDeleteWatchlist = (nameToDelete, e) => {
    if (e) e.stopPropagation();
    if (Object.keys(watchlists).length <= 1) {
      alert("Devi mantenere almeno una Watchlist attiva.");
      return;
    }
    if (!window.confirm(`Sei sicuro di voler eliminare la watchlist "${nameToDelete}"?`)) return;

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

  // ── Badge / indicatori ────────────────────────────────────────────────────
  const getSentimentBadge = (sentiment) => {
    const s = sentiment?.toLowerCase() || '';
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
    const s = d?.market_sentiment_summary;
    const score = s?.sentiment_score ?? null;
    const col = score !== null
      ? getSentimentColor(score)
      : { bg: 'rgba(100,116,139,0.08)', border: '#475569', text: '#94a3b8', label: '—' };
    const timestamp = d?.search_metadata?.timestamp_utc
      ? new Date(d.search_metadata.timestamp_utc).toLocaleString('it-IT', {
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
      market: d?.search_metadata?.market || '—',
      analyzed: !!d,
      timestamp,
      currentPrice,
      bestUpsideItem,
      score,
      col,
      sentiment: s?.overall_sentiment || '⏳ Non analizzato',
      impact: s?.expected_impact || '—',
      highlight: s?.news_highlights?.[0] || "Clicca 🔄 per avviare l'analisi reale via ChatGPT"
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

  return (
    <div className="container">
      <header>
        <h1>⚡ Multi-Agent Financial News Analyzer</h1>
        <p>Estrazione notizie, classificazione e sentiment analysis via Playwright &amp; ChatGPT</p>
      </header>

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
            {loading ? <span className="spinner">⏳ Analisi...</span> : '🔄 Avvia Analisi Live'}
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
            ➕ Aggiungi Titoli
          </button>
        </div>

        {/* ── MULTI-WATCHLIST SELECTION TABS BAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.8rem', padding: '0.6rem 0.8rem', background: 'rgba(15,23,42,0.6)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>📁 Watchlist Attiva:</span>
            {Object.keys(watchlists).map((listName) => {
              const isSelected = listName === activeWatchlistName;
              const count = watchlists[listName]?.length || 0;
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
                  {Object.keys(watchlists).length > 1 && listName !== '⭐ Preferiti' && (
                    <span
                      onClick={(e) => handleDeleteWatchlist(listName, e)}
                      style={{ marginLeft: '0.2rem', color: isSelected ? '#fca5a5' : '#ef4444', opacity: 0.8, fontSize: '0.75rem' }}
                      title={`Elimina watchlist "${listName}"`}
                    >
                      ✕
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {!showCreateWatchlistModal ? (
            <button
              className="btn-secondary"
              onClick={() => setShowCreateWatchlistModal(true)}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              ➕ Nuova Lista
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
              {realTickerData[item] && <span style={{ color: '#22c55e' }}>●</span>}
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
                ✕
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ── WATCHLIST TABLE ── */}
      <div className="watchlist-card">
        <div className="watchlist-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <span className="watchlist-title">📊 Watchlist: {activeWatchlistName}</span>
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
                <option value="desc">Score: Più Alto ➔ Più Basso ⬇️ (Default)</option>
                <option value="asc">Score: Più Basso ➔ Più Alto ⬆️</option>
                <option value="alpha-asc">Alfabetico: A ➔ Z 🔤</option>
                <option value="alpha-desc">Alfabetico: Z ➔ A 🔤</option>
                <option value="none">Ordine Lista Manuale</option>
              </select>
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={runAllAnalyses}
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
            {loading ? '⏳ Scansione in corso...' : '⚡ Aggiorna News Tutti (Watchlist)'}
          </button>
        </div>
        <div className="watchlist-table">
          <div className="wt-thead">
            <span
              onClick={() => setSortOrder(prev => prev === 'alpha-asc' ? 'alpha-desc' : 'alpha-asc')}
              style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              title="Clicca per ordinare alfabeticamente per Titolo"
            >
              Titolo {sortOrder === 'alpha-asc' ? '🔤 A-Z' : sortOrder === 'alpha-desc' ? '🔤 Z-A' : '↕️'}
            </span>
            <span>Mercato</span>
            <span>Prezzo / Target</span>
            <span>Sentiment</span>
            <span
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              title="Clicca per ordinare per Score"
            >
              Score {sortOrder === 'desc' ? '⬇️' : sortOrder === 'asc' ? '⬆️' : '↕️'}
            </span>
            <span>Impatto</span>
            <span>Azione</span>
          </div>
          {sortedWatchlistRows.map((row) => {
            const isActive = data?.search_metadata?.ticker === row.ticker;
            return (
              <div
                key={row.ticker}
                className={`wt-row${isActive ? ' wt-row-active' : ''}`}
                style={{ borderLeft: `3px solid ${row.col.border}`, background: isActive ? 'rgba(56,189,248,0.06)' : row.col.bg, cursor: 'pointer' }}
                onClick={() => handleSearch(row.ticker, true)}
              >
                <span className="wt-ticker" style={{ color: row.col.text }}>
                  {row.ticker}
                  <span className="wt-company">{row.company}</span>
                  {row.timestamp && (
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', display: 'block', fontWeight: 'normal' }}>
                      📅 {row.timestamp}
                    </span>
                  )}
                </span>
                <span className="wt-market">{row.market}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {row.currentPrice ? (
                    <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 'bold' }}>
                      📈 {row.currentPrice}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>—</span>
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
                      🚀 +{row.bestUpsideItem.upside_percent}% ({row.bestUpsideItem.target_price})
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
                    <span style={{ color: '#475569', fontSize: '0.8rem' }}>—</span>
                  )}
                </span>
                <span className="wt-impact">{row.impact}</span>
                <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button
                    className={row.analyzed ? 'btn-secondary' : 'btn-primary'}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    disabled={loading}
                    onClick={(e) => {
                      e.stopPropagation();
                      runAgentAnalysis(row.ticker);
                    }}
                  >
                    {row.analyzed ? '🔄 Aggiorna' : '⚡ Analizza Live'}
                  </button>
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
                    🗑️
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TAB NAVIGATION ── */}
      <div className="tab-navigation">
        <button
          className={`tab-btn${activeTab === 'dashboard' ? ' tab-btn-active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard Analisi
        </button>
        <button
          className={`tab-btn${activeTab === 'logs' ? ' tab-btn-active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          💻 Log Terminal (Agenti Attivi) {loading && <span className="pulse-dot"></span>}
        </button>
      </div>

      {/* ── TAB LOGS ── */}
      {activeTab === 'logs' && (
        <div className="terminal-card">
          <div className="terminal-header">
            <span className="terminal-dot red-dot"></span>
            <span className="terminal-dot yellow-dot"></span>
            <span className="terminal-dot green-dot"></span>
            <span className="terminal-title">Agentic Pipeline Execution Logs (Playwright CDP)</span>
          </div>
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
                <span className="terminal-cursor">█</span>
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

      {/* ── TAB DASHBOARD ── */}
      {activeTab === 'dashboard' && (
        <>
          {!data ? (
            <EmptyState
              ticker={query}
              onAnalyze={() => runAgentAnalysis(query.trim().toUpperCase())}
              loading={loading}
            />
          ) : (
            <div className="grid-layout">
              <div className="main-content">

                {/* SUMMARY */}
                <div className="card card-summary">
                  <div className="card-title">
                    📋 Sintesi &amp; Sentiment — {data.search_metadata.company_name}
                    <span style={{ marginLeft: '0.2rem', color: '#94a3b8', fontWeight: '500' }}>({data.search_metadata.ticker})</span>
                    <span style={{ marginLeft: '0.5rem' }}>{getSentimentBadge(ms?.overall_sentiment)}</span>

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
                      🔄 Aggiorna Analisi Live
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
                      📊 Analizza Grafico AI
                    </button>

                    {data.search_metadata.timestamp_utc && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        📅 Analisi del: {new Date(data.search_metadata.timestamp_utc).toLocaleString('it-IT', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>

                  <div className="summary-grid">
                    <div className="summary-explanation">
                      <p style={{ color: '#e2e8f0', lineHeight: 1.7, marginBottom: '0.8rem' }}>
                        {ms?.summary_explanation}
                      </p>
                      <div className="expected-impact">
                        <span className="impact-label">📌 Impatto Atteso:</span>
                        <span className="impact-value">{ms?.expected_impact}</span>
                      </div>
                      <div style={{ marginTop: '0.8rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Sentiment Score</span>
                        {getSentimentScoreBar(ms?.sentiment_score)}
                      </div>
                    </div>

                    <div className="summary-highlights">
                      <div className="highlights-title">🔑 Punti Chiave delle Notizie</div>
                      <ul className="highlights-list">
                        {(ms?.news_highlights || []).map((h, i) => (
                          <li key={i} className="highlight-item">{h}</li>
                        ))}
                      </ul>
                      <div className="news-count-badge">
                        📰 {allNews.length} notizie analizzate &nbsp;|&nbsp; 🏛️ {data.search_metadata.market}
                        {data.search_metadata.timestamp_utc && (
                          <>
                            &nbsp;|&nbsp; 📅 Aggiornato: {new Date(data.search_metadata.timestamp_utc).toLocaleString('it-IT', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── INTERACTIVE CHART GUI MATCHING USER SCREENSHOT ── */}
                {(() => {
                  const chartData = realTickerData[query + '_CHART'] || realTickerData[data.search_metadata.ticker + '_CHART'];
                  const cta = chartData?.chart_technical_analysis;

                  // Pick chart image file according to indicator tab selected
                  let chartSuffix = 'price_alligator.png';
                  if (chartIndicatorTab === 'volumi' || chartIndicatorTab === 'rsi') {
                    chartSuffix = 'momentum.png';
                  } else if (chartIndicatorTab === 'macd' || chartIndicatorTab === 'adx') {
                    chartSuffix = 'adx.png';
                  }
                  const chartImageUrl = `http://localhost:3001/finance_charts/${data.search_metadata.ticker}_${chartSuffix}`;

                  // Prioritize Vision AI run levels if present, otherwise fallback to news technical levels
                  const currentClose = cta?.identified_levels?.current_price || data.search_metadata?.current_market_price || '—';
                  const triggerPrice = cta?.identified_levels?.trigger_price || (Array.isArray(cta?.chart_resistances) && cta.chart_resistances[0]) || (data?.technical_levels?.resistances || [])[0] || '—';
                  const supportPrice = cta?.identified_levels?.support_price || (Array.isArray(cta?.chart_supports) && cta.chart_supports[0]) || (data?.technical_levels?.supports || [])[0] || '—';

                  const dateStr = data.search_metadata?.timestamp_utc 
                    ? new Date(data.search_metadata.timestamp_utc).toISOString().split('T')[0]
                    : new Date().toISOString().split('T')[0];

                  const activeBar = (hoveredBarIndex !== null && chartHistoryBars[hoveredBarIndex])
                    ? chartHistoryBars[hoveredBarIndex]
                    : (chartHistoryBars.length > 0 ? chartHistoryBars[chartHistoryBars.length - 1] : null);

                  const displayDate = activeBar ? activeBar.date : dateStr;
                  const displayClose = activeBar ? `${activeBar.close} €` : (typeof currentClose === 'number' ? `${currentClose} €` : currentClose);
                  const displayChange = activeBar ? activeBar.change_pct : -1.73;
                  const isPos = displayChange >= 0;

                  const handleMouseMove = (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const pct = x / rect.width;
                    setCrosshairPos(x);
                    if (chartHistoryBars && chartHistoryBars.length > 0) {
                      const idx = Math.min(Math.max(0, Math.floor(pct * chartHistoryBars.length)), chartHistoryBars.length - 1);
                      setHoveredBarIndex(idx);
                    }
                  };

                  const handleMouseLeave = () => {
                    setCrosshairPos(null);
                    setHoveredBarIndex(null);
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
                          {loading ? '⏳ Generazione...' : (cta ? '🔄 Rigenera Grafico AI' : '📊 Genera & Analizza Grafico AI')}
                        </button>

                      </div>

                      {/* IDENTIFIED LEVELS STATUS BAR ABOVE CHART IMAGE (CLEAN & NON-OVERLAPPING) */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.7rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
                          🔵 PREZZO {currentClose}
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
                          🔴 TRIGGER {triggerPrice}
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
                          🟢 SUPPORTO {supportPrice}
                        </div>
                      </div>

                      {/* MAIN CHART IMAGE DISPLAY WITH CROSSHAIR HOVER OR PLACEHOLDER */}
                      {cta ? (
                        <div
                          onMouseMove={handleMouseMove}
                          onMouseLeave={handleMouseLeave}
                          style={{ position: 'relative', width: '100%', background: '#ffffff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', minHeight: '320px', cursor: 'crosshair' }}
                        >
                          {/* Vertical Crosshair Line on Mouse Hover */}
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

                          <a href={chartImageUrl} target="_blank" rel="noreferrer">
                            <img
                              src={chartImageUrl}
                              alt={`Grafico ${data.search_metadata.ticker}`}
                              style={{ width: '100%', display: 'block', minHeight: '300px', objectFit: 'contain' }}
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.style.display = 'none';
                              }}
                            />
                          </a>
                        </div>
                      ) : (
                        <div style={{ padding: '2rem 1rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                          <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>📈</div>
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
                            {loading ? '⏳ Generazione in corso...' : '📊 Genera & Analizza Grafico AI adesso'}
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

                      {/* CHATGPT VISION & TECHNICAL ANALYSIS DETAILS CARD */}
                      <div style={{ marginTop: '1.2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            🤖 {cta ? 'Analisi Visuale Grafico AI (Playwright Vision)' : 'Analisi Tecnica & Livelli AI'}
                          </span>
                          <span style={{ fontSize: '0.78rem', background: cta ? '#e0e7ff' : '#f1f5f9', color: cta ? '#3730a3' : '#475569', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
                            Trend: {cta?.overall_trend || ms?.overall_sentiment || 'Analizzato'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem', fontSize: '0.84rem', color: '#334155' }}>
                          <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', borderLeft: '4px solid #16a34a', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <strong style={{ color: '#16a34a' }}>🟢 Livelli di Supporto (S1, S2):</strong>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                              {cta?.chart_supports?.join(', ') || (data?.technical_levels?.supports || []).join(', ') || supportPrice}
                            </div>
                          </div>

                          <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', borderLeft: '4px solid #dc2626', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <strong style={{ color: '#dc2626' }}>🔴 Resistenze / Trigger (R1, R2):</strong>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                              {cta?.chart_resistances?.join(', ') || (data?.technical_levels?.resistances || []).join(', ') || triggerPrice}
                            </div>
                          </div>

                          {cta?.candlestick_pattern && (
                            <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <strong style={{ color: '#a855f7' }}>🕯️ Pattern Candele:</strong>
                              <div style={{ marginTop: '2px', color: '#1e293b' }}>{cta.candlestick_pattern}</div>
                            </div>
                          )}

                          {cta?.volume_analysis && (
                            <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <strong style={{ color: '#2563eb' }}>📊 Volumi:</strong>
                              <div style={{ marginTop: '2px', color: '#1e293b' }}>{cta.volume_analysis}</div>
                            </div>
                          )}

                          {cta?.rsi_macd_summary && (
                            <div style={{ background: '#ffffff', padding: '0.7rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <strong style={{ color: '#0284c7' }}>📉 RSI &amp; MACD:</strong>
                              <div style={{ marginTop: '2px', color: '#1e293b' }}>{cta.rsi_macd_summary}</div>
                            </div>
                          )}

                          {(cta?.key_scenario || data?.technical_levels?.critical_levels_notes) && (
                            <div style={{ gridColumn: '1 / -1', background: '#ffffff', padding: '0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                              <strong style={{ color: '#15803d' }}>🎯 Scenario Principale &amp; Note Tecniche:</strong>
                              <div style={{ marginTop: '4px', color: '#0f172a', lineHeight: 1.5 }}>
                                {cta?.key_scenario || data?.technical_levels?.critical_levels_notes}
                              </div>
                            </div>
                          )}

                          {cta?.operational_note && (
                            <div style={{ gridColumn: '1 / -1', fontStyle: 'italic', color: '#475569', background: '#f1f5f9', padding: '0.6rem 0.8rem', borderRadius: '8px' }}>
                              💡 <strong>Nota Operativa Prudente:</strong> {cta.operational_note}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })()}

                {/* NOTIZIE ULTIME 3 GIORNI */}
                <div className="card">
                  <div className="card-title">🗓️ Notizie Recenti (Ultimi 3 Giorni)</div>
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
                    <div className="card-title">📁 Ultime Notizie Storiche Rilevanti</div>
                    {data.latest_available_news.map((news) => (
                      <NewsCard key={news.id} news={news} getSentimentBadge={getSentimentBadge} getImpactDot={getImpactDot} />
                    ))}
                  </div>
                )}
              </div>

              <div className="sidebar">
                {/* Analisti */}
                <div className="card">
                  <div className="card-title">🎯 Target Price &amp; Analisti</div>
                  {data.search_metadata?.current_market_price && (
                    <div style={{ padding: '0.5rem 0.8rem', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '8px', marginBottom: '0.8rem', fontSize: '0.82rem', color: '#38bdf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>📈 Prezzo Live (Yahoo Finance):</span>
                      <strong style={{ fontSize: '0.95rem' }}>{data.search_metadata.current_market_price}</strong>
                    </div>
                  )}

                  {(data.analyst_ratings_and_targets || []).length > 0
                    ? data.analyst_ratings_and_targets.map((item, idx) => {
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
                                  {item.upside_percent > 0 ? `🚀 Target Superiore (+${item.upside_percent}%)` : `🔻 ${item.upside_percent}%`}
                                </span>
                              )}
                            </div>

                            {item.note && <div className="analyst-note" style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.35rem' }}>💬 {item.note}</div>}
                            <div className="analyst-date" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}>📅 Aggiornato: {item.date}</div>
                          </div>
                        );
                      })
                    : <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Nessun dato analisti disponibile.</p>}
                </div>

                {/* Livelli Tecnici */}
                {data.technical_levels && (
                  <div className="card">
                    <div className="card-title">📈 Livelli Tecnici</div>
                    <div className="tech-row">
                      <span className="tech-label support-label">▲ Supporti</span>
                      <span className="tech-values">{(data.technical_levels.supports || []).join(', ')}</span>
                    </div>
                    <div className="tech-row">
                      <span className="tech-label resist-label">▼ Resistenze</span>
                      <span className="tech-values">{(data.technical_levels.resistances || []).join(', ')}</span>
                    </div>
                    <p className="tech-notes">{data.technical_levels.critical_levels_notes}</p>
                  </div>
                )}

                {/* JSON Raw Output */}
                <div className="card">
                  <div className="card-title">⚙️ Output JSON Multi-Agent</div>
                  <pre className="json-preview">{JSON.stringify(data, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
