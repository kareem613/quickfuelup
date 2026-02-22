import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Navigate, Route, Routes } from 'react-router-dom'
import { isHowItWorksDismissed } from './lib/howItWorks'
import HowItWorksPage from './pages/HowItWorksPage'
import NewEntryPage from './pages/NewEntryPage'
import NewServiceRecordPage from './pages/NewServiceRecordPage'
import ReviewPage from './pages/ReviewPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [howItWorksDismissed, setHowItWorksDismissed] = useState(() => isHowItWorksDismissed())

  useEffect(() => {
    if (howItWorksDismissed) return
    if (location.pathname === '/how-it-works') return
    const next = `${location.pathname}${location.search}${location.hash}`
    navigate(`/how-it-works?first=1&next=${encodeURIComponent(next)}`, { replace: true })
  }, [howItWorksDismissed, location.hash, location.pathname, location.search, navigate])

  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/new" element={<NewEntryPage />} />
          <Route path="/service" element={<NewServiceRecordPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage onDismiss={() => setHowItWorksDismissed(true)} />} />
          <Route path="/" element={<Navigate to="/new" replace />} />
          <Route path="*" element={<Navigate to="/new" replace />} />
        </Routes>
      </main>

      <footer className="app-footer muted">
        v{__APP_VERSION__} ({__GIT_SHA__})
      </footer>
    </div>
  )
}
