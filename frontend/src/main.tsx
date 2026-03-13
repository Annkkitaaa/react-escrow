import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#141414',
            color: '#ffffff',
            border: '1px solid #252525',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#ff6b00', secondary: '#141414' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#141414' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
