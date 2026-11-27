import { SocEvents } from './monitoring/SocEvents'
import { AuthProvider } from './auth/AuthProvider'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>{window.location.pathname === '/soc-data' ? <SocEvents /> : <App />}</AuthProvider>
  </StrictMode>,
)
