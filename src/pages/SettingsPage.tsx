import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import { loadConfig, normalizeConfigFromUnknown, saveConfig } from '../lib/config'
import { decryptTokenToConfigJson, encryptConfigToToken, isShareCryptoSupported } from '../lib/shareConfig'
import type { AppConfig, LlmProvider } from '../lib/types'
import { getDeferredPrompt, isPwaInstallEnabled, isRunningStandalone, setDeferredPrompt, setPwaInstallEnabled } from '../lib/pwaInstall'
import { applyThemePreference, loadThemePreference, saveThemePreference } from '../lib/theme'
import type { ThemePreference } from '../lib/types'

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
  const location = useLocation()
  const existing = useMemo(() => loadConfig(), [])
  const [tab, setTab] = useState<'ui' | 'lubelogger' | 'llm'>('lubelogger')
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '')
  const [lubeLoggerApiKey, setLubeLoggerApiKey] = useState(existing?.lubeLoggerApiKey ?? '')
  const [providerOrder, setProviderOrder] = useState<LlmProvider[]>(() => {
    const raw = existing?.llm.providerOrder ?? (['gemini', 'anthropic'] as const)
    return Array.from(new Set(raw.filter((p) => p === 'gemini' || p === 'anthropic'))) as LlmProvider[]
  })
  const [geminiApiKey, setGeminiApiKey] = useState(existing?.llm.geminiApiKey ?? '')
  const [anthropicApiKey, setAnthropicApiKey] = useState(existing?.llm.anthropicApiKey ?? '')
  const [geminiModelFuel, setGeminiModelFuel] = useState(existing?.llm.geminiModelFuel ?? '')
  const [geminiModelService, setGeminiModelService] = useState(existing?.llm.geminiModelService ?? '')
  const [anthropicModelFuel, setAnthropicModelFuel] = useState(existing?.llm.anthropicModelFuel ?? '')
  const [anthropicModelService, setAnthropicModelService] = useState(existing?.llm.anthropicModelService ?? '')
  // Keep empty initially to avoid showing a "fake" list before the API-backed list arrives.
  const [geminiModels, setGeminiModels] = useState<string[]>([])
  const [anthropicModels, setAnthropicModels] = useState<string[]>([])
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false)
  const [anthropicModelsLoading, setAnthropicModelsLoading] = useState(false)
  const lastGeminiModelsKeyRef = useRef<string>('')
  const lastAnthropicModelsKeyRef = useRef<string>('')
  const [openModelPicker, setOpenModelPicker] = useState<null | 'geminiFuel' | 'geminiService' | 'anthropicFuel' | 'anthropicService'>(null)
  const closePickerTimer = useRef<number | null>(null)
  const [cultureInvariant, setCultureInvariant] = useState(existing?.cultureInvariant ?? true)
  const [showSoldVehicles, setShowSoldVehicles] = useState(existing?.showSoldVehicles ?? false)
  const [uiTheme, setUiTheme] = useState<ThemePreference>(() => existing?.uiTheme ?? loadThemePreference())
  const [geminiOpen, setGeminiOpen] = useState(() => Boolean(geminiApiKey.trim() || geminiModelFuel.trim() || geminiModelService.trim()))
  const [anthropicOpen, setAnthropicOpen] = useState(() =>
    Boolean(anthropicApiKey.trim() || anthropicModelFuel.trim() || anthropicModelService.trim()),
  )
  const [testResult, setTestResult] = useState<string | null>(null)
  const [busyTest, setBusyTest] = useState(false)
  const [connectedAs, setConnectedAs] = useState<{ username: string; isAdmin: boolean } | null>(null)
  const [installPromptReady, setInstallPromptReady] = useState(Boolean(getDeferredPrompt()))
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [sharePasscode, setSharePasscode] = useState('')
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importToken, setImportToken] = useState<string | null>(null)
  const [importPasscode, setImportPasscode] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<AppConfig | null>(null)
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
    const t = new URLSearchParams(location.search).get('cfg')
    setImportToken(t)
    setImportModalOpen(Boolean(t))
    setImportError(null)
    setImportNotice(null)
    setPendingImport(null)
    setImportPasscode('')
  }, [location.search])

  useEffect(() => {
    const onAny = () => setInstallPromptReady(Boolean(getDeferredPrompt()))
    window.addEventListener('beforeinstallprompt', onAny)
    window.addEventListener('appinstalled', onAny)
    return () => {
      window.removeEventListener('beforeinstallprompt', onAny)
      window.removeEventListener('appinstalled', onAny)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'llm') setOpenModelPicker(null)
  }, [tab])

  const hasAnyLlmKey = Boolean(geminiApiKey.trim() || anthropicApiKey.trim())
  const canSave = Boolean(baseUrl.trim() && lubeLoggerApiKey.trim())

  const cfg: AppConfig | null = canSave
      ? {
          baseUrl: baseUrl.trim().replace(/\/+$/, ''),
          lubeLoggerApiKey: lubeLoggerApiKey.trim(),
          cultureInvariant,
          showSoldVehicles,
          uiTheme,
          useProxy: false,
          llm: {
            providerOrder: activeProviders,
            ...(geminiApiKey.trim() ? { geminiApiKey: geminiApiKey.trim() } : null),
            ...(anthropicApiKey.trim() ? { anthropicApiKey: anthropicApiKey.trim() } : null),
            ...(normalizeModelInput(geminiModelFuel) ? { geminiModelFuel: normalizeModelInput(geminiModelFuel) } : null),
            ...(normalizeModelInput(geminiModelService)
              ? { geminiModelService: normalizeModelInput(geminiModelService) }
              : null),
            ...(normalizeModelInput(anthropicModelFuel)
              ? { anthropicModelFuel: normalizeModelInput(anthropicModelFuel) }
              : null),
            ...(normalizeModelInput(anthropicModelService)
              ? { anthropicModelService: normalizeModelInput(anthropicModelService) }
              : null),
           },
          }
        : null

  function applyConfigToForm(next: AppConfig) {
    setBaseUrl(next.baseUrl ?? '')
    setLubeLoggerApiKey(next.lubeLoggerApiKey ?? '')
    setCultureInvariant(next.cultureInvariant ?? true)
    setShowSoldVehicles(Boolean(next.showSoldVehicles))
    if (next.uiTheme) {
      setUiTheme(next.uiTheme)
      saveThemePreference(next.uiTheme)
      applyThemePreference(next.uiTheme)
    }
    const orderRaw = next.llm?.providerOrder ?? (['gemini', 'anthropic'] as const)
    setProviderOrder(Array.from(new Set(orderRaw.filter((p) => p === 'gemini' || p === 'anthropic'))) as LlmProvider[])
    setGeminiApiKey(next.llm?.geminiApiKey ?? '')
    setAnthropicApiKey(next.llm?.anthropicApiKey ?? '')
    setGeminiModelFuel(next.llm?.geminiModelFuel ?? '')
    setGeminiModelService(next.llm?.geminiModelService ?? '')
    setAnthropicModelFuel(next.llm?.anthropicModelFuel ?? '')
    setAnthropicModelService(next.llm?.anthropicModelService ?? '')
  }

  function clearImportTokenFromUrl() {
    const params = new URLSearchParams(location.search)
    params.delete('cfg')
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
  }

  async function onDecryptImport() {
    if (!importToken) return
    if (!importPasscode.trim()) {
      setImportError('Enter the passcode.')
      return
    }
    setImportError(null)
    setImportNotice(null)
    setPendingImport(null)
    try {
      const decrypted = await decryptTokenToConfigJson(importToken, importPasscode.trim())
      const normalized = normalizeConfigFromUnknown(decrypted)
      if (!normalized) throw new Error('Decrypted settings were not recognized by this app version.')

      if (loadConfig()) {
        setPendingImport(normalized)
        setImportNotice(null)
        return
      }

      saveConfig(normalized)
      applyConfigToForm(normalized)
      setImportNotice('Imported settings applied.')
      clearImportTokenFromUrl()
      setImportModalOpen(false)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to decrypt.')
    }
  }

  async function onGenerateShareLink() {
    if (!cfg) {
      setShareError('Fill in Base URL and API key first.')
      return
    }
    if (!isShareCryptoSupported()) {
      setShareError('Sharing requires a modern browser with WebCrypto support.')
      return
    }
    if (!sharePasscode.trim()) {
      setShareError('Enter a passcode.')
      return
    }
    setShareBusy(true)
    setShareError(null)
    try {
      // Do not share UI theme preference; keep it local to the device.
      const token = await encryptConfigToToken({ ...cfg, uiTheme: undefined }, sharePasscode.trim())
      const url = new URL('/settings', window.location.origin)
      url.searchParams.set('cfg', token)
      setShareLink(url.toString())
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to generate share link.')
    } finally {
      setShareBusy(false)
    }
  }

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

  function onSetTheme(next: ThemePreference) {
    setUiTheme(next)
    saveThemePreference(next)
    applyThemePreference(next)
    const existingCfg = loadConfig()
    if (existingCfg) saveConfig({ ...existingCfg, uiTheme: next })
  }

  function providerLabel(p: LlmProvider) {
    return p === 'anthropic' ? 'Anthropic' : 'Gemini'
  }

  const DEFAULT_GEMINI_FUEL = 'gemini-2.5-flash'
  const DEFAULT_GEMINI_SERVICE = 'gemini-2.5-pro'
  const DEFAULT_ANTHROPIC_FUEL = 'claude-haiku-4-5'
  const DEFAULT_ANTHROPIC_SERVICE = 'claude-sonnet-4-5'

  const FALLBACK_GEMINI_MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ] as const
  const FALLBACK_ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5'] as const

  function costTier(provider: LlmProvider, modelId: string): 1 | 2 | 3 {
    const id = modelId.toLowerCase()
    if (provider === 'gemini') {
      if (id.includes('flash-lite')) return 1
      if (id.includes('flash')) return 2
      if (id.includes('pro')) return 3
      return 2
    }
    if (id.includes('haiku')) return 1
    if (id.includes('sonnet')) return 2
    if (id.includes('opus')) return 3
    return 2
  }

  function costBadge(provider: LlmProvider, modelId: string) {
    const tier = costTier(provider, modelId)
    return tier === 1 ? '$' : tier === 2 ? '$$' : '$$$'
  }

  function sortModels(provider: LlmProvider, ids: string[]) {
    return ids
      .slice()
      .sort((a, b) => costTier(provider, a) - costTier(provider, b) || a.localeCompare(b))
  }

  const sortedGeminiModels = useMemo(() => sortModels('gemini', geminiModels), [geminiModels])
  const sortedAnthropicModels = useMemo(() => sortModels('anthropic', anthropicModels), [anthropicModels])

  function normalizeModelInput(v: string) {
    return v.trim().replace(/\s*\(\$+\)\s*$/, '')
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

  async function loadGeminiModels() {
    const key = geminiApiKey.trim()
    if (!key) {
      if (!geminiModels.length) setGeminiModels(Array.from(new Set(FALLBACK_GEMINI_MODELS)))
      return
    }
    if (lastGeminiModelsKeyRef.current === key) return
    lastGeminiModelsKeyRef.current = key
    setGeminiModelsLoading(true)
    try {
      const res = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models',
        { headers: { 'x-goog-api-key': key } },
        6000,
      )
      const data = (await res.json()) as unknown
      const models =
        typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).models)
          ? ((data as Record<string, unknown>).models as unknown[])
          : []
      const names = models
        .map((m) => {
          if (typeof m !== 'object' || m === null) return null
          const obj = m as Record<string, unknown>
          const name = typeof obj.name === 'string' ? obj.name : null
          const methods = Array.isArray(obj.supportedGenerationMethods) ? (obj.supportedGenerationMethods as unknown[]) : []
          const supportsGenerate = methods.some((x) => x === 'generateContent')
          if (!name || !supportsGenerate) return null
          // API returns "models/<id>"
          const id = name.startsWith('models/') ? name.slice('models/'.length) : name
          return id
        })
        .filter((x): x is string => Boolean(x && x.startsWith('gemini-')))
      if (names.length) setGeminiModels(Array.from(new Set(names)))
      else if (!geminiModels.length) setGeminiModels(Array.from(new Set(FALLBACK_GEMINI_MODELS)))
    } catch {
      if (!geminiModels.length) setGeminiModels(Array.from(new Set(FALLBACK_GEMINI_MODELS)))
    } finally {
      setGeminiModelsLoading(false)
    }
  }

  async function loadAnthropicModels() {
    const key = anthropicApiKey.trim()
    if (!key) {
      if (!anthropicModels.length) setAnthropicModels(Array.from(new Set(FALLBACK_ANTHROPIC_MODELS)))
      return
    }
    if (lastAnthropicModelsKeyRef.current === key) return
    lastAnthropicModelsKeyRef.current = key
    setAnthropicModelsLoading(true)
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/models',
        {
          headers: {
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'x-api-key': key,
          },
        },
        6000,
      )
      const data = (await res.json()) as unknown
      const items =
        typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).data)
          ? ((data as Record<string, unknown>).data as unknown[])
          : []
      const ids = items
        .map((m) => {
          if (typeof m !== 'object' || m === null) return null
          const obj = m as Record<string, unknown>
          return typeof obj.id === 'string' ? obj.id : null
        })
        .filter((x): x is string => Boolean(x))
      if (ids.length) setAnthropicModels(Array.from(new Set(ids)))
      else if (!anthropicModels.length) setAnthropicModels(Array.from(new Set(FALLBACK_ANTHROPIC_MODELS)))
    } catch {
      if (!anthropicModels.length) setAnthropicModels(Array.from(new Set(FALLBACK_ANTHROPIC_MODELS)))
    } finally {
      setAnthropicModelsLoading(false)
    }
  }

  useEffect(() => {
    // Prefetch so the picker is ready on first click.
    if (geminiApiKey.trim()) void loadGeminiModels()
    else setGeminiModels([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geminiApiKey])

  useEffect(() => {
    if (anthropicApiKey.trim()) void loadAnthropicModels()
    else setAnthropicModels([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicApiKey])

  function openPicker(kind: NonNullable<typeof openModelPicker>) {
    if (closePickerTimer.current) window.clearTimeout(closePickerTimer.current)
    closePickerTimer.current = null
    setOpenModelPicker(kind)
    if (kind.startsWith('gemini')) void loadGeminiModels()
    if (kind.startsWith('anthropic')) void loadAnthropicModels()
  }

  function scheduleClosePicker() {
    if (closePickerTimer.current) window.clearTimeout(closePickerTimer.current)
    closePickerTimer.current = window.setTimeout(() => setOpenModelPicker(null), 120)
  }

  return (
    <div className="container stack">
      <TopNav />
      <h2 style={{ margin: 0 }}>Settings</h2>

      <div className="tabs" role="tablist" aria-label="Settings tabs">
        <button
          type="button"
          className={`tab-btn${tab === 'ui' ? ' active' : ''}`}
          role="tab"
          aria-selected={tab === 'ui'}
          onClick={() => setTab('ui')}
        >
          UI
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'lubelogger' ? ' active' : ''}`}
          role="tab"
          aria-selected={tab === 'lubelogger'}
          onClick={() => setTab('lubelogger')}
        >
          LubeLogger
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'llm' ? ' active' : ''}`}
          role="tab"
          aria-selected={tab === 'llm'}
          onClick={() => setTab('llm')}
        >
          LLM
        </button>
      </div>

      {importToken && importModalOpen ? (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return
            setPendingImport(null)
            setImportModalOpen(false)
            clearImportTokenFromUrl()
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="card stack">
              <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                <strong>Import shared settings</strong>
                <button
                  className="btn small"
                  type="button"
                  onClick={() => {
                    setPendingImport(null)
                    setImportModalOpen(false)
                    clearImportTokenFromUrl()
                  }}
                >
                  Close
                </button>
              </div>

              {!isShareCryptoSupported() ? (
                <div className="muted">Import requires a modern browser with WebCrypto support.</div>
              ) : (
                <>
                  {pendingImport ? (
                    <div className="card stack" style={{ padding: 10 }}>
                      <div className="muted">
                        Existing settings were found on this device. Overwrite all existing settings?
                      </div>
                      <div className="actions">
                        <button
                          className="btn primary"
                          type="button"
                          onClick={() => {
                            saveConfig(pendingImport)
                            applyConfigToForm(pendingImport)
                            setPendingImport(null)
                            setImportModalOpen(false)
                            clearImportTokenFromUrl()
                          }}
                        >
                          Overwrite all
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setPendingImport(null)
                            setImportModalOpen(false)
                            clearImportTokenFromUrl()
                          }}
                        >
                          Keep mine
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                       <div className="muted">
                        This link contains encrypted AppConfig settings only (no drafts or other flags). UI theme is not
                        shared.
                       </div>
                      <div className="field">
                        <label>Passcode</label>
                        <input
                          type="text"
                          value={importPasscode}
                          onChange={(e) => setImportPasscode(e.target.value)}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="actions">
                        <button
                          className="btn primary"
                          type="button"
                          onClick={onDecryptImport}
                          disabled={!importPasscode.trim()}
                        >
                          Decrypt
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setPendingImport(null)
                            setImportModalOpen(false)
                            clearImportTokenFromUrl()
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              {importError ? <div className="error">{importError}</div> : null}
              {importNotice ? <div className="muted">{importNotice}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {shareModalOpen ? (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return
            setShareModalOpen(false)
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="card stack">
              <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                <strong>Share settings</strong>
                <button className="btn small" type="button" onClick={() => setShareModalOpen(false)}>
                  Close
                </button>
              </div>

              {!isShareCryptoSupported() ? (
                <div className="muted">Sharing requires a modern browser with WebCrypto support.</div>
              ) : (
                <>
                  <div className="muted">
                    Warning: This does not give them your LubeLogger login, but it does share your LubeLogger API key—so
                    anyone you share this with can create/edit records via the API (editor-level access).
                  </div>
                  <div className="muted">Use a long passcode; anyone with the link can attempt offline guessing.</div>
                  <div className="field">
                    <label>Passcode</label>
                    <input
                      type="text"
                      value={sharePasscode}
                      onChange={(e) => {
                        setSharePasscode(e.target.value)
                        setShareLink(null)
                        setShareError(null)
                      }}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="actions">
                    <button className="btn primary" type="button" onClick={onGenerateShareLink} disabled={!cfg || shareBusy}>
                      {shareBusy ? 'Generating…' : 'Generate link'}
                    </button>
                    {shareLink ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(shareLink)
                            setShareError(null)
                          } catch {
                            setShareError('Could not copy to clipboard.')
                          }
                        }}
                      >
                        Copy link
                      </button>
                    ) : null}
                    {shareLink && typeof navigator.share === 'function' ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.share({ url: shareLink, title: 'QuickFillUp settings' })
                            setShareError(null)
                          } catch {
                            // user canceled or share failed
                          }
                        }}
                      >
                        Share…
                      </button>
                    ) : null}
                  </div>
                  {shareLink ? (
                    <div className="field">
                      <label>Link</label>
                      <input value={shareLink} readOnly />
                    </div>
                  ) : null}
                </>
              )}
              {shareError ? <div className="error">{shareError}</div> : null}
            </div>
          </div>
        </div>
       ) : null}

      {tab === 'ui' ? (
        <div className="stack" role="tabpanel" aria-label="UI settings">
          <div className="card stack">
            <strong>UI</strong>
            <div className="field">
              <label>Theme</label>
              <select
                value={uiTheme}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'system' || v === 'dark' || v === 'light') onSetTheme(v)
                }}
              >
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
            <div className="muted">System follows your device theme.</div>

            <label className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
              <input type="checkbox" checked={showSoldVehicles} onChange={(e) => setShowSoldVehicles(e.target.checked)} />
              <span>Show sold vehicles</span>
            </label>
          </div>

          {isPwaInstallEnabled() && !isRunningStandalone() && installPromptReady ? (
            <div className="card stack">
              <strong>App</strong>
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
              <div className="muted">Install appears after a successful connection test.</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'lubelogger' ? (
        <div className="stack" role="tabpanel" aria-label="LubeLogger settings">
          <div className="card stack">
            <strong>LubeLogger</strong>
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
              <input type="checkbox" checked={cultureInvariant} onChange={(e) => setCultureInvariant(e.target.checked)} />
              <span>Send LubeLogger “culture-invariant” header</span>
            </label>

            <div className="actions">
              <button className={`btn${connectedAs ? ' success' : ''}`} onClick={onTestConnection} disabled={!cfg || busyTest}>
                {busyTest ? 'Testing…' : 'Test connection'}
              </button>
              <button className="btn primary" onClick={onSave} disabled={!cfg || busyTest}>
                Save
              </button>
            </div>

            {connectedAs ? (
              <div className="muted">
                Connected as <strong>{connectedAs.username}</strong>{' '}
                <span className={`badge ${connectedAs.isAdmin ? 'ok' : 'no'}`}>admin: {connectedAs.isAdmin ? 'yes' : 'no'}</span>
              </div>
            ) : null}

            {testResult ? <div className={testResult.startsWith('OK') ? 'card' : 'error'}>{testResult}</div> : null}
          </div>

          {isPwaInstallEnabled() ? (
            <div className="card stack">
              <strong>Share / Import</strong>
              <div className="actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setShareModalOpen(true)
                    setShareError(null)
                    setShareLink(null)
                  }}
                  disabled={!cfg || busyTest}
                >
                  Share settings
                </button>
              </div>
              <div className="muted">To import, open a shared link (it will prompt for the passcode).</div>
            </div>
          ) : (
            <div className="muted">Test connection to enable sharing and install.</div>
          )}
        </div>
      ) : null}

      {tab === 'llm' ? (
        <div className="stack" role="tabpanel" aria-label="LLM settings">
          <div className="card stack">
            <strong>Extraction (LLM)</strong>
            <div className="field">
              <label>LLM order</label>
              <div className="stack" style={{ gap: 8 }}>
                {activeProviders.length ? (
                  activeProviders.map((p, idx) => (
                    <div key={p} className="row llm-order-item" aria-label={`LLM priority ${idx + 1}: ${providerLabel(p)}`}>
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
          </div>

          <div className={`card stack${geminiOpen ? '' : ' collapsed'}`}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
              <button className="row card-header-btn" type="button" onClick={() => setGeminiOpen((v) => !v)}>
                <strong>Gemini</strong>
              </button>
              <span className="muted">{geminiApiKey.trim() ? 'Configured' : 'Not set'}</span>
            </div>
            {!geminiOpen ? null : (
              <>
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
                  <label>
                    Model (Fuel) {costBadge('gemini', geminiModelFuel.trim() || DEFAULT_GEMINI_FUEL)}
                  </label>
                  <input
                    value={geminiModelFuel}
                    onChange={(e) => setGeminiModelFuel(normalizeModelInput(e.target.value))}
                    placeholder={`(default: ${DEFAULT_GEMINI_FUEL})`}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onFocus={() => openPicker('geminiFuel')}
                    onBlur={scheduleClosePicker}
                    disabled={geminiModelsLoading && openModelPicker === 'geminiFuel'}
                  />
                  {openModelPicker === 'geminiFuel' ? (
                    <div className="card stack" style={{ marginTop: 8, padding: 10 }}>
                      {geminiModelsLoading ? (
                        <div className="muted">Loading Gemini models…</div>
                      ) : (
                        sortedGeminiModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="btn small"
                            style={{ justifyContent: 'flex-start' }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setGeminiModelFuel(m)
                              setOpenModelPicker(null)
                            }}
                          >
                            {m} ({costBadge('gemini', m)})
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="field">
                  <label>
                    Model (Service) {costBadge('gemini', geminiModelService.trim() || DEFAULT_GEMINI_SERVICE)}
                  </label>
                  <input
                    value={geminiModelService}
                    onChange={(e) => setGeminiModelService(normalizeModelInput(e.target.value))}
                    placeholder={`(default: ${DEFAULT_GEMINI_SERVICE})`}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onFocus={() => openPicker('geminiService')}
                    onBlur={scheduleClosePicker}
                    disabled={geminiModelsLoading && openModelPicker === 'geminiService'}
                  />
                  {openModelPicker === 'geminiService' ? (
                    <div className="card stack" style={{ marginTop: 8, padding: 10 }}>
                      {geminiModelsLoading ? (
                        <div className="muted">Loading Gemini models…</div>
                      ) : (
                        sortedGeminiModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="btn small"
                            style={{ justifyContent: 'flex-start' }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setGeminiModelService(m)
                              setOpenModelPicker(null)
                            }}
                          >
                            {m} ({costBadge('gemini', m)})
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <div className={`card stack${anthropicOpen ? '' : ' collapsed'}`}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
              <button className="row card-header-btn" type="button" onClick={() => setAnthropicOpen((v) => !v)}>
                <strong>Anthropic</strong>
              </button>
              <span className="muted">{anthropicApiKey.trim() ? 'Configured' : 'Not set'}</span>
            </div>
            {!anthropicOpen ? null : (
              <>
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

                <div className="field">
                  <label>
                    Model (Fuel) {costBadge('anthropic', anthropicModelFuel.trim() || DEFAULT_ANTHROPIC_FUEL)}
                  </label>
                  <input
                    value={anthropicModelFuel}
                    onChange={(e) => setAnthropicModelFuel(normalizeModelInput(e.target.value))}
                    placeholder={`(default: ${DEFAULT_ANTHROPIC_FUEL})`}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onFocus={() => openPicker('anthropicFuel')}
                    onBlur={scheduleClosePicker}
                    disabled={anthropicModelsLoading && openModelPicker === 'anthropicFuel'}
                  />
                  {openModelPicker === 'anthropicFuel' ? (
                    <div className="card stack" style={{ marginTop: 8, padding: 10 }}>
                      {anthropicModelsLoading ? (
                        <div className="muted">Loading Anthropic models…</div>
                      ) : (
                        sortedAnthropicModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="btn small"
                            style={{ justifyContent: 'flex-start' }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setAnthropicModelFuel(m)
                              setOpenModelPicker(null)
                            }}
                          >
                            {m} ({costBadge('anthropic', m)})
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="field">
                  <label>
                    Model (Service) {costBadge('anthropic', anthropicModelService.trim() || DEFAULT_ANTHROPIC_SERVICE)}
                  </label>
                  <input
                    value={anthropicModelService}
                    onChange={(e) => setAnthropicModelService(normalizeModelInput(e.target.value))}
                    placeholder={`(default: ${DEFAULT_ANTHROPIC_SERVICE})`}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onFocus={() => openPicker('anthropicService')}
                    onBlur={scheduleClosePicker}
                    disabled={anthropicModelsLoading && openModelPicker === 'anthropicService'}
                  />
                  {openModelPicker === 'anthropicService' ? (
                    <div className="card stack" style={{ marginTop: 8, padding: 10 }}>
                      {anthropicModelsLoading ? (
                        <div className="muted">Loading Anthropic models…</div>
                      ) : (
                        sortedAnthropicModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="btn small"
                            style={{ justifyContent: 'flex-start' }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setAnthropicModelService(m)
                              setOpenModelPicker(null)
                            }}
                          >
                            {m} ({costBadge('anthropic', m)})
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {!hasAnyLlmKey ? <div className="muted">No LLM keys set. You can still enter values manually.</div> : null}
        </div>
      ) : null}

      <button className="btn" type="button" onClick={() => navigate('/how-it-works?next=%2Fsettings')}>
        How it works
      </button>
    </div>
  )
}
