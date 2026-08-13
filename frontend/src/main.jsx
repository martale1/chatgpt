import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Frontend render error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0f172a',
          color: '#e2e8f0',
          padding: '32px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <h1 style={{ color: '#38bdf8' }}>Errore visualizzazione scheda</h1>
          <p>La pagina non e stata chiusa: un dato incompleto ha generato un errore nella scheda.</p>
          <pre style={{
            whiteSpace: 'pre-wrap',
            background: '#020617',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '16px',
            color: '#fca5a5'
          }}>{String(this.state.error?.message || this.state.error || 'Errore sconosciuto')}</pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '16px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid #38bdf8',
              background: '#0284c7',
              color: 'white',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Torna alla dashboard
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
