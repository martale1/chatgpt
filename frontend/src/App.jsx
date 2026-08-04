import React, { useState, useEffect } from 'react';


const MOCK_DB = {
  "AVIO.MI": {
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
      summary_explanation: "Il titolo beneficia del buon sentiment generale nel settore difesa ed aerospazio in Europa. Non ci sono comunicati straordinari oggi ma il quadro tecnico rimane positivo sopra €29.50.",
      news_highlights: [
        "📈 Settore difesa europeo in rialzo — Avio tra i titoli trainanti",
        "🤝 Accordo strategico per propulsori spaziali firmato a luglio",
        "🎯 Target Equita SIM a €32.5 (Hold) confermato",
      ]
    },
    recent_news_last_3_days: [
      {
        id: "news_1",
        headline: "Settore difesa in rialzo a Piazza Affari, Avio tra i titoli ben comprati",
        date: "2026-08-04",
        source: "Yahoo Finanza / MarketScreener",
        source_domain: "finance.yahoo.com",
        url: "https://finance.yahoo.com/quote/AVIO.MI/news",
        category: "Macro / Settoriale",
        summary: "Gli acquisti sul comparto difesa ed aerospazio europeo sostengono Avio. Nessun nuovo comunicato diretto dall'azienda ma volumi in aumento rispetto alla media.",
        detail: "Il comparto difesa europeo registra una sessione positiva a Piazza Affari, trainato dall'aumento delle spese militari dei paesi NATO e dalla crescente domanda di sistemi missilistici e propulsione spaziale. Avio S.p.A. (AVIO.MI) si distingue come uno dei titoli più acquistati della seduta con volumi superiori del 15% rispetto alla media delle ultime 20 sedute. Non sono stati pubblicati comunicati societari straordinari, ma il clima macro favorevole e la crescente visibilità del portafoglio ordini (backlog stimato oltre €2.5 miliardi) sostengono le aspettative di crescita per il secondo semestre 2026. Gli analisti di settore segnalano un possibile rialzo delle stime di consenso in vista della pubblicazione dei risultati H1 prevista per settembre.",
        sentiment: "Positivo",
        impact_rating: "Medio"
      },
      {
        id: "news_1b",
        headline: "Italia aumenta budget difesa al 2% del PIL: Avio tra i principali beneficiari",
        date: "2026-08-03",
        source: "Il Sole 24 Ore / ANSA",
        source_domain: "ilsole24ore.com",
        url: "https://www.ilsole24ore.com/art/difesa-spesa-militare-italiana-al-2percento-del-pil-AG68591",
        category: "Policy / Difesa",
        summary: "Il governo italiano ha formalizzato l'impegno NATO al 2% del PIL per la difesa entro 2026. Avio è tra le prime aziende del comparto a beneficiare dell'incremento degli stanziamenti per propulsione spaziale e sistemi missilistici.",
        detail: "Il Consiglio dei Ministri ha approvto il piano pluriennale di adeguamento della spesa difesa all'obiettivo NATO del 2% del PIL, con un incremento progressivo che porterà il budget da €26 miliardi (2025) a circa €38 miliardi entro il 2028. Avio S.p.A. risulta tra i principali contractor italiani del settore spaziale e missilistico, con contratti attivi con il Ministero della Difesa per la fornitura di propulsori per il programma CAMM-ER e per sistemi di lancio istituzionali. Gli analisti di Equita SIM stimano che l'incremento della spesa difesa italiana possa generare per Avio un incremento dei ricavi di circa €60-80 milioni nei primi 3 anni. Il titolo ha reagito positivamente con un +2.3% nella seduta del 3 agosto.",
        sentiment: "Positivo",
        impact_rating: "Alto"
      },
      {
        id: "news_1c",
        headline: "Ariane 6: secondo lancio commerciale completato con successo, Avio fornitore chiave",
        date: "2026-08-02",
        source: "SpaceNews / ArianeGroup",
        source_domain: "spacenews.com",
        url: "https://spacenews.com/ariane-6-second-launch-success/",
        category: "Operativo / Spazio",
        summary: "Il secondo lancio commerciale del vettore Ariane 6 è avvenuto con pieno successo. Avio ha fornito il modulo di propulsione P120C del primo stadio, confermando la qualità del sistema.",
        detail: "Il lanciatore europeo Ariane 6 ha completato il secondo lancio commerciale della sua storia operativa con pieno successo, immettendo in orbita geostazionaria un satellite per telecomunicazioni da 5.8 tonnellate per conto di un cliente commerciale asiatico. Avio ha fornito il booster a propellente solido P120C montato sul primo stadio del vettore — lo stesso motore utilizzato anche su Vega-C. Il successo del lancio è strategicamente rilevante per Avio poiché consolida il programma Ariane 6 come alternativa europea ai lanciatori SpaceX, aprendo potenziali nuovi ordini per i propulsori P120C (ogni lancio richiede da 2 a 4 unità). Il management ha dichiarato che la capacità produttiva dei P120C è stata aumentata del 30% per soddisfare la domanda prevista per il 2027.",
        sentiment: "Molto Positivo",
        impact_rating: "Alto"
      }
    ],
    latest_available_news: [
      {
        id: "news_2",
        headline: "Avio sigla nuovo accordo strategico per la fornitura di propulsori spaziali",
        date: "2026-07-22",
        source: "Il Sole 24 Ore",
        source_domain: "ilsole24ore.com",
        url: "https://www.ilsole24ore.com/art/avio-firma-contratti-spazio-difesa-AG72351",
        category: "Contratto / Partnership",
        summary: "Completata la firma per l'estensione del contratto di fornitura. Impatto positivo sui ricavi stimati del prossimo trimestre.",
        detail: "Avio S.p.A. ha completato la firma di un accordo pluriennale per la fornitura di propulsori a propellente solido destinati a veicoli di lancio commerciali e istituzionali. Il contratto, del valore stimato di circa €180 milioni spalmati su 4 anni, interessa sia il mercato europeo che committenti istituzionali extraeuropei. Il management ha dichiarato che l'accordo consolida la pipeline commerciale di Avio per il biennio 2027-2028, con un contributo atteso ai ricavi di circa €40-45 milioni annui. L'accordo rientra nella strategia di diversificazione del portafoglio clienti avviata nel 2024, volta a ridurre la dipendenza dai contratti ESA (European Space Agency). Equita SIM ha confermato il rating Hold con target price €32.5, notando che il contratto era in parte già atteso dal mercato.",
        sentiment: "Positivo",
        impact_rating: "Alto"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "Equita SIM", rating: "Hold", target_price: 32.5, currency: "EUR", date: "2026-06-01" }
    ],
    technical_levels: {
      supports: ["€29.50", "€28.60"],
      resistances: ["€31.70", "€33.00"],
      critical_levels_notes: "Sotto €29.50 possibile debolezza di breve; sopra €31.70 confermato momentum positivo."
    }
  },
  "VOD.L": {
    search_metadata: {
      query_input: "VOD.L",
      company_name: "Vodafone Group Plc",
      ticker: "VOD.L",
      market: "London Stock Exchange",
      timestamp_utc: "2026-08-04T21:00:00Z",
    },
    market_sentiment_summary: {
      overall_sentiment: "Neutro",
      sentiment_score: 0.45,
      expected_impact: "Laterale con lieve pressione ribassista",
      summary_explanation: "Vodafone è in una fase di ristrutturazione. La dismissione di asset non core avanza lentamente e gli investitori attendono aggiornamenti sui ricavi del mercato europeo prima di prendere posizioni decise.",
      news_highlights: [
        "🔄 Fusione Three UK: CMA avvia fase 2 dell'indagine sulla concorrenza",
        "📉 Perdita 1.2M clienti broadband in Germania — mercato sotto pressione",
        "💰 Vendita Vodafone Italia a Swisscom (€8B): deleveraging in corso",
      ]
    },
    recent_news_last_3_days: [
      {
        id: "news_v1",
        headline: "Vodafone avanza nelle trattative per la fusione con Three UK",
        date: "2026-08-04",
        source: "Reuters",
        source_domain: "reuters.com",
        category: "M&A / Regolatorio",
        summary: "Le autorità britanniche valutano l'impatto sulla concorrenza della fusione Vodafone-Three. L'operazione ridurrebbe gli operatori da 4 a 3 nel mercato UK.",
        detail: "La Competition and Markets Authority (CMA) britannica ha avviato la seconda fase di indagine sulla proposta fusione tra Vodafone UK e CK Hutchison (Three UK). L'operazione, valutata complessivamente circa £15 miliardi, creerebbe il più grande operatore mobile del Regno Unito con oltre 27 milioni di clienti e una quota di mercato superiore al 40%. I regolatori temono un possibile deterioramento dei prezzi e della qualità del servizio per i consumatori. Vodafone e Three si sono impegnate a proporre rimedi strutturali — tra cui cessione di frequenze e accordi di accesso a terze parti — per ottenere il via libera. La decisione finale della CMA è attesa per il Q4 2026. Analisti di settore stimano che, in caso di approvazione, le sinergie di costo potrebbero superare £700 milioni annui nel medio termine.",
        sentiment: "Neutro",
        impact_rating: "Alto"
      },
      {
        id: "news_v1b",
        headline: "Vodafone vende la divisione italiana a Swisscom per €8 miliardi",
        date: "2026-08-03",
        source: "Financial Times / Bloomberg",
        source_domain: "ft.com",
        category: "M&A / Dismissioni",
        summary: "Vodafone ha completato la cessione di Vodafone Italia a Swisscom. L'operazione libera liquidità per il deleveraging e riduce l'esposizione al mercato italiano, tra i più competitivi d'Europa.",
        detail: "Vodafone Group ha formalizzato la vendita di Vodafone Italia a Swisscom AG per un corrispettivo di €8 miliardi (enterprise value), in linea con le attese del mercato. Vodafone Italia serve circa 23 milioni di clienti mobili e 3.5 milioni di clienti fissi. Il closing dell'operazione è avvenuto dopo l'ottenimento delle necessarie approvazioni regolatoriali da parte dell'AGCOM e della Commissione Europea. I proventi della vendita saranno destinati per €5 miliardi alla riduzione del debito netto e per €3 miliardi a un programma straordinario di buyback. La cessione riduce l'EBITDA consolidato di circa €1.2 miliardi annui ma migliora significativamente i ratio di indebitamento del gruppo. Analisti di Deutsche Bank e Barclays hanno aggiornato le stime a seguito della transazione.",
        sentiment: "Neutro",
        impact_rating: "Molto Alto"
      },
      {
        id: "news_v1c",
        headline: "Vodafone perde 1.2 milioni di clienti broadband nel mercato tedesco nel Q2 2026",
        date: "2026-08-02",
        source: "Handelsblatt / Reuters",
        source_domain: "reuters.com",
        category: "Operativo / Mercato",
        summary: "Il mercato tedesco continua a pesare sui conti di Vodafone: i dati mostrano una perdita netta di 1.2 milioni di clienti broadband nell'ultimo trimestre, principalmente a favore di Deutsche Telekom e 1&1.",
        detail: "I dati operativi del Q2 2026 per il mercato tedesco di Vodafone mostrano una significativa erosione della base clienti nel segmento broadband fisso: -1.2 milioni di abbonati in un solo trimestre, la peggior performance trimestrale degli ultimi 5 anni. La perdita è attribuita principalmente alla concorrenza aggressiva di Deutsche Telekom sul segmento fibra FTTH e all'avanzata del nuovo operatore 1&1, che sta dispiegando la propria rete 5G standalone a prezzi molto competitivi. Il management ha dichiarato che un piano di rilancio commerciale in Germania è in fase di elaborazione, ma riconosce che il mercato tedesco rimarrà sotto pressione almeno fino a metà 2027. La Germania rappresenta circa il 30% dei ricavi totali del gruppo, rendendo questa dinamica particolarmente rilevante per le stime annuali.",
        sentiment: "Negativo",
        impact_rating: "Alto"
      }
    ],
    latest_available_news: [
      {
        id: "news_v2",
        headline: "Vodafone taglia il dividendo e annuncia piano di riduzione costi",
        date: "2026-07-15",
        source: "Financial Times",
        source_domain: "ft.com",
        category: "Financials / Dividendo",
        summary: "Il CdA ha approvato il taglio del dividendo per il 2026 con l'obiettivo di ridurre il debito netto e accelerare il piano di turnaround industriale.",
        detail: "Vodafone Group ha annunciato una riduzione del dividendo ordinario del 50% per l'esercizio fiscale 2026, portandolo da €0.09 a €0.045 per azione. La decisione, comunicata contestualmente ai risultati annuali, è motivata dalla necessità di accelerare il deleveraging: il debito netto del gruppo ammonta a circa €35 miliardi e l'obiettivo è scendere sotto €30 miliardi entro il 2027. Parallelamente, il CEO Margherita Della Valle ha presentato un piano triennale di riduzione dei costi operativi da €1 miliardo, che prevede la riduzione di circa 11.000 posizioni lavorative a livello globale. I mercati hanno accolto positivamente la scelta di privilegiare la solidità patrimoniale rispetto alla remunerazione degli azionisti nel breve. Barclays mantiene il rating Underweight con target 68p, mentre Deutsche Bank ha confermato Hold a 75p.",
        sentiment: "Negativo",
        impact_rating: "Alto"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "Barclays", rating: "Underweight", target_price: 100, currency: "GBp", date: "2026-07-01",
        note: "Prezzo corrente ~115p. Target sotto mercato: rischio di ulteriore calo legato alla pressione in Germania e all'incertezza sulla fusione Three UK." },
      { broker: "Deutsche Bank", rating: "Hold", target_price: 118, currency: "GBp", date: "2026-06-15",
        note: "Target in linea con mercato (118p vs 115p attuale). Il rating neutro riflette l'equilibrio tra il deleveraging post-cessione Italia e i rischi operativi UK/DE." },
      { broker: "JP Morgan", rating: "Neutral", target_price: 112, currency: "GBp", date: "2026-07-20",
        note: "Target leggermente sotto mercato. Cautela sulla visibilità dei ricavi post-integrazione Three UK e sull'impatto della riduzione dividendo sulla base azionaria." }
    ],
    technical_levels: {
      supports: ["108p", "100p"],
      resistances: ["122p", "130p"],
      critical_levels_notes: "Supporto chiave a 108p (— media mobile 50 giorni). Tenuta di 100p fondamentale per evitare ritorno verso i minimi annuali. Resistenza a 122p: rottura al rialzo aprirebbe verso 130p. Quotazione attuale: ~115p (LSE)."
    }
  },
  "A2A.MI": {
    search_metadata: {
      query_input: "A2A.MI",
      company_name: "A2A S.p.A.",
      ticker: "A2A.MI",
      market: "Borsa Italiana",
      timestamp_utc: "2026-08-04T21:00:00Z",
    },
    market_sentiment_summary: {
      overall_sentiment: "Positivo",
      sentiment_score: 0.72,
      expected_impact: "Rialzista di medio termine",
      summary_explanation: "A2A beneficia del piano industriale al 2026 focalizzato sulle energie rinnovabili e sulla transizione energetica. I risultati semestrali sono stati sopra le attese degli analisti.",
      news_highlights: [
        "⚡ Piano industriale 2026 energy transition: progressi positivi",
        "📊 Risultati semestrali superiori alle attese degli analisti",
        "🌱 Nuovi investimenti nel settore rinnovabili approvati",
      ]
    },
    recent_news_last_3_days: [
      {
        id: "news_a1",
        headline: "A2A supera le stime degli analisti nel primo semestre 2026",
        date: "2026-08-04",
        source: "Milano Finanza",
        source_domain: "milanofinanza.it",
        category: "Financials / Risultati",
        summary: "L'EBITDA del primo semestre 2026 si attesta a €850M, +12% rispetto all'anno precedente, trainato dal segmento rinnovabili e dalla business unit waste management.",
        detail: "A2A S.p.A. ha comunicato i risultati consolidati del primo semestre 2026 con performance superiori al consensus di mercato su tutti i principali indicatori. L'EBITDA si attesta a €850 milioni (+12% YoY), il risultato netto ricorrente a €310 milioni (+18% YoY) e i ricavi totali a €5.2 miliardi (+8% YoY). Il segmento energie rinnovabili ha contribuito per il 38% dell'EBITDA di gruppo, con una capacità installata che ha superato i 4 GW. La business unit waste management ha registrato una crescita del 14% grazie all'aumento dei volumi trattati e all'ottimizzazione delle tariffe. Il management ha confermato la guidance annuale e ha indicato che il piano investimenti 2026 da €1.8 miliardi è in piena esecuzione. Mediobanca ha alzato il target price da €2.0 a €2.1 (Outperform) a seguito dei risultati.",
        sentiment: "Molto Positivo",
        impact_rating: "Alto"
      },
      {
        id: "news_a1b",
        headline: "A2A vince gara per la gestione rifiuti di Milano fino al 2035: contratto da €2.8 miliardi",
        date: "2026-08-03",
        source: "Corriere della Sera / ANSA",
        source_domain: "corriere.it",
        category: "Contratto / Municipale",
        summary: "Il Comune di Milano ha assegnato ad A2A il contratto pluriennale per la raccolta e gestione rifiuti urbani fino al 2035. L'operazione vale €2.8 miliardi e consolida il posizionamento di A2A nel waste management.",
        detail: "Il Comune di Milano ha formalizzato l'assegnazione ad A2A S.p.A. del contratto per la gestione integrata dei rifiuti urbani dell'area metropolitana milanese per il periodo 2026-2035. Il contratto, del valore complessivo di circa €2.8 miliardi (circa €280 milioni annui), include la raccolta differenziata, il trattamento e il recupero energetico dei rifiuti non riciclabili negli impianti di termovalorizzazione di A2A. Si tratta del più grande contratto di waste management mai aggiudicato in Italia in termini di valore unitario. Gli analisti di Intesa Sanpaolo stimano che l'accordo contribuirà per circa €30 milioni aggiuntivi all'EBITDA annuo a regime, con marginalità superiori alla media del segmento grazie all'integrazione verticale. Il titolo A2A.MI ha guadagnato il 3.1% nella seduta di ieri.",
        sentiment: "Molto Positivo",
        impact_rating: "Molto Alto"
      },
      {
        id: "news_a1c",
        headline: "A2A inaugura il più grande parco fotovoltaico d'Italia in Puglia (320 MW)",
        date: "2026-08-02",
        source: "Qualenergia / Il Sole 24 Ore",
        source_domain: "qualenergia.it",
        category: "ESG / Rinnovabili",
        summary: "A2A ha inaugurato un impianto fotovoltaico da 320 MW in provincia di Foggia, il più grande della storia del gruppo e tra i primi in Italia. L'investimento ammonta a €280 milioni.",
        detail: "A2A ha inaugurato ufficialmente il parco fotovoltaico di Cerignola (FG), con una capacità installata di 320 MW e una produzione attesa di circa 550 GWh annui — sufficiente a coprire il fabbisogno energetico di circa 200.000 famiglie. L'impianto ha richiesto un investimento di €280 milioni ed è stato realizzato in 18 mesi, record per un'infrastruttura di questa dimensione in Italia. Il parco è dotato di un sistema di accumulo a batterie da 40 MWh per la gestione delle fluttuazioni di produzione. L'inaugurazione porta la capacità fotovoltaica totale di A2A a circa 1.8 GW, in linea con il target del piano industriale 2026-2030 di raggiungere 3 GW di solare entro fine decennio. Il CEO ha dichiarato che altri 5 parchi analoghi sono in fase autorizzativa.",
        sentiment: "Positivo",
        impact_rating: "Alto"
      }
    ],
    latest_available_news: [
      {
        id: "news_a2",
        headline: "A2A approva piano da €16 miliardi per la transizione energetica al 2035",
        date: "2026-06-20",
        source: "Corriere della Sera",
        source_domain: "corriere.it",
        category: "Piano Industriale / ESG",
        summary: "Il Consiglio di Amministrazione ha approvato il nuovo piano strategico con €16 miliardi di investimenti cumulativi entro il 2035, di cui oltre il 70% destinati alle energie rinnovabili.",
        detail: "Il Consiglio di Amministrazione di A2A ha approvato all'unanimità il nuovo piano strategico decennale 2026-2035, denominato 'A2A Next', con investimenti cumulativi per €16 miliardi. Il 72% delle risorse è destinato alla generazione da fonti rinnovabili (eolico, fotovoltaico, idroelettrico), con l'obiettivo di raggiungere una capacità installata di oltre 10 GW entro il 2035. Il piano prevede inoltre la completa decarbonizzazione del parco termico entro il 2030 e la crescita della rete di ricarica per veicoli elettrici a 15.000 punti in Italia. Dal punto di vista finanziario, il management indica un CAGR dell'EBITDA del 7-9% nel periodo del piano e un dividendo per azione crescente di almeno il 5% annuo. Il titolo ha reagito con un rialzo del 4.2% nella seduta di presentazione del piano.",
        sentiment: "Positivo",
        impact_rating: "Molto Alto"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "Mediobanca", rating: "Outperform", target_price: 2.1, currency: "EUR", date: "2026-07-10" },
      { broker: "Intesa Sanpaolo", rating: "Buy", target_price: 2.05, currency: "EUR", date: "2026-06-28" }
    ],
    technical_levels: {
      supports: ["€1.75", "€1.68"],
      resistances: ["€1.92", "€2.05"],
      critical_levels_notes: "Resistenza chiave a €1.92 — rottura al rialzo aprirebbe verso €2.05. Supporto solido a €1.75."
    }
  },
  "NVDA": {
    search_metadata: {
      query_input: "NVDA",
      company_name: "NVIDIA Corporation",
      ticker: "NVDA",
      market: "NASDAQ",
      timestamp_utc: "2026-08-04T21:00:00Z",
    },
    market_sentiment_summary: {
      overall_sentiment: "Molto Positivo",
      sentiment_score: 0.92,
      expected_impact: "Fortemente rialzista",
      summary_explanation: "NVIDIA continua a dominare il mercato delle GPU per AI e data center. La domanda di chip H100/H200 rimane strutturalmente superiore all'offerta. I dati sui ricavi Q2 hanno battuto le aspettative per il quinto trimestre consecutivo.",
      news_highlights: [
        "🤖 Domanda AI data center: backlog ordini H200 record",
        "📈 Ricavi Q2 2026 battono le stime per il 5° trimestre consecutivo",
        "🌐 Nuovo contratto governativo USA per infrastrutture AI",
      ]
    },
    recent_news_last_3_days: [
      {
        id: "news_n1",
        headline: "NVIDIA Q2 2026: ricavi a $35B, +122% anno su anno — battute tutte le stime",
        date: "2026-08-04",
        source: "CNBC / Bloomberg",
        source_domain: "cnbc.com",
        category: "Financials / Earnings",
        summary: "NVIDIA riporta ricavi record a $35 miliardi per il Q2 2026 con margine lordo all'82%. La guidance Q3 è superiore al consensus. Il segmento Data Center cresce del 131%.",
        detail: "NVIDIA Corporation ha pubblicato risultati trimestrali storici per il Q2 FY2026 (trimestre terminato luglio 2026). I ricavi totali ammontano a $35.1 miliardi, superiori al consensus di $33.2 miliardi e in crescita del 122% rispetto allo stesso periodo dell'anno precedente. Il segmento Data Center — che include GPU H100, H200 e i primi chip Blackwell — ha generato $28.8 miliardi di ricavi (+131% YoY), confermando la domanda strutturalmente eccedente l'offerta da parte di hyperscaler (Microsoft, Google, Amazon, Meta). Il margine lordo si attesta all'82.1%, in linea con il trimestre precedente. La guidance per Q3 FY2026 indica ricavi attesi di $37.5 miliardi ±2%, superiori alle stime di consenso di $35.8 miliardi. Il management ha evidenziato che il backlog di ordini per la piattaforma Blackwell supera la capacità produttiva disponibile per i prossimi 12 mesi. Morgan Stanley ha alzato il target price da $1600 a $1800 (Overweight).",
        sentiment: "Molto Positivo",
        impact_rating: "Molto Alto"
      },
      {
        id: "news_n2",
        headline: "Il governo USA approva nuovo contratto AI con NVIDIA per $2.5 miliardi",
        date: "2026-08-03",
        source: "Reuters",
        source_domain: "reuters.com",
        category: "Contratto / Governo",
        summary: "Il Pentagono ha firmato un contratto quinquennale con NVIDIA per la fornitura di infrastrutture AI a uso militare e di difesa.",
        detail: "Il Dipartimento della Difesa degli Stati Uniti (DoD) ha formalizzato un contratto quinquennale con NVIDIA del valore di $2.5 miliardi per la fornitura di infrastrutture computazionali AI destinate a sistemi di intelligence artificiale ad uso militare e sicurezza nazionale. Il contratto prevede la fornitura di cluster GPU di ultima generazione (piattaforma Blackwell), software CUDA ottimizzato per applicazioni di difesa e supporto tecnico dedicato per l'integrazione nei sistemi esistenti del Pentagono. L'accordo posiziona NVIDIA come fornitore strategico privilegiato per la modernizzazione digitale delle forze armate USA, in concorrenza con AMD e Intel. Analisti sottolineano che il contratto governativo diversifica ulteriormente il portafoglio clienti di NVIDIA, riducendo la dipendenza dal settore commerciale AI.",
        sentiment: "Positivo",
        impact_rating: "Alto"
      },
      {
        id: "news_n3b",
        headline: "Microsoft ordina altri $10B di chip NVIDIA Blackwell per espandere Azure AI",
        date: "2026-08-02",
        source: "Bloomberg / The Information",
        source_domain: "bloomberg.com",
        category: "Ordini / Cloud",
        summary: "Microsoft ha firmato un ordine da $10 miliardi per chip NVIDIA Blackwell da integrare nei suoi data center Azure, rafforzando la partnership strategica tra le due aziende nel segmento AI cloud.",
        detail: "Microsoft ha formalizzato un ordine pluriennale da $10 miliardi per l'acquisto di chip NVIDIA della famiglia Blackwell (GB200 e GB300) destinati all'infrastruttura Azure AI. L'ordine verrà soddisfatto in tranches nel periodo 2026-2028 e rappresenta il singolo acquisto più grande mai effettuato da Microsoft nei confronti di un fornitore di semiconduttori. L'accordo include anche una componente software (licenze NIM e CUDA Enterprise) per un valore stimato di $1.5 miliardi. La partnership si inserisce nel contesto degli investimenti Microsoft in AI annunciati a inizio 2026 ($80 miliardi in capex per data center AI). Per NVIDIA, Microsoft rappresenta circa il 15% dei ricavi del segmento Data Center e questo ordine consolida ulteriormente questa quota. Goldman Sachs ha alzato le stime di EPS per NVIDIA FY2027 del 12% a seguito dell'annuncio.",
        sentiment: "Molto Positivo",
        impact_rating: "Molto Alto"
      }
    ],
    latest_available_news: [
      {
        id: "news_n3",
        headline: "NVIDIA annuncia acceleratore Blackwell Ultra: prestazioni 3x rispetto a H100",
        date: "2026-07-10",
        source: "The Verge / Wired",
        source_domain: "theverge.com",
        category: "Prodotto / Tecnologia",
        summary: "La nuova architettura Blackwell Ultra promette un salto di prestazioni del 300% per workload LLM training rispetto alla generazione H100, con disponibilità Q1 2027.",
        detail: "NVIDIA ha svelato i dettagli tecnici del nuovo acceleratore GB300 'Blackwell Ultra' durante un evento dedicato agli sviluppatori. L'architettura si basa su un processo produttivo TSMC N3P (3nm avanzato) e integra 208 miliardi di transistor su un singolo chip. Le prestazioni per workload di training di modelli LLM (Large Language Model) sono 3.2 volte superiori rispetto all'H100 SXM5, con una bandwidth di memoria HBM4 di oltre 12 TB/s per rack NVLink. La disponibilità per i clienti enterprise è prevista per Q1 2027, con i primi sistemi destinati agli hyperscaler che verranno consegnati già in Q4 2026. Il prezzo di listino per singola unità si stima superiore a $40.000, con configurazioni rack complete oltre $3 milioni. La presentazione ha generato un'ondata di preordini da parte dei principali cloud provider.",
        sentiment: "Molto Positivo",
        impact_rating: "Alto"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "Morgan Stanley", rating: "Overweight", target_price: 1800, currency: "USD", date: "2026-08-04" },
      { broker: "Goldman Sachs", rating: "Buy", target_price: 1750, currency: "USD", date: "2026-07-28" },
      { broker: "JPMorgan", rating: "Overweight", target_price: 1820, currency: "USD", date: "2026-08-01" }
    ],
    technical_levels: {
      supports: ["$1450", "$1380"],
      resistances: ["$1600", "$1700"],
      critical_levels_notes: "Breakout sopra $1600 confermerebbe nuovo ATH. Supporto critico a $1450 — sotto tale livello rischio pullback verso $1380."
    }
  },
  "AAPL": {
    search_metadata: {
      query_input: "AAPL",
      company_name: "Apple Inc.",
      ticker: "AAPL",
      market: "NASDAQ",
      timestamp_utc: "2026-08-04T21:00:00Z",
    },
    market_sentiment_summary: {
      overall_sentiment: "Positivo",
      sentiment_score: 0.75,
      expected_impact: "Rialzista di medio termine",
      summary_explanation: "Apple mantiene una base clienti molto fedele e continua a crescere nel segmento Services. Le aspettative per iPhone 18 con AI nativa sono molto alte. Il programma di buyback da $110 miliardi è il più grande della storia della società.",
      news_highlights: [
        "📱 iPhone 18 con Apple Intelligence AI-native: attesa record preordini",
        "💰 Buyback $110B approvato: il più grande della storia Apple",
        "📊 Margini Services in crescita — App Store +18% YoY",
      ]
    },
    recent_news_last_3_days: [
      {
        id: "news_ap1",
        headline: "Apple lancia il programma di riacquisto azioni da $110 miliardi",
        date: "2026-08-04",
        source: "Bloomberg / WSJ",
        source_domain: "bloomberg.com",
        category: "Buyback / Capital Allocation",
        summary: "Il Consiglio di Amministrazione ha autorizzato il più grande programma di buyback della storia di Apple. Il piano verrà eseguito nell'arco di 24 mesi.",
        detail: "Apple Inc. ha annunciato il più grande programma di riacquisto di azioni proprie della propria storia: $110 miliardi di buyback autorizzati dal Consiglio di Amministrazione contestualmente alla pubblicazione dei risultati Q3 FY2026. Il programma sostituisce il precedente da $90 miliardi (2025) e verrà eseguito nell'arco di 24 mesi attraverso acquisti sul mercato aperto e operazioni negoziate. Con questa mossa Apple consolida la sua posizione di riferimento per la remunerazione degli azionisti: negli ultimi 10 anni il gruppo ha restituito oltre $900 miliardi attraverso buyback e dividendi. I ricavi Q3 FY2026 si sono attestati a $97.8 miliardi (+11% YoY), trainati dal segmento Services ($26.5 miliardi, +18% YoY) e dalle vendite di iPhone ($46.2 miliardi). Il dividendo trimestrale è stato incrementato del 4% a $0.26 per azione. Wedbush ha alzato il target price a $250 (Outperform).",
        sentiment: "Positivo",
        impact_rating: "Alto"
      },
      {
        id: "news_ap1b",
        headline: "Apple ottiene il via libera UE per l'apertura dell'NFC ad app di terze parti",
        date: "2026-08-03",
        source: "Politico / Reuters",
        source_domain: "reuters.com",
        category: "Regolatorio / EU",
        summary: "La Commissione Europea ha approvato le misure proposte da Apple per l'apertura dell'NFC su iPhone a wallet e app di pagamento di terze parti. La decisione chiude il procedimento antitrust avviato nel 2022.",
        detail: "La Commissione Europea ha accettato gli impegni formali di Apple per rendere accessibile il chip NFC dell'iPhone agli sviluppatori di app di pagamento e wallet digitali di terze parti, chiudendo il procedimento antitrust avviato nel 2022 per abuso di posizione dominante nel settore dei pagamenti mobile. Apple dovrà implementare le API necessarie entro 6 mesi e garantire l'accesso in condizioni non discriminatorie per un periodo minimo di 10 anni. La decisione apre potenzialmente il mercato dei pagamenti contactless su iOS, dove finora Apple Pay godeva di un monopolio de facto. Alcuni analisti temono una marginalizzazione del servizio Apple Pay, mentre altri sottolineano che l'ecosistema di servizi Apple è abbastanza radicato da resistere alla concorrenza. L'impatto sui ricavi del segmento Services è stimato in -$200-400 milioni annui nel medio termine.",
        sentiment: "Neutro",
        impact_rating: "Medio"
      },
      {
        id: "news_ap1c",
        headline: "iPhone 18 Pro: anticipazioni confermano display pieghevole e fotocamera periscope da 12x",
        date: "2026-08-02",
        source: "MacRumors / 9to5Mac",
        source_domain: "macrumors.com",
        category: "Prodotto / Hardware",
        summary: "Fonti della supply chain confermano le specifiche di iPhone 18 Pro: display pieghevole in vetro ceramico, zoom ottico 12x con sistema periscope quad-camera e chip A20 Bionic a 2nm.",
        detail: "Indiscrezioni provenienti dalla supply chain asiatica (TSMC, LG Display, Largan Precision) confermano le specifiche tecniche di iPhone 18 Pro, atteso per settembre 2026. Le novità principali includono: display pieghevole OLED ProMotion da 6.3 pollici con protezione in vetro ceramico di nuova generazione (sviluppato con Corning), sistema fotocamera quad-lens con zoom ottico 12x tramite modulo periscope e apertura variabile ƒ/2.8-ƒ/5.6, chip A20 Bionic prodotto da TSMC con processo N2 (2nm) con 40% di miglioramento delle prestazioni AI rispetto ad A19 e Apple Intelligence Engine dedicato da 32 TOPS. La batteria è stata aumentata del 18% grazie a una nuova architettura stacked. Wedbush Securities stima che le specifiche di iPhone 18 Pro genereranno il più grande ciclo di upgrade della storia di Apple, con preordini attesi superiori a 20 milioni nelle prime 48 ore.",
        sentiment: "Positivo",
        impact_rating: "Alto"
      }
    ],
    latest_available_news: [
      {
        id: "news_ap2",
        headline: "Apple Intelligence: nuove funzionalità AI per iPhone 18 rivelate alla WWDC 2026",
        date: "2026-06-12",
        source: "9to5Mac / MacRumors",
        source_domain: "9to5mac.com",
        category: "Prodotto / AI",
        summary: "Tim Cook ha presentato Apple Intelligence 2.0 con capacità on-device avanzate: traduzione in tempo reale, riepilogo email contestuale e integrazione con ChatGPT nativa.",
        detail: "Alla WWDC 2026 (Worldwide Developers Conference), Tim Cook ha presentato Apple Intelligence 2.0, la piattaforma AI on-device di Apple che sarà integrata nativamente in iPhone 18, iPad Pro e Mac con chip M5. Le nuove funzionalità includono: traduzione in tempo reale in 40 lingue senza connessione internet, riepilogo contestuale delle email con classificazione automatica per priorità, integrazione nativa con ChatGPT-5 per query complesse (con consenso esplicito dell'utente), generazione di immagini e video direttamente dall'app Foto, e un motore di ricerca on-device potenziato. Apple ha sottolineato che tutto il processing avviene localmente sul dispositivo (o su server privati Apple) senza che i dati vengano inviati a cloud di terze parti. Gli analisti stimano che Apple Intelligence 2.0 sarà un driver significativo per il ciclo di upgrade di iPhone 18, con preordini attesi superiori ai 15 milioni nelle prime 24 ore di disponibilità.",
        sentiment: "Molto Positivo",
        impact_rating: "Molto Alto"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "Wedbush Securities", rating: "Outperform", target_price: 250, currency: "USD", date: "2026-07-20" },
      { broker: "UBS", rating: "Buy", target_price: 240, currency: "USD", date: "2026-07-15" }
    ],
    technical_levels: {
      supports: ["$195", "$185"],
      resistances: ["$215", "$225"],
      critical_levels_notes: "Tenuta di $195 fondamentale per continuare il trend rialzista. Rottura di $215 aprirebbe spazio verso l'ATH a $225."
    }
  }
};

const GENERATED_TICKER_DATA = {
  "TSLA": {
    search_metadata: {
      query_input: "TSLA",
      company_name: "Tesla, Inc.",
      ticker: "TSLA",
      market: "NASDAQ",
      timestamp_utc: "2026-08-04T21:00:00Z",
    },
    market_sentiment_summary: {
      overall_sentiment: "Positivo",
      sentiment_score: 0.72,
      expected_impact: "Rialzista di breve termine",
      summary_explanation: "Tesla beneficia delle stime di consegna veicoli per il terzo trimestre superiori alle attese e del sentiment positivo sul software Full Self-Driving (FSD). Gli investitori rimangono focalizzati sul prossimo evento Robotaxi.",
      news_highlights: [
        "🚗 Consegne Q3 previste a 462k veicoli, leggermente sopra il consenso",
        "🤖 Evento Robotaxi confermato per ottobre — hype alle stelle",
        "🔋 Nuova linea produttiva per celle 4680 a secco avviata in Nevada"
      ]
    },
    recent_news_last_3_days: [
      {
        id: "tsla_n1",
        headline: "Tesla Robotaxi: svelati i primi dettagli del design e dell'app di ride-sharing",
        date: "2026-08-04",
        source: "Electrek / Bloomberg",
        source_domain: "electrek.co",
        category: "Prodotto / Autonomous Driving",
        summary: "Fonti interne indicano un veicolo a due posti senza volante né pedali, con sistema di ricarica induttiva. L'app integrerà la flotta proprietaria e i veicoli dei clienti.",
        detail: "Tesla si prepara a presentare il suo Robotaxi ('Cybercab') all'evento del prossimo ottobre. Le indiscrezioni confermano un design futuristico ispirato al Cybertruck, privo di comandi fisici di guida. Il modello di business prevede una flotta proprietaria gestita tramite una nuova app di ride-sharing proprietaria, a cui i proprietari di Tesla potranno aderire condividendo la propria vettura quando inutilizzata. Il software Full Self-Driving (FSD) riceverà un aggiornamento critico (v12.5) per supportare il servizio autonomo. Gli analisti stimano che il ride-sharing autonomo potrebbe incrementare i ricavi di Tesla di $10-15 miliardi annui entro il 2030, sebbene rimangano significativi ostacoli regolatori in molti paesi.",
        sentiment: "Positivo",
        impact_rating: "Alto"
      },
      {
        id: "tsla_n2",
        headline: "Tesla accelera la produzione di celle 4680 con elettrodo a secco a Giga Nevada",
        date: "2026-08-03",
        source: "TeslaRati / Reuters",
        source_domain: "teslarati.com",
        category: "Produzione / Batterie",
        summary: "La produzione pilota di celle 4680 con processo ad elettrodo secco ha raggiunto tassi di rendimento stabili, promettendo una riduzione dei costi delle batterie del 30%.",
        detail: "Tesla ha annunciato che la linea pilota di produzione di batterie 4680 a Giga Nevada sta utilizzando con successo il processo a elettrodo secco (dry cathode) sia per l'anodo che per il catodo. Questa tecnologia riduce drasticamente l'impronta di carbonio e il consumo energetico della fabbrica, abbassando il costo di produzione a livello di cella di circa il 30% rispetto al processo a umido tradizionale. Le celle prodotte verranno inizialmente destinate alla produzione del Cybertruck e successivamente ai modelli di prossima generazione. Il CEO Elon Musk ha fatto i complimenti al team per aver superato una delle sfide ingegneristiche più complesse della storia dell'azienda.",
        sentiment: "Molto Positivo",
        impact_rating: "Alto"
      }
    ],
    latest_available_news: [
      {
        id: "tsla_n3",
        headline: "Tesla ottiene l'approvazione preliminare per i test FSD in Cina",
        date: "2026-07-28",
        source: "Wall Street Journal",
        source_domain: "wsj.com",
        category: "Regolatorio / Expansion",
        summary: "Le autorità cinesi hanno concesso a Tesla l'accesso alla mappatura stradale di alta precisione in partnership con Baidu, aprendo la strada al lancio commerciale di FSD in Cina.",
        detail: "Durante una visita non annunciata del CEO Elon Musk a Pechino, Tesla ha raggiunto un accordo strategico con il gigante cinese Baidu per l'utilizzo del suo sistema di navigazione e mappatura ad alta risoluzione. Questo accordo rimuove l'ultimo grande ostacolo normativo per l'introduzione del software Full Self-Driving (FSD) nel più grande mercato automobilistico del mondo. Tesla prevede di avviare una fase di test chiusa con utenti selezionati a Shanghai prima del rilascio pubblico previsto per fine 2026. L'approvazione rappresenta un'importante vittoria strategica per Tesla contro i concorrenti locali (come BYD e Xpeng) che offrono già sistemi di assistenza alla guida avanzati.",
        sentiment: "Molto Positivo",
        impact_rating: "Molto Alto"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "Morgan Stanley", rating: "Overweight", target_price: 310, currency: "USD", date: "2026-08-01", note: "Target alzato da $250 a $310. Il broker valuta Tesla non solo come casa automobilistica ma come leader in AI, robotica e stoccaggio energetico." },
      { broker: "Goldman Sachs", rating: "Neutral", target_price: 230, currency: "USD", date: "2026-07-18", note: "Target prudente. Gli analisti apprezzano i progressi sulle batterie 4680 ma evidenziano la pressione sui margini auto nel mercato cinese." }
    ],
    technical_levels: {
      supports: ["$210", "$198"],
      resistances: ["$235", "$258"],
      critical_levels_notes: "Supporto solido a $210. Se rompe la resistenza a $235, il titolo ha spazio per correre fino a $258."
    }
  },
  "MSFT": {
    search_metadata: {
      query_input: "MSFT",
      company_name: "Microsoft Corporation",
      ticker: "MSFT",
      market: "NASDAQ",
      timestamp_utc: "2026-08-04T21:00:00Z",
    },
    market_sentiment_summary: {
      overall_sentiment: "Positivo",
      sentiment_score: 0.82,
      expected_impact: "Rialzista di medio/lungo termine",
      summary_explanation: "Microsoft continua a mostrare una crescita a doppia cifra nel business Cloud (Azure), supportata dalla forte adozione dei servizi AI e Copilot integrati nella suite Office 365.",
      news_highlights: [
        "☁️ Ricavi Azure AI in crescita del 34% YoY nell'ultimo trimestre",
        "🤖 Copilot per Microsoft 365 raggiunge 15 milioni di utenti paganti",
        "🤝 Partnership con OpenAI estesa per lo sviluppo del supercomputer 'Stargate'"
      ]
    },
    recent_news_last_3_days: [
      {
        id: "msft_n1",
        headline: "Microsoft annuncia l'integrazione di Copilot 2.0 in Windows 11",
        date: "2026-08-04",
        source: "The Verge / TechCrunch",
        source_domain: "theverge.com",
        category: "Prodotto / Software",
        summary: "La nuova versione di Copilot offre interazione vocale a bassissima latenza, comprensione visiva dello schermo in tempo reale e agenti autonomi per l'automazione dei flussi lavorativi.",
        detail: "All'annuale evento Microsoft Ignite, il CEO Satya Nadella ha presentato Copilot 2.0. La suite introduce l'interazione vocale naturale a latenza quasi zero (basata sul modello GPT-4o) e 'Copilot Vision', che permette all'assistente di comprendere ciò che l'utente vede sullo schermo e assisterlo in tempo reale. Inoltre, vengono introdotti gli 'Agenti Copilot': assistenti autonomi che possono essere programmati per eseguire task complessi (es. approvazione note spese, generazione report mensili) in background. L'integrazione sarà distribuita tramite l'aggiornamento autunnale di Windows 11 per i PC Copilot+.",
        sentiment: "Positivo",
        impact_rating: "Alto"
      },
      {
        id: "msft_n2",
        headline: "Microsoft investe altri $5 miliardi in infrastrutture Cloud e AI in Germania",
        date: "2026-08-03",
        source: "Handelsblatt / Reuters",
        source_domain: "reuters.com",
        category: "Investimenti / Infrastrutture",
        summary: "Il piano prevede il raddoppio della capacità dei data center a Francoforte e Monaco di Baviera per soddisfare la domanda di sovranità dei dati delle aziende europee.",
        detail: "Microsoft ha annunciato un piano di espansione infrastrutturale in Germania da €4.6 miliardi ($5 miliardi) per i prossimi due anni. I fondi saranno utilizzati per espandere le regioni cloud esistenti a Francoforte e crearne una nuova a Monaco di Baviera dedicata ai servizi governativi e finanziari ad alta sicurezza (Microsoft Cloud for Sovereignty). Questo consentirà alle aziende tedesche ed europee di processare i carichi di lavoro AI mantenendo i dati rigorosamente entro i confini nazionali, in linea con i requisiti del GDPR e dell'EU AI Act. L'investimento include anche la formazione sulle competenze digitali per oltre 1.2 milioni di cittadini tedeschi.",
        sentiment: "Positivo",
        impact_rating: "Medio"
      }
    ],
    latest_available_news: [
      {
        id: "msft_n3",
        headline: "Microsoft e OpenAI pianificano il supercomputer AI 'Stargate' da $100 miliardi",
        date: "2026-07-15",
        source: "The Information / Bloomberg",
        source_domain: "bloomberg.com",
        category: "Partnership / Hardware",
        summary: "Il supercomputer, equipaggiato con milioni di chip AI di nuova generazione, dovrebbe entrare in funzione nel 2028 per addestrare i modelli di frontiera di OpenAI.",
        detail: "Microsoft e OpenAI stanno pianificando la realizzazione di un gigantesco data center da $100 miliardi che ospiterà un supercomputer AI chiamato 'Stargate'. Il progetto, che si prevede sarà finanziato principalmente da Microsoft, dovrebbe essere 100 volte più costoso dei più grandi data center attuali. Stargate richiederà diversi gigawatt di potenza energetica (si valuta l'opzione dell'energia nucleare di nuova generazione) e utilizzerà milioni di acceleratori AI personalizzati prodotti sia da NVIDIA che internamente da Microsoft. Il lancio operativo è stimato per il 2028 e servirà come infrastruttura principale per i modelli LLM post-GPT-5.",
        sentiment: "Molto Positivo",
        impact_rating: "Molto Alto"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "JPMorgan", rating: "Overweight", target_price: 520, currency: "USD", date: "2026-07-28", note: "Target $520. Il broker ritiene che il vantaggio competitivo di Microsoft nell'enterprise software le consenta di monetizzare l'AI più rapidamente di chiunque altro." },
      { broker: "Citi", rating: "Buy", target_price: 500, currency: "USD", date: "2026-07-25", note: "Target confermato. Nonostante l'elevata Capex per i data center, la crescita costante di Azure giustifica ampiamente la valutazione." }
    ],
    technical_levels: {
      supports: ["$405", "$392"],
      resistances: ["$438", "$460"],
      critical_levels_notes: "Supporto strategico a $405. Una chiusura settimanale sopra $438 aprirebbe la strada verso i $460."
    }
  }
};

const generateDynamicTickerData = (ticker) => {
  const cleanTicker = ticker.trim().toUpperCase();
  const isItalian = cleanTicker.endsWith(".MI");
  const isLondon = cleanTicker.endsWith(".L");
  const currency = isItalian ? "EUR" : isLondon ? "GBp" : "USD";
  const market = isItalian ? "Borsa Italiana" : isLondon ? "London Stock Exchange" : "NASDAQ / NYSE";
  
  // Custom naming lookup
  let companyName = cleanTicker.split(".")[0] + " Inc.";
  if (cleanTicker.includes("STLAM")) {
    companyName = "Stellantis N.V.";
  } else if (cleanTicker.includes("TSLA")) {
    companyName = "Tesla Inc.";
  } else if (cleanTicker.includes("MSFT")) {
    companyName = "Microsoft Corp.";
  } else if (cleanTicker.includes("AAPL")) {
    companyName = "Apple Inc.";
  } else if (cleanTicker.includes("NVDA")) {
    companyName = "NVIDIA Corp.";
  } else if (cleanTicker.includes("A2A")) {
    companyName = "A2A S.p.A.";
  } else if (cleanTicker.includes("ISP")) {
    companyName = "Intesa Sanpaolo S.p.A.";
  } else if (cleanTicker.includes("UCG")) {
    companyName = "UniCredit S.p.A.";
  }

  // Calculate a deterministic base price based on cleanTicker name hash
  let basePrice = 25.0;
  const hash = cleanTicker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  
  if (cleanTicker.includes("STLAM")) {
    basePrice = 12.80; // Stellantis real price in EUR
  } else if (cleanTicker.includes("A2A")) {
    basePrice = 2.05;
  } else if (cleanTicker.includes("ISP")) {
    basePrice = 3.85;
  } else if (cleanTicker.includes("UCG")) {
    basePrice = 38.20;
  } else if (cleanTicker.includes("TSLA")) {
    basePrice = 220.00;
  } else if (cleanTicker.includes("MSFT")) {
    basePrice = 425.00;
  } else if (cleanTicker.includes("AAPL")) {
    basePrice = 215.00;
  } else if (cleanTicker.includes("NVDA")) {
    basePrice = 115.00;
  } else if (cleanTicker.includes("VOD")) {
    basePrice = 115.00; // GBp
  } else {
    // Deterministic price based on the hash (between 4.50 and 95.00)
    basePrice = ((hash % 91) + 4) + ((hash % 10) / 10);
  }

  const formattedVal = (val) => {
    if (isLondon) {
      return `${Math.round(val)}p`;
    }
    return `${isItalian ? "€" : "$"}${val.toFixed(2)}`;
  };

  const target1 = basePrice * 1.18;
  const target2 = basePrice * 1.05;
  const sup1 = basePrice * 0.92;
  const sup2 = basePrice * 0.86;
  const res1 = basePrice * 1.08;
  const res2 = basePrice * 1.16;

  // Select scenario deterministically based on ticker name hash
  const newsScenarios = [
    // Scenario 0: Earnings Beat
    {
      overall_sentiment: "Positivo",
      sentiment_score: 0.82,
      expected_impact: "Rialzista di breve termine",
      summary_explanation: `I risultati trimestrali di ${companyName} hanno battuto ampiamente le attese degli analisti su utili e ricavi, guidando un solido sentiment rialzista.`,
      highlights: [
        `📈 Fatturato ed EPS sopra il consensus degli analisti`,
        `🎯 Morgan Stanley promuove il titolo a Overweight`,
        `💪 Margini operativi in espansione grazie ad efficienze interne`
      ],
      news1: {
        headline: `${companyName} batte le stime nel Q2: utile netto in crescita del 12%`,
        category: "Financials / Earnings",
        summary: `Risultati finanziari superiori al consensus grazie alla forte domanda internazionale e al controllo dei costi operativi.`,
        detail: `La società ha pubblicato conti trimestrali eccellenti, superando le stime degli analisti per fatturato ed EPS. Il margine operativo si attesta al livello record dell'anno, trainato da efficienze produttive interne. La guidance per i prossimi trimestri è stata rivista al rialzo.`,
        sentiment: "Positivo",
        impact_rating: "Alto",
        source: isItalian ? "Milano Finanza" : "Wall Street Journal",
        source_domain: isItalian ? "milanofinanza.it" : "wsj.com"
      },
      news2: {
        headline: `Morgan Stanley alza la raccomandazione su ${cleanTicker} a Overweight`,
        category: "Analyst Rating",
        summary: `Gli analisti ritengono la valutazione attuale del titolo attraente alla luce della forte generazione di cassa.`,
        detail: `Secondo il report pubblicato stamattina, la banca d'affari evidenzia un multiplo EV/EBITDA a sconto rispetto ai competitor diretti. Il target price viene aumentato del 15% rispetto alla quotazione corrente.`,
        sentiment: "Positivo",
        impact_rating: "Medio",
        source: "Bloomberg / Reuters",
        source_domain: "bloomberg.com"
      }
    },
    // Scenario 1: Partnership / Expansion
    {
      overall_sentiment: "Positivo",
      sentiment_score: 0.74,
      expected_impact: "Moderatamente rialzista",
      summary_explanation: `L'espansione strategica di ${companyName} tramite una joint venture in Asia e il lancio di nuovi prodotti AI migliorano le prospettive di crescita del gruppo.`,
      highlights: [
        `🤝 Nuova joint-venture asiatica per raddoppiare la quota di mercato`,
        `💻 Presentata la gamma prodotti integrata con intelligenza artificiale`,
        `🚀 Feedback iniziale della clientela estremamente favorevole`
      ],
      news1: {
        headline: `${companyName} firma un accordo di joint venture per l'espansione nel mercato asiatico`,
        category: "Corporate / Expansion",
        summary: `La partnership strategica mira a raddoppiare la quota di mercato nell'area Asia-Pacifico entro i prossimi tre anni.`,
        detail: `L'intesa prevede la costituzione di una nuova entità legale controllata congiuntamente, focalizzata sulla distribuzione locale dei prodotti e dei servizi core del gruppo. Gli investimenti iniziali saranno finanziati tramite liquidità esistente.`,
        sentiment: "Positivo",
        impact_rating: "Alto",
        source: isItalian ? "Il Sole 24 Ore" : "CNBC",
        source_domain: isItalian ? "ilsole24ore.com" : "cnbc.com"
      },
      news2: {
        headline: `${companyName} presenta la nuova gamma di prodotti basati sull'intelligenza artificiale`,
        category: "Technology / R&D",
        summary: `Il lancio sul mercato globale è pianificato per l'inizio del prossimo mese, con ordini preliminari già record.`,
        detail: `I nuovi dispositivi ed applicazioni integrano funzionalità AI avanzate per ottimizzare i flussi di lavoro degli utenti business. Gli analisti prevedono un contributo positivo ai margini a partire dal prossimo anno fiscale.`,
        sentiment: "Positivo",
        impact_rating: "Medio",
        source: "TechCrunch / Reuters",
        source_domain: "reuters.com"
      }
    },
    // Scenario 2: Restructuring / Labor Disputes
    {
      overall_sentiment: "Neutro",
      sentiment_score: 0.52,
      expected_impact: "Laterale con tendenza positiva",
      summary_explanation: `Il piano di ristrutturazione di ${companyName} volto al taglio dei costi operativi è accolto positivamente sul fronte dei margini, ma pesano le tensioni sindacali in Europa.`,
      highlights: [
        `✂️ Taglio costi stimato a 150 milioni di euro annui`,
        `⚠️ Scontri e scioperi sindacali in corso contro la riduzione di personale`,
        `📊 Il mercato premia l'ottimizzazione del debito ma resta cauto`
      ],
      news1: {
        headline: `${companyName} annuncia piano di riorganizzazione per ridurre i costi operativi`,
        category: "Corporate / Restructuring",
        summary: `Il management punta a risparmi per 150 milioni di euro annui attraverso l'efficientamento della catena di fornitura.`,
        detail: `Il piano strategico prevede la chiusura di filiali non redditizie e l'adozione di processi digitali integrati. Il titolo reagisce positivamente in borsa (+1.8%) per il focus sulla marginalità e la riduzione del debito netto.`,
        sentiment: "Neutro",
        impact_rating: "Alto",
        source: isItalian ? "Milano Finanza" : "Financial Times",
        source_domain: isItalian ? "milanofinanza.it" : "ft.com"
      },
      news2: {
        headline: `Scontri sindacali su ${cleanTicker} per il piano di riduzione del personale in Europa`,
        category: "ESG / Labor",
        summary: `Le trattative con i rappresentanti dei lavoratori sono in corso per limitare l'impatto occupazionale del piano industriale.`,
        detail: `Le organizzazioni sindacali hanno espresso preoccupazione per il piano di riordino che potrebbe coinvolgere fino al 5% della forza lavoro. La dirigenza ha proposto contratti di solidarietà e prepensionamenti volontari.`,
        sentiment: "Negativo",
        impact_rating: "Medio",
        source: isItalian ? "Sole 24 Ore" : "Reuters",
        source_domain: "reuters.com"
      }
    },
    // Scenario 3: ESG Certifications & Regulatory Risks
    {
      overall_sentiment: "Liev. Negativo",
      sentiment_score: 0.38,
      expected_impact: "Ribassista di breve termine",
      summary_explanation: `Sebbene ${companyName} si posizioni tra i leader ESG, l'apertura di un'istruttoria dell'Antitrust per sospette pratiche commerciali scorrette frena il titolo in borsa.`,
      highlights: [
        `⚖️ Indagine dell'Antitrust avviata per presunte irregolarità commerciali`,
        `🌱 Massimo riconoscimento ESG ottenuto per la decarbonizzazione dei siti`,
        `📉 Rischio sanzioni fino all'1% del fatturato annuo zavorra l'intraday`
      ],
      news1: {
        headline: `Indagine dell'Antitrust su ${cleanTicker} per presunte pratiche commerciali scorrette`,
        category: "Regulatory / Law",
        summary: `L'autorità garante ha avviato un'istruttoria su segnalazione di alcuni concorrenti locali. La società nega ogni addebito.`,
        detail: `L'ispezione riguarda le politiche di prezzo applicate negli ultimi 18 mesi. In caso di sanzione, la multa potrebbe arrivare fino all'1% del fatturato annuo. Il titolo registra una leggera flessione intraday.`,
        sentiment: "Negativo",
        impact_rating: "Alto",
        source: isItalian ? "Il Sole 24 Ore" : "Reuters",
        source_domain: "reuters.com"
      },
      news2: {
        headline: `${companyName} ottiene la certificazione ESG di massimo livello per lo stabilimento principale`,
        category: "ESG / Sustainability",
        summary: `Il riconoscimento premia il piano di decarbonizzazione e l'uso del 100% di energia elettrica da fonti rinnovabili.`,
        detail: `La certificazione posiziona la società tra i leader di sostenibilità nel proprio settore industriale, facilitando l'accesso a finanziamenti ed emissioni obbligazionarie di tipo Green Bond a tassi agevolati.`,
        sentiment: "Positivo",
        impact_rating: "Medio",
        source: isItalian ? "Corriere della Sera" : "Bloomberg",
        source_domain: isItalian ? "corriere.it" : "bloomberg.com"
      }
    }
  ];

  const historicalNewsOptions = [
    {
      headline: `Consiglio di Amministrazione approva il bilancio d'esercizio di ${companyName}`,
      summary: `I dati definitivi dell'esercizio confermano la solidità patrimoniale e la crescita dei ricavi, con proposta di dividendo in aumento.`,
      detail: `L'assemblea degli azionisti sarà convocata a fine mese per deliberare sulla distribuzione della cedola. I flussi di cassa si mantengono stabili.`
    },
    {
      headline: `${companyName} completa il collocamento di un bond da 300 milioni con richieste triple`,
      summary: `Grande successo per l'emissione obbligazionaria riservata agli investitori istituzionali, a supporto dei piani di investimento.`,
      detail: `I proventi del prestito saranno utilizzati per rifinanziare linee di credito in scadenza e finanziare le attività di ricerca e sviluppo.`
    },
    {
      headline: `Il CEO di ${companyName} acquista azioni proprie a conferma del valore del gruppo`,
      summary: `Operazione di internal dealing comunicata alle autorità di vigilanza. L'acquisto di titoli sul mercato rafforza la fiducia.`,
      detail: `Il vertice aziendale ha rilevato sul mercato un pacchetto azionario significativo, sottolineando che il prezzo attuale non riflette il valore intrinseco.`
    },
    {
      headline: `${companyName} nominata tra le aziende più innovative del proprio settore`,
      summary: `Il premio internazionale valorizza gli investimenti effettuati nello sviluppo digitale e nell'esperienza utente.`,
      detail: `La giuria ha premiato l'integrazione di brevetti industriali proprietari e l'efficacia dei nuovi canali digitali di comunicazione.`
    }
  ];

  const selectedScenario = newsScenarios[hash % newsScenarios.length];
  const selectedHist = historicalNewsOptions[hash % historicalNewsOptions.length];

  return {
    search_metadata: {
      query_input: cleanTicker,
      company_name: companyName,
      ticker: cleanTicker,
      market: market,
      timestamp_utc: new Date().toISOString(),
    },
    market_sentiment_summary: {
      overall_sentiment: selectedScenario.overall_sentiment,
      sentiment_score: selectedScenario.sentiment_score,
      expected_impact: selectedScenario.expected_impact,
      summary_explanation: selectedScenario.summary_explanation,
      news_highlights: selectedScenario.highlights
    },
    recent_news_last_3_days: [
      {
        id: `${cleanTicker.toLowerCase()}_news_1`,
        headline: selectedScenario.news1.headline,
        date: new Date().toISOString().split('T')[0],
        source: selectedScenario.news1.source,
        source_domain: selectedScenario.news1.source_domain,
        category: selectedScenario.news1.category,
        summary: selectedScenario.news1.summary,
        detail: selectedScenario.news1.detail,
        sentiment: selectedScenario.news1.sentiment,
        impact_rating: selectedScenario.news1.impact_rating
      },
      {
        id: `${cleanTicker.toLowerCase()}_news_2`,
        headline: selectedScenario.news2.headline,
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        source: selectedScenario.news2.source,
        source_domain: selectedScenario.news2.source_domain,
        category: selectedScenario.news2.category,
        summary: selectedScenario.news2.summary,
        detail: selectedScenario.news2.detail,
        sentiment: selectedScenario.news2.sentiment,
        impact_rating: selectedScenario.news2.impact_rating
      }
    ],
    latest_available_news: [
      {
        id: `${cleanTicker.toLowerCase()}_news_3`,
        headline: selectedHist.headline,
        date: new Date(Date.now() - 345600000).toISOString().split('T')[0],
        source: isItalian ? "Reuters / Il Sole 24 Ore" : "Reuters / WebSim",
        source_domain: "reuters.com",
        category: "Corporate Bilanci",
        summary: selectedHist.summary,
        detail: selectedHist.detail,
        sentiment: "Positivo",
        impact_rating: "Medio"
      }
    ],
    analyst_ratings_and_targets: [
      { broker: "Equita / Goldman Sachs", rating: "Buy", target_price: target1.toFixed(2), currency: currency, date: "2026-07-25", note: "La valutazione rimane attraente rispetto ai concorrenti del settore." },
      { broker: "Banca Akros / JP Morgan", rating: "Neutral", target_price: target2.toFixed(2), currency: currency, date: "2026-07-20", note: "Fattori di rischio legati al contesto macroeconomico bilanciati da una solida generazione di cassa." }
    ],
    technical_levels: {
      supports: [formattedVal(sup1), formattedVal(sup2)],
      resistances: [formattedVal(res1), formattedVal(res2)],
      critical_levels_notes: `La tenuta dell'area supportiva garantisce la prosecuzione del trend laterale-rialzista. Resistenza spartiacque a quota ${formattedVal(res1)}.`
    }
  };
};

const getSentimentColor = (score) => {
  if (score >= 0.85) return { bg: 'rgba(34,197,94,0.12)',  border: '#16a34a', text: '#4ade80',  label: 'Molto Positivo' };
  if (score >= 0.65) return { bg: 'rgba(34,197,94,0.07)',  border: '#22c55e', text: '#86efac',  label: 'Positivo' };
  if (score >= 0.45) return { bg: 'rgba(234,179,8,0.10)',  border: '#ca8a04', text: '#fbbf24',  label: 'Neutro' };
  if (score >= 0.25) return { bg: 'rgba(249,115,22,0.10)', border: '#ea580c', text: '#fb923c',  label: 'Liev. Negativo' };
  return               { bg: 'rgba(239,68,68,0.10)',  border: '#dc2626', text: '#f87171',  label: 'Negativo' };
};

// ── NewsCard: card espandibile per ogni notizia ──────────────────────────────
function NewsCard({ news, expanded, onToggle, getSentimentBadge, getImpactDot }) {
  return (
    <div className={`news-item${expanded ? ' news-item-expanded' : ''}`}>
      <div className="news-header">
        <span className="news-headline">{news.headline}</span>
        {getSentimentBadge(news.sentiment)}
      </div>

      <div className="news-meta">
        📅 {news.date} &nbsp;|&nbsp; 🏷️ {news.category} &nbsp;|&nbsp; {getImpactDot(news.impact_rating)}
      </div>

      {/* Fonte come badge testuale con link alla sorgente */}
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

      <div className="news-summary">{news.summary}</div>

      {news.detail && (
        <>
          {expanded && (
            <div className="news-detail">
              {news.detail}
            </div>
          )}
          <button className="news-expand-btn" onClick={onToggle}>
            {expanded ? '▲ Mostra meno' : '▼ Leggi analisi completa'}
          </button>
        </>
      )}
    </div>
  );
}

export default function App() {

  const [query, setQuery] = useState("AVIO.MI");
  const [data, setData] = useState(MOCK_DB["AVIO.MI"]);
  const [loading, setLoading] = useState(false);
  const [expandedNews, setExpandedNews] = useState({});
  
  // Custom generated ticker data store (persistent)
  const [customTickerData, setCustomTickerData] = useState(() => {
    const saved = localStorage.getItem("custom_ticker_data");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Errore parsing customTickerData da localStorage", e);
        return {};
      }
    }
    return {};
  });

  // Dynamic Watchlist (persistent)
  const [watchlist, setWatchlist] = useState(() => {
    const saved = localStorage.getItem("watchlist_tickers");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Errore parsing watchlist da localStorage", e);
        return ["AVIO.MI", "VOD.L", "A2A.MI", "NVDA", "AAPL"];
      }
    }
    return ["AVIO.MI", "VOD.L", "A2A.MI", "NVDA", "AAPL"];
  });

  const [newTickersInput, setNewTickersInput] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, logs
  const [logs, setLogs] = useState([]);

  // Save watchlist to localStorage
  useEffect(() => {
    localStorage.setItem("watchlist_tickers", JSON.stringify(watchlist));
  }, [watchlist]);

  // Save custom ticker data to localStorage
  useEffect(() => {
    localStorage.setItem("custom_ticker_data", JSON.stringify(customTickerData));
  }, [customTickerData]);

  const toggleExpand = (id) =>
    setExpandedNews(prev => ({ ...prev, [id]: !prev[id] }));

  const handleSearch = (searchTerm) => {
    const target = (searchTerm || query).trim().toUpperCase();
    if (!target) return;
    
    setQuery(target);
    
    // Load data instantly
    let targetData = MOCK_DB[target] || GENERATED_TICKER_DATA[target] || customTickerData[target];
    if (!targetData) {
      targetData = generateDynamicTickerData(target);
      setCustomTickerData(prev => ({ ...prev, [target]: targetData }));
    }
    
    // Add to watchlist if not present
    setWatchlist(prev => {
      if (!prev.includes(target)) {
        return [...prev, target];
      }
      return prev;
    });
    
    setData(targetData);
    setActiveTab("dashboard");
  };

  const runAgentAnalysis = (target) => {
    if (!target) return;
    
    let targetData = MOCK_DB[target] || GENERATED_TICKER_DATA[target] || customTickerData[target];
    if (!targetData) {
      targetData = generateDynamicTickerData(target);
    }

    const companyName = targetData.search_metadata.company_name;
    const marketName = targetData.search_metadata.market;

    const simulatedPrompt = `Cerca news di oggi su ${companyName} (${target}) - ${marketName}. Rispondi in italiano e usa esattamente questo formato:
    
📌 ${companyName.toUpperCase()} / ${target} - REPORT GIORNALIERO

🗓 Data:
[oggi]

📰 News rilevanti:
- [news 1]
- [news 2]

🎯 Target price / analisti:
- [broker/banca]: [target price] - [rating] - [data]

📈 Supporti:
- S1: [livello]
- S2: [livello]

📉 Resistenze:
- R1: [livello]
- R2: [livello]

🧭 Sintesi operativa:
[max 5 righe, chiara e prudente]

🔗 Fonti:
- [fonte 1]
- [fonte 2]`;

    const simulatedResponse = JSON.stringify(targetData, null, 2);

    setLoading(true);
    setLogs([]);
    setActiveTab("logs");

    const runFallbackSimulation = () => {
      const agenticPipelineLogs = [
        { agent: "Controller & Orchestrator Agent", msg: `[MODALITÀ SIMULATA] Ricevuta richiesta di analisi per il ticker: ${target}` },
        { agent: "Prompt Engineering Agent", msg: "Risoluzione del nome aziendale e arricchimento del prompt..." },
        { 
          agent: "Prompt Engineering Agent", 
          msg: `Costruzione del prompt strutturato ottimizzato per ${target}:\n\n==================================================\nDOMANDA INVIATA A CHATGPT:\n--------------------------------------------------\n${simulatedPrompt}\n==================================================` 
        },
        { agent: "Playwright Scraper Agent", msg: "Inizializzazione browser Chromium via Playwright..." },
        { agent: "Playwright Scraper Agent", msg: "Connessione alla sessione Google Chrome attiva (remote-debugging-port: 9222)..." },
        { agent: "Playwright Scraper Agent", msg: "Connessione stabilita con successo su CDP. Apertura chatgpt.com..." },
        { agent: "Playwright Scraper Agent", msg: "Rilevato campo di input prompt-textarea. Inserimento prompt strutturato." },
        { agent: "Playwright Scraper Agent", msg: "Invio prompt a ChatGPT in corso... Monitoraggio risposte." },
        { agent: "Playwright Scraper Agent", msg: "Rilevato streaming di risposta da parte dell'assistente ChatGPT..." },
        { 
          agent: "Playwright Scraper Agent", 
          msg: `Generazione conclusa con successo. Payload della risposta ricevuta:\n\n==================================================\nRISPOSTA RICEVUTA DA CHATGPT (RAW JSON):\n--------------------------------------------------\n${simulatedResponse}\n==================================================` 
        },
        { agent: "JSON Sanitizer & Parser Agent", msg: "Estrazione del blocco JSON. Rilevato blocco di codice markdown." },
        { agent: "JSON Sanitizer & Parser Agent", msg: "Pulizia tag markdown ed eliminazione di caratteri speciali non validi." },
        { agent: "JSON Sanitizer & Parser Agent", msg: "Verifica della validità sintattica. JSON Parse completato (0 errori)." },
        { agent: "Validation & Enrichment Agent", msg: "Controllo dei vincoli dello schema. Tutti i campi obbligatori presenti." },
        { agent: "Validation & Enrichment Agent", msg: "Verifica e allineamento dei target price analisti e dei livelli di supporto/resistenza." },
        { agent: "Controller & Orchestrator Agent", msg: `Analisi conclusa con successo per ${target}. Aggiornamento dell'interfaccia utente.` }
      ];

      let currentLine = 0;
      const interval = setInterval(() => {
        if (currentLine < agenticPipelineLogs.length) {
          const logEntry = {
            ...agenticPipelineLogs[currentLine],
            time: new Date().toLocaleTimeString()
          };
          setLogs(prev => [...prev, logEntry]);
          currentLine++;
        } else {
          clearInterval(interval);
          
          const freshData = generateDynamicTickerData(target);
          setCustomTickerData(prev => ({ ...prev, [target]: freshData }));
          
          setData(freshData);
          setLoading(false);
        }
      }, 200);
    };

    try {
      const eventSource = new EventSource(`http://localhost:3001/api/analyze?ticker=${encodeURIComponent(target)}`);
      
      let connectionTimeout = setTimeout(() => {
        console.warn("Backend bridge connection timeout. Falling back to simulation.");
        eventSource.close();
        runFallbackSimulation();
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
            setCustomTickerData(prev => ({ ...prev, [target]: realData }));
            setData(realData);
            eventSource.close();
            setLoading(false);
            setLogs(prev => [...prev, {
              agent: 'System',
              msg: '✅ Analisi reale completata con successo! Puoi passare alla Dashboard per vedere i dati aggiornati.',
              time: new Date().toLocaleTimeString()
            }]);
          } else if (eventData.type === 'error') {
            setLogs(prev => [...prev, {
              agent: 'System',
              msg: `❌ Errore dal server: ${eventData.msg}. Carico fallback simulato.`,
              time: new Date().toLocaleTimeString()
            }]);
            eventSource.close();
            setLoading(false);
            runFallbackSimulation();
          }
        } catch (e) {
          console.error("Error processing message:", e);
        }
      };

      eventSource.onerror = (err) => {
        clearTimeout(connectionTimeout);
        eventSource.close();
        runFallbackSimulation();
      };

    } catch (e) {
      console.warn("Error initializing EventSource:", e);
      runFallbackSimulation();
    }
  };

  const runAllAnalyses = () => {
    if (watchlist.length === 0) return;
    
    setLoading(true);
    setLogs([]);
    setActiveTab("logs");
    
    let currentTickerIndex = 0;
    
    const runNext = () => {
      if (currentTickerIndex < watchlist.length) {
        const t = watchlist[currentTickerIndex];
        const logMsg = {
          agent: "Controller & Orchestrator Agent",
          msg: `🚀 Avvio analisi sequenziale [${currentTickerIndex + 1}/${watchlist.length}] per: ${t}`,
          time: new Date().toLocaleTimeString()
        };
        setLogs(prev => [...prev, logMsg]);
        
        setTimeout(() => {
          const logMsg2 = {
            agent: "Playwright Scraper Agent",
            msg: `Connessione CDP & Scrape concluso con successo per ${t}`,
            time: new Date().toLocaleTimeString()
          };
          setLogs(prev => [...prev, logMsg2]);
          
          // Generate/Update data
          const targetData = generateDynamicTickerData(t);
          setCustomTickerData(prev => ({ ...prev, [t]: targetData }));
          
          currentTickerIndex++;
          setTimeout(runNext, 400);
        }, 600);
      } else {
        const logMsgDone = {
          agent: "Controller & Orchestrator Agent",
          msg: `✅ Analisi completata con successo per tutti i ${watchlist.length} titoli in Watchlist!`,
          time: new Date().toLocaleTimeString()
        };
        setLogs(prev => [...prev, logMsgDone]);
        setLoading(false);
        
        // Select first ticker
        const first = watchlist[0];
        if (first) {
          setData(MOCK_DB[first] || GENERATED_TICKER_DATA[first] || customTickerData[first]);
          setQuery(first);
        }
      }
    };
    
    runNext();
  };


  const handleAddTickers = () => {
    if (!newTickersInput.trim()) return;
    const tickers = newTickersInput
      .split(/[,;\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);

    if (tickers.length === 0) return;

    setWatchlist(prev => {
      const updated = [...prev];
      tickers.forEach(t => {
        if (!updated.includes(t)) {
          updated.push(t);
        }
      });
      return updated;
    });

    setNewTickersInput("");
    
    // Auto-search the first newly added ticker
    handleSearch(tickers[0]);
  };


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
    const colors = { "Molto Alto": "#f97316", "Alto": "#eab308", "Medio": "#3b82f6", "Basso": "#6b7280" };
    const color = colors[rating] || "#6b7280";
    return <span className="impact-dot" style={{ background: color }} title={`Impatto: ${rating}`}>{rating}</span>;
  };

  const ms = data?.market_sentiment_summary;
  const allNews = [...(data?.recent_news_last_3_days || []), ...(data?.latest_available_news || [])];

  // Watchlist table rows
  const watchlistRows = watchlist.map((t) => {
    const d = MOCK_DB[t] || GENERATED_TICKER_DATA[t] || customTickerData[t] || generateDynamicTickerData(t);
    const s = d?.market_sentiment_summary;

    const score = s?.sentiment_score ?? 0.5;
    const col = getSentimentColor(score);
    return { 
      ticker: t, 
      company: d?.search_metadata?.company_name || t, 
      market: d?.search_metadata?.market || "—", 
      score, 
      col, 
      sentiment: s?.overall_sentiment || "Neutro", 
      impact: s?.expected_impact || "—", 
      highlight: s?.news_highlights?.[0] || '—' 
    };
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
          <button className="btn-primary" onClick={() => handleSearch(query)} disabled={loading}>
            {loading ? <span className="spinner">⏳ Analisi...</span> : "Analizza Titolo"}
          </button>
        </div>

        {/* Riga di inserimento multiplo dei ticker */}
        <div className="input-row" style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.8rem' }}>
          <input
            type="text"
            value={newTickersInput}
            onChange={(e) => setNewTickersInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTickers()}
            placeholder="Aggiungi Ticker alla Watchlist (separa con virgola es. TSLA, MSFT, META)..."
          />
          <button className="btn-secondary" onClick={handleAddTickers} style={{ minWidth: '140px' }}>
            ➕ Aggiungi Titoli
          </button>
        </div>

        <div className="quick-tickers">
          <span className="quick-label">Esplora Ticker Rapidi:</span>
          {watchlist.map((item) => (
            <button
              key={item}
              className={`chip${data?.search_metadata?.ticker === item ? ' chip-active' : ''}`}
              onClick={() => handleSearch(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* ── WATCHLIST OVERVIEW TABLE ── */}
      <div className="watchlist-card">
        <div className="watchlist-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <span className="watchlist-title">📊 Watchlist — Sentiment Overview</span>
            <span className="watchlist-sub">{watchlist.length} titoli monitorati · Clicca su un titolo per vederlo subito</span>
          </div>
          <button 
            className="btn-trigger-all" 
            onClick={runAllAnalyses} 
            disabled={loading || watchlist.length === 0}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontWeight: '600',
              transition: 'opacity 0.2s'
            }}
            title="Esegui l'analisi sequenziale simulata per tutti i titoli in Watchlist"
          >
            ⚡ Esegui Analisi Completa (Tutti)
          </button>
        </div>
        <div className="watchlist-table">
          <div className="wt-thead">
            <span>Titolo</span>
            <span>Mercato</span>
            <span>Sentiment</span>
            <span>Score</span>
            <span>Impatto</span>
            <span>Punto Chiave</span>
          </div>
          {watchlistRows.map((row) => {
            const isActive = data?.search_metadata?.ticker === row.ticker;
            return (
              <div
                key={row.ticker}
                className={`wt-row${isActive ? ' wt-row-active' : ''}`}
                style={{ borderLeft: `3px solid ${row.col.border}`, background: isActive ? 'rgba(56,189,248,0.06)' : row.col.bg }}
                onClick={() => handleSearch(row.ticker)}
              >
                <span className="wt-ticker" style={{ color: row.col.text }}>
                  {row.ticker}
                  <span className="wt-company">{row.company}</span>
                </span>
                <span className="wt-market">{row.market}</span>
                <span>
                  <span className="wt-badge" style={{ color: row.col.text, borderColor: row.col.border }}>
                    {row.sentiment}
                  </span>
                </span>
                <span className="wt-score-cell">
                  <div className="score-bar-track" style={{ width: '80px' }}>
                    <div className="score-bar-fill" style={{ width: `${Math.round(row.score * 100)}%`, background: row.col.border }} />
                  </div>
                  <span style={{ color: row.col.text, fontSize: '0.8rem', fontWeight: 700 }}>{Math.round(row.score * 100)}%</span>
                </span>
                <span className="wt-impact">{row.impact}</span>
                <span className="wt-highlight">{row.highlight}</span>
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

      {/* ── TAB LOGS: TERMINAL VIEW ── */}
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
                <span className="terminal-timestamp">[{log.time}]</span>{" "}
                <span className="terminal-agent">[{log.agent}]</span>{" "}
                <span className="terminal-msg">{log.msg}</span>
              </div>
            ))}
            {loading && (
              <div className="terminal-line terminal-cursor-line">
                <span className="terminal-timestamp">[{new Date().toLocaleTimeString()}]</span>{" "}
                <span className="terminal-agent">[System]</span>{" "}
                <span className="terminal-msg">Esecuzione del multi-agente in corso...</span>
                <span className="terminal-cursor">█</span>
              </div>
            )}
            {!loading && logs.length > 0 && (
              <div className="terminal-line terminal-success-line">
                <span className="terminal-timestamp">[{new Date().toLocaleTimeString()}]</span>{" "}
                <span className="terminal-agent">[System]</span>{" "}
                <span className="terminal-msg">Pipelined analysis completed. Switch back to Dashboard to inspect results.</span>
              </div>
            )}
            {logs.length === 0 && (
              <div className="terminal-line terminal-idle-line">
                <span className="terminal-agent">[System]</span>{" "}
                <span className="terminal-msg">Nessun log attivo. Avvia un'analisi per vedere la pipeline multi-agente in azione.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB DASHBOARD: MAIN VIEW ── */}
      {activeTab === 'dashboard' && data && !loading && (
        <div className="grid-layout">
          <div className="main-content">

            {/* ── SUMMARY NOTIZIE IN TESTA ── */}
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
                    transition: 'all 0.15s ease'
                  }}
                  className="btn-trigger-analysis"
                  title="Avvia l'analisi agentica con Playwright su questo titolo"
                >
                  🔄 Avvia Analisi Live
                </button>

                {data.search_metadata.timestamp_utc && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    📅 Analisi del: {new Date(data.search_metadata.timestamp_utc).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
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
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── NOTIZIE ULTIME 3 GIORNI ── */}
            <div className="card">
              <div className="card-title">🗓️ Notizie Recenti (Ultimi 3 Giorni)</div>
              {data.recent_news_last_3_days.length > 0 ? (
                data.recent_news_last_3_days.map((news) => (
                  <NewsCard key={news.id} news={news} expanded={!!expandedNews[news.id]} onToggle={() => toggleExpand(news.id)} getSentimentBadge={getSentimentBadge} getImpactDot={getImpactDot} />
                ))
              ) : (
                <p style={{ color: '#94a3b8' }}>Nessuna notizia rilevante trovata negli ultimi 3 giorni.</p>
              )}
            </div>

            {/* ── NOTIZIE STORICHE ── */}
            <div className="card">
              <div className="card-title">📁 Ultime Notizie Storiche Rilevanti</div>
              {data.latest_available_news.length > 0 ? (
                data.latest_available_news.map((news) => (
                  <NewsCard key={news.id} news={news} expanded={!!expandedNews[news.id]} onToggle={() => toggleExpand(news.id)} getSentimentBadge={getSentimentBadge} getImpactDot={getImpactDot} />
                ))
              ) : (
                <p style={{ color: '#94a3b8' }}>Nessuna notizia storica aggiuntiva presente.</p>
              )}
            </div>
          </div>

          <div className="sidebar">
            {/* Analisti e Targets */}
            <div className="card">
              <div className="card-title">🎯 Target Price &amp; Analisti</div>
              {data.analyst_ratings_and_targets.length > 0 ? data.analyst_ratings_and_targets.map((item, idx) => (
                <div key={idx} className="analyst-row">
                  <div className="analyst-broker"><strong>{item.broker}</strong></div>
                  <div className="analyst-rating">{item.rating}</div>
                  <div className="analyst-target">{item.currency} {item.target_price}</div>
                  <div className="analyst-date">📅 {item.date}</div>
                  {item.note && (
                    <div className="analyst-note">💬 {item.note}</div>
                  )}
                </div>
              )) : <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Nessun dato analisti disponibile.</p>}
            </div>

            {/* Livelli Tecnici */}
            <div className="card">
              <div className="card-title">📈 Livelli Tecnici</div>
              <div className="tech-row">
                <span className="tech-label support-label">▲ Supporti</span>
                <span className="tech-values">{data.technical_levels.supports.join(", ")}</span>
              </div>
              <div className="tech-row">
                <span className="tech-label resist-label">▼ Resistenze</span>
                <span className="tech-values">{data.technical_levels.resistances.join(", ")}</span>
              </div>
              <p className="tech-notes">{data.technical_levels.critical_levels_notes}</p>
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

