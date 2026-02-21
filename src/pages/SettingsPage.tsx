import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadConfig, saveConfig } from '../lib/config'
import type { AppConfig, LlmProvider } from '../lib/types'
import { getDeferredPrompt, isPwaInstallEnabled, isRunningStandalone, setDeferredPrompt, setPwaInstallEnabled } from '../lib/pwaInstall'

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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, ms: number) {
  const controller = new AbortController()
  const t = window.setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(t)
  }
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const existing = useMemo(() => loadConfig(), [])
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '')
  const [lubeLoggerApiKey, setLubeLoggerApiKey] = useState(existing?.lubeLoggerApiKey ?? '')
  const [providerOrder, setProviderOrder] = useState<LlmProvider[]>(() => {
    const raw = existing?.llm.providerOrder ?? (['gemini', 'anthropic'] as const)
    return Array.from(new Set(raw.filter((p) => p === 'gemini' || p === 'anthropic'))) as LlmProvider[]
  })
  const [geminiApiKey, setGeminiApiKey] = useState(existing?.llm.geminiApiKey ?? '')
  const [anthropicApiKey, setAnthropicApiKey] = useState(existing?.llm.anthropicApiKey ?? '')
  const [cultureInvariant, setCultureInvariant] = useState(existing?.cultureInvariant ?? true)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [busyTest, setBusyTest] = useState(false)
  const [connectedAs, setConnectedAs] = useState<{ username: string; isAdmin: boolean } | null>(null)
  const [installPromptReady, setInstallPromptReady] = useState(Boolean(getDeferredPrompt()))
  const activeProviders = useMemo(() => {
    const keyFor = (p: LlmProvider) => (p === 'anthropic' ? anthropicApiKey.trim() : geminiApiKey.trim())
    const ordered = providerOrder.filter((p) => keyFor(p))
    const missing = (['gemini', 'anthropic'] as const).filter((p) => keyFor(p) && !ordered.includes(p))
    return [...ordered, ...missing]
  }, [anthropicApiKey, geminiApiKey, providerOrder])

  useEffect(() => {
    document.title = 'QuickFillUp - Settings'
  }, [])

  useEffect(() => {
    const onAny = () => setInstallPromptReady(Boolean(getDeferredPrompt()))
    window.addEventListener('beforeinstallprompt', onAny)
    window.addEventListener('appinstalled', onAny)
    return () => {
      window.removeEventListener('beforeinstallprompt', onAny)
      window.removeEventListener('appinstalled', onAny)
    }
  }, [])

  const hasAnyLlmKey = Boolean(geminiApiKey.trim() || anthropicApiKey.trim())
  const canSave = Boolean(baseUrl.trim() && lubeLoggerApiKey.trim())

  const cfg: AppConfig | null = canSave
      ? {
          baseUrl: baseUrl.trim().replace(/\/+$/, ''),
          lubeLoggerApiKey: lubeLoggerApiKey.trim(),
          cultureInvariant,
          useProxy: false,
          llm: {
          providerOrder: activeProviders,
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
      const res = await fetchWithTimeout(url, { headers }, 6000)
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
      setPwaInstallEnabled(true)
      setTestResult(null)
    } catch (e) {
      setConnectedAs(null)
      const isAbort = e instanceof Error && e.name === 'AbortError'
      if (isAbort) {
        setTestResult('Timeout: could not connect to LubeLogger. Check your connection and try again.')
        return
      }
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

  function providerLabel(p: LlmProvider) {
    return p === 'anthropic' ? 'Anthropic' : 'Gemini'
  }

  function moveProvider(from: number, to: number) {
    setProviderOrder((prev) => {
      if (from === to) return prev
      const next = activeProviders.slice()
      const [item] = next.splice(from, 1)
      if (!item) return prev
      next.splice(to, 0, item)
      return next
    })
  }

  return (
    <div className="container stack">
      <div className="row">
        <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <img src="/icons/ios/32.png" alt="" width={24} height={24} style={{ borderRadius: 6 }} />
          <h2 style={{ margin: 0 }}>Settings</h2>
        </div>
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
          <label>LLM order</label>
          <div className="stack" style={{ gap: 8 }}>
            {activeProviders.length ? (
              activeProviders.map((p, idx) => (
              <div
                key={p}
                className="row"
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  background: 'rgba(0, 0, 0, 0.18)',
                }}
                aria-label={`LLM priority ${idx + 1}: ${providerLabel(p)}`}
              >
                <strong>
                  {idx + 1}. {providerLabel(p)}
                </strong>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                  <button className="btn small" type="button" disabled={idx === 0} onClick={() => moveProvider(idx, idx - 1)}>
                    ↑
                  </button>
                  <button
                    className="btn small"
                    type="button"
                    disabled={idx === activeProviders.length - 1}
                    onClick={() => moveProvider(idx, idx + 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
              ))
            ) : (
              <div className="muted">Add one or more LLM API keys below to enable extraction.</div>
            )}
          </div>
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

        {!hasAnyLlmKey ? <div className="muted">No LLM keys set. You can still enter values manually.</div> : null}

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

        {isPwaInstallEnabled() && !isRunningStandalone() && installPromptReady ? (
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const p = getDeferredPrompt()
              if (!p) return
              await p.prompt()
              try {
                await p.userChoice
              } finally {
                setDeferredPrompt(null)
              }
            }}
          >
            Install app
          </button>
        ) : null}

        {testResult && <div className={testResult.startsWith('OK') ? 'card' : 'error'}>{testResult}</div>}
      </div>

      {!existing && (
        <div className="muted">
          Keys are stored locally in your browser. This is a client-only app; don’t use keys you can’t trust on this
          device.
        </div>
      )}

      <button className="btn" type="button" onClick={() => navigate('/how-it-works?next=%2Fsettings')}>
        How it works
      </button>
    </div>
  )
}
