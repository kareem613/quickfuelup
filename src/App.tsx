import { useMemo } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { loadConfig } from './lib/config'
import NewEntryPage from './pages/NewEntryPage'
import ReviewPage from './pages/ReviewPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const cfg = useMemo(() => loadConfig(), [])

  return (
    <>
      {/* If Vercel WAF "security checkpoint" is enabled for this project, API fetches can be challenged.
          Loading a challenged URL in an iframe lets the JS challenge complete and establishes a session cookie,
          after which fetches succeed. */}
      {cfg?.useProxy ? (
        <iframe
          title="vercel-checkpoint-bootstrap"
          src="/ll/whoami"
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}

      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/new" element={<NewEntryPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/" element={<Navigate to="/new" replace />} />
        <Route path="*" element={<Navigate to="/new" replace />} />
      </Routes>
    </>
  )
}
