import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadConfig, saveConfig } from '../lib/config'
import type { AppConfig } from '../lib/types'
import { getVehicles, whoAmI } from '../lib/lubelogger'

export default function SettingsPage() {
  const navigate = useNavigate()
  const existing = useMemo(() => loadConfig(), [])
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '')
  const [lubeLoggerApiKey, setLubeLoggerApiKey] = useState(existing?.lubeLoggerApiKey ?? '')
  const [geminiApiKey, setGeminiApiKey] = useState(existing?.geminiApiKey ?? '')
  const [cultureInvariant, setCultureInvariant] = useState(existing?.cultureInvariant ?? true)
  const [useProxy, setUseProxy] = useState(existing?.useProxy ?? false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'QuickFuelUp - Settings'
  }, [])

  const canSave = baseUrl.trim() && lubeLoggerApiKey.trim() && geminiApiKey.trim()

  const cfg: AppConfig | null = canSave
    ? {
        baseUrl: baseUrl.trim().replace(/\/+$/, ''),
        lubeLoggerApiKey: lubeLoggerApiKey.trim(),
        geminiApiKey: geminiApiKey.trim(),
        cultureInvariant,
        useProxy,
      }
    : null

  async function onTest() {
    if (!cfg) return
    setBusy(true)
    setTestResult(null)
    try {
      const me = await whoAmI(cfg)
      const vehicles = await getVehicles(cfg)
      setTestResult(`OK\nwhoami: ${JSON.stringify(me)}\nvehicles: ${vehicles.length}`)
    } catch (e) {
      setTestResult(String(e))
    } finally {
      setBusy(false)
    }
  }

  function onSave() {
    if (!cfg) return
    saveConfig(cfg)
    navigate('/new')
  }

  return (
    <div className="container stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Settings</h2>
        <Link to="/new" className="muted">
          Back
        </Link>
      </div>

      <div className="card stack">
        <div className="field">
          <label>LubeLogger Base URL</label>
          <input
            placeholder="https://your.lubelogger.host"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
          />
        </div>

        <div className="field">
          <label>LubeLogger API Key (x-api-key)</label>
          <input
            value={lubeLoggerApiKey}
            onChange={(e) => setLubeLoggerApiKey(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label>Gemini API Key</label>
          <input
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <label className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={cultureInvariant}
            onChange={(e) => setCultureInvariant(e.target.checked)}
          />
          <span>Send LubeLogger “culture-invariant” header</span>
        </label>

        <label className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <input type="checkbox" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} />
          <span>Use same-origin proxy (fixes CORS “Failed to fetch”)</span>
        </label>

        {useProxy && (
          <div className="muted">
            Proxy requires the Vercel env var <code>LUBELOGGER_PROXY_BASE_URL</code> to be set (then redeploy).
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <button className="btn" onClick={onTest} disabled={!cfg || busy}>
            {busy ? 'Testing…' : 'Test connection'}
          </button>
          <button className="btn primary" onClick={onSave} disabled={!cfg || busy}>
            Save
          </button>
        </div>

        {testResult && <div className={testResult.startsWith('OK') ? 'card' : 'error'}>{testResult}</div>}
      </div>

      {!existing && (
        <div className="muted">
          Keys are stored locally in your browser. This is a client-only app; don’t use keys you can’t trust on this
          device.
        </div>
      )}
    </div>
  )
}
