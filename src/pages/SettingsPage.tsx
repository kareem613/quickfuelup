import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadConfig, saveConfig } from '../lib/config'
import type { AppConfig, LlmProvider } from '../lib/types'

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatError(e: unknown) {
  if (e instanceof Error) {
    return [
      `name: ${e.name}`,
      `message: ${e.message}`,
      e.cause ? `cause: ${safeStringify(e.cause)}` : null,
      e.stack ? `stack:\n${e.stack}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }
  return `error: ${safeStringify(e)}`
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const existing = useMemo(() => loadConfig(), [])
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '')
  const [lubeLoggerApiKey, setLubeLoggerApiKey] = useState(existing?.lubeLoggerApiKey ?? '')
  const [defaultLlmProvider, setDefaultLlmProvider] = useState<LlmProvider>(existing?.llm.defaultProvider ?? 'gemini')
  const [geminiApiKey, setGeminiApiKey] = useState(existing?.llm.geminiApiKey ?? '')
  const [anthropicApiKey, setAnthropicApiKey] = useState(existing?.llm.anthropicApiKey ?? '')
  const [cultureInvariant, setCultureInvariant] = useState(existing?.cultureInvariant ?? true)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [busyTest, setBusyTest] = useState(false)
  const [connectedAs, setConnectedAs] = useState<{ username: string; isAdmin: boolean } | null>(null)

  useEffect(() => {
    document.title = 'QuickFuelUp - Settings'
  }, [])

  const hasAnyLlmKey = Boolean(geminiApiKey.trim() || anthropicApiKey.trim())
  const defaultProviderKey =
    defaultLlmProvider === 'anthropic' ? anthropicApiKey.trim() : geminiApiKey.trim()
  const canSave = Boolean(baseUrl.trim() && lubeLoggerApiKey.trim() && (!hasAnyLlmKey || defaultProviderKey))

  const cfg: AppConfig | null = canSave
    ? {
        baseUrl: baseUrl.trim().replace(/\/+$/, ''),
        lubeLoggerApiKey: lubeLoggerApiKey.trim(),
        cultureInvariant,
        useProxy: false,
        llm: {
          defaultProvider: defaultLlmProvider,
          ...(geminiApiKey.trim() ? { geminiApiKey: geminiApiKey.trim() } : null),
          ...(anthropicApiKey.trim() ? { anthropicApiKey: anthropicApiKey.trim() } : null),
        },
      }
    : null

  function resolveWhoamiUrl() {
    if (!cfg) return null
    return `${cfg.baseUrl.replace(/\/+$/, '')}/api/whoami`
  }

  async function testWhoami() {
    if (!cfg) return
    const url = resolveWhoamiUrl()
    if (!url) return

    const headers: Record<string, string> = {
      'x-api-key': cfg.lubeLoggerApiKey,
    }
    if (cfg.cultureInvariant) headers['culture-invariant'] = '1'

    try {
      const res = await fetch(url, { headers })
      const text = await res.text()

      const bodyLength = text.length
      const maxBody = 2500
      const bodyPreview =
        bodyLength > maxBody ? `${text.slice(0, maxBody)}\n...[truncated ${bodyLength - maxBody} chars]...` : text

      const details = [
        `url: ${url}`,
        `status: ${res.status} ${res.statusText}`,
        `headers: ${Array.from(res.headers.entries())
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ')}`,
        `bodyLength: ${bodyLength}`,
        `body: ${bodyPreview}`,
      ].join('\n')

      if (!res.ok) throw new Error(`HTTP error\n${details}`)

      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        // keep as text
      }

      const username =
        typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).username === 'string'
          ? String((parsed as Record<string, unknown>).username)
          : 'unknown'
      const isAdmin =
        typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).isAdmin === 'boolean'
          ? Boolean((parsed as Record<string, unknown>).isAdmin)
          : false

      setConnectedAs({ username, isAdmin })
      setTestResult(null)
    } catch (e) {
      setConnectedAs(null)
      let noCorsProbe: string | null = null
      const isFailedToFetch =
        e instanceof Error && e.name === 'TypeError' && /failed to fetch/i.test(e.message ?? '')
      if (isFailedToFetch) {
        try {
          // This can help distinguish "network unreachable" vs "CORS blocked".
          await fetch(url, { mode: 'no-cors' })
          noCorsProbe = 'no-cors probe: succeeded (network reachable; likely CORS/preflight blocked)'
        } catch (e2) {
          noCorsProbe = `no-cors probe: failed\n${formatError(e2)}`
        }
      }

      setTestResult(
        [
          `FAIL (direct)`,
          `url: ${url}`,
          `online: ${String(navigator.onLine)}`,
          `origin: ${window.location.origin}`,
          `baseUrl: ${cfg.baseUrl}`,
          `cultureInvariant: ${String(cfg.cultureInvariant)}`,
          `x-api-key: ${cfg.lubeLoggerApiKey ? `set (${cfg.lubeLoggerApiKey.length} chars)` : 'missing'}`,
          `preflightRequired: true (non-simple headers: x-api-key, culture-invariant)`,
          noCorsProbe,
          isFailedToFetch
            ? 'hint: Your server must allow OPTIONS and return Access-Control-Allow-Origin/Headers/Methods on /api/* responses.'
            : null,
          formatError(e),
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }
  }

  async function onTestConnection() {
    if (!cfg) return
    setBusyTest(true)
    setTestResult(null)
    setConnectedAs(null)
    try {
      await testWhoami()
    } catch (e) {
      setTestResult(formatError(e))
    } finally {
      setBusyTest(false)
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

        <label className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={cultureInvariant}
            onChange={(e) => setCultureInvariant(e.target.checked)}
          />
          <span>Send LubeLogger “culture-invariant” header</span>
        </label>

        <div className="field">
          <label>Default LLM</label>
          <select value={defaultLlmProvider} onChange={(e) => setDefaultLlmProvider(e.target.value as LlmProvider)}>
            <option value="gemini">Gemini</option>
            <option value="anthropic">Anthropic</option>
          </select>
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

        <div className="field">
          <label>Anthropic API Key</label>
          <input
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {!canSave && hasAnyLlmKey && !defaultProviderKey ? (
          <div className="muted">Enter an API key for your selected default LLM (or clear both keys to use manual entry only).</div>
        ) : null}

        <div className="actions">
          <button
            className={`btn${connectedAs ? ' success' : ''}`}
            onClick={onTestConnection}
            disabled={!cfg || busyTest}
          >
            {busyTest ? 'Testing…' : 'Test connection'}
          </button>
          <button className="btn primary" onClick={onSave} disabled={!cfg || busyTest}>
            Save
          </button>
        </div>

        {connectedAs ? (
          <div className="muted">
            Connected as <strong>{connectedAs.username}</strong>{' '}
            <span className={`badge ${connectedAs.isAdmin ? 'ok' : 'no'}`}>
              admin: {connectedAs.isAdmin ? 'yes' : 'no'}
            </span>
          </div>
        ) : null}

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
