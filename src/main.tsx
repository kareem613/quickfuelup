import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { setupPwaInstallCapture } from './lib/pwaInstall'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-activate and refresh so users don't get stuck on an old cached build.
    void updateSW(true)
  },
  onRegisteredSW(_swUrl, r) {
    // Encourage prompt SW update checks (some browsers/PWAs can be sticky).
    if (!r) return
    void r.update()
    window.setInterval(() => void r.update(), 60_000)
  },
})
setupPwaInstallCapture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
