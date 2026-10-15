import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App.js'
import { AppThemeProvider } from './components/theme-provider.js'
import { Toaster } from './components/ui/sonner.js'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppThemeProvider>
        <App />
        <Toaster richColors position="top-center" />
      </AppThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
