import React from 'react'
import ReactDOM from 'react-dom/client'
import { Buffer } from 'buffer'
import App from './App.tsx'
import './index.css'

// Polyfill wymagany przez @react-pdf/renderer w środowisku przeglądarki
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).Buffer = Buffer;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
