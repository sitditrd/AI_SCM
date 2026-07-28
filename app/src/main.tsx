import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import { getInitialTheme } from './lib/theme'
import App from './App.tsx'

document.documentElement.setAttribute('data-theme', getInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
