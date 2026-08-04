import React, { useState } from 'react';

const MOCK_DATA = {
  search_metadata: {
    query_input: "AVIO.MI",
    company_name: "Avio S.p.A.",
    ticker: "AVIO.MI",
    market: "Borsa Italiana",
    timestamp_utc: "2026-08-04T21:00:00Z",
  },
  market_sentiment_summary: {
    overall_sentiment: "Positivo",
    sentiment_score: 0.8,
    expected_impact: "Rialzista di breve termine",
    summary_explanation: "Il titolo beneficia del buon sentiment generale nel settore difesa ed aerospazio in Europa. Non ci sono comuncati straordinari oggi ma il quadro tecnico rimane positivo sopra €29.50."
  },
  recent_news_last_3_days: [
    {
      id: "news_1",
      headline: "Settore difesa in rialzo a Piazza Affari, Avio tra i titoli ben comprati",
      date: "2026-08-04",
      source: "Yahoo Finanza / MarketScreener",
      category: "Macro / Settoriale",
      summary: "Gli acquisti sul comparto difesa ed aerospazio europeo sostengono Avio. Nessun nuovo comunicato diretto dall'azienda ma volumi in aumento.",
      sentiment: "Positivo",
      impact_rating: "Medio",
      source_url: "https://finance.yahoo.com"
    }
  ],
  latest_available_news: [
    {
      id: "news_2",
      headline: "Avio sigla nuovo accordo strategico per la fornitura di propulsori spaziali",
      date: "2026-07-22",
      source: "Il Sole 24 Ore",
      category: "Contratto / Partnership",
      summary: "Completata la firma per l'estensione del contratto di fornitura. Impatto positivo sui ricavi stimati del prossimo trimestre.",
      sentiment: "Positivo",
      impact_rating: "Alto",
      source_url: "https://www.ilsole24ore.com"
    }
  ],
  analyst_ratings_and_targets: [
    {
      broker: "Equita SIM",
      rating: "Hold",
      target_price: 32.5,
      currency: "EUR",
      date: "2026-06-01"
    }
  ],
  technical_levels: {
    supports: ["€29.50", "€28.60"],
    resistances: ["€31.70", "€33.00"],
    critical_levels_notes: "Sotto €29.50 possibile debolezza di breve; sopra €31.70 confermato momentum positivo."
  }
};

export default function App() {
  const [query, setQuery] = useState("AVIO.MI");
  const [data, setData] = useState(MOCK_DATA);
  const [loading, setLoading] = useState(false);

  const handleSearch = (searchTerm) => {
    setLoading(true);
    const target = searchTerm || query;
    setTimeout(() => {
      setData({
        ...MOCK_DATA,
        search_metadata: {
          ...MOCK_DATA.search_metadata,
          query_input: target,
          company_name: target.toUpperCase().includes("AVIO") ? "Avio S.p.A." : target.toUpperCase(),
          ticker: target.toUpperCase()
        }
      });
      setLoading(false);
    }, 600);
  };

  const getSentimentBadge = (sentiment) => {
    switch (sentiment?.toLowerCase()) {
      case 'positivo':
      case 'molto positivo':
        return <span className="badge badge-positive">{sentiment}</span>;
      case 'negativo':
      case 'molto negativo':
        return <span className="badge badge-negative">{sentiment}</span>;
      default:
        return <span className="badge badge-neutral">{sentiment || 'Neutro'}</span>;
    }
  };

  return (
    <div className="container">
      <header>
        <h1>⚡ Multi-Agent Financial News Analyzer</h1>
        <p>Estrazione notizie, classificazione e sentiment analysis via Playwright & ChatGPT</p>
      </header>

      <div className="search-box">
        <div className="input-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Inserisci Ticker (es. AVIO.MI, VOD.L, AAPL) o Nome Azienda..."
          />
          <button className="btn-primary" onClick={() => handleSearch(query)}>
            {loading ? "Analisi in corso..." : "Analizza Titolo"}
          </button>
        </div>
        <div className="quick-tickers">
          <span className="quick-label">Esplora Ticker Rapidi:</span>
          {["AVIO.MI", "VOD.L", "A2A.MI", "NVDA", "AAPL"].map((item) => (
            <button key={item} className="chip" onClick={() => { setQuery(item); handleSearch(item); }}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <div className="grid-layout">
          <div className="main-content">
            {/* Overview Sentiment Card */}
            <div className="card">
              <div className="card-title">
                📊 Sintesi & Sentiment - {data.search_metadata.company_name} ({data.search_metadata.ticker})
                {getSentimentBadge(data.market_sentiment_summary.overall_sentiment)}
              </div>
              <p style={{ color: '#e2e8f0', marginBottom: '0.8rem' }}>
                {data.market_sentiment_summary.summary_explanation}
              </p>
              <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                <strong>Impatto Atteso:</strong> {data.market_sentiment_summary.expected_impact}
              </div>
            </div>

            {/* News ultimi 3 giorni (incluso oggi) */}
            <div className="card">
              <div className="card-title">🗓️ Notizie Recenti (Ultimi 3 Giorni)</div>
              {data.recent_news_last_3_days.length > 0 ? (
                data.recent_news_last_3_days.map((news) => (
                  <div key={news.id} className="news-item">
                    <div className="news-header">
                      <span className="news-headline">{news.headline}</span>
                      {getSentimentBadge(news.sentiment)}
                    </div>
                    <div className="news-meta">
                      📅 {news.date} | 📰 {news.source} | 🏷️ {news.category}
                    </div>
                    <div className="news-summary">{news.summary}</div>
                  </div>
                ))
              ) : (
                <p style={{ color: '#94a3b8' }}>Nessuna notizia rilevante trovata negli ultimi 3 giorni.</p>
              )}
            </div>

            {/* Ultime notizie storiche disponibili */}
            <div className="card">
              <div className="card-title">📁 Ultime Notizie Storiche Rilevanti Disponibili</div>
              {data.latest_available_news.length > 0 ? (
                data.latest_available_news.map((news) => (
                  <div key={news.id} className="news-item">
                    <div className="news-header">
                      <span className="news-headline">{news.headline}</span>
                      {getSentimentBadge(news.sentiment)}
                    </div>
                    <div className="news-meta">
                      📅 {news.date} | 📰 {news.source} | 🏷️ {news.category}
                    </div>
                    <div className="news-summary">{news.summary}</div>
                  </div>
                ))
              ) : (
                <p style={{ color: '#94a3b8' }}>Nessuna notizia storica aggiuntiva presente.</p>
              )}
            </div>
          </div>

          <div className="sidebar">
            {/* Analisti e Targets */}
            <div className="card">
              <div className="card-title">🎯 Target Price & Analisti</div>
              {data.analyst_ratings_and_targets.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '0.8rem', fontSize: '0.9rem' }}>
                  <div><strong>{item.broker}</strong>: {item.rating}</div>
                  <div style={{ color: '#38bdf8' }}>Target: {item.currency} {item.target_price}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Aggiornato: {item.date}</div>
                </div>
              ))}
            </div>

            {/* Livelli Tecnici */}
            <div className="card">
              <div className="card-title">📈 Livelli Tecnici</div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#22c55e' }}>Supporti:</strong> {data.technical_levels.supports.join(", ")}
              </div>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.8rem' }}>
                <strong style={{ color: '#ef4444' }}>Resistenze:</strong> {data.technical_levels.resistances.join(", ")}
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {data.technical_levels.critical_levels_notes}
              </p>
            </div>

            {/* JSON Output Raw */}
            <div className="card">
              <div className="card-title">⚙️ Output JSON Multi-Agent</div>
              <pre className="json-preview">{JSON.stringify(data, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
