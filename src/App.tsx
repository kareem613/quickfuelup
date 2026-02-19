import { Navigate, Route, Routes } from 'react-router-dom'
import NewEntryPage from './pages/NewEntryPage'
import ReviewPage from './pages/ReviewPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/new" element={<NewEntryPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/" element={<Navigate to="/new" replace />} />
      <Route path="*" element={<Navigate to="/new" replace />} />
    </Routes>
  )
}
