import type { AppConfig } from './types'

const CONFIG_KEY_V2 = 'quickfuelup:config:v2'
const CONFIG_KEY_V1 = 'quickfuelup:config:v1'

export function normalizeConfigFromUnknown(value: unknown): AppConfig | null {
  const parsed =
    typeof value === 'object' && value !== null
      ? (value as Partial<AppConfig> & {
          // Legacy v1 shape
          geminiApiKey?: unknown
          llm?: unknown
        })
      : null
  if (!parsed?.baseUrl || !parsed.lubeLoggerApiKey) return null

  const llmObj = typeof parsed.llm === 'object' && parsed.llm !== null ? (parsed.llm as Record<string, unknown>) : {}

  const geminiApiKey =
    typeof llmObj.geminiApiKey === 'string'
      ? llmObj.geminiApiKey
      : typeof parsed.geminiApiKey === 'string'
        ? parsed.geminiApiKey
        : undefined
  const anthropicApiKey = typeof llmObj.anthropicApiKey === 'string' ? llmObj.anthropicApiKey : undefined
  const geminiModelFuel = typeof llmObj.geminiModelFuel === 'string' ? llmObj.geminiModelFuel : undefined
  const geminiModelService = typeof llmObj.geminiModelService === 'string' ? llmObj.geminiModelService : undefined
  const anthropicModelFuel = typeof llmObj.anthropicModelFuel === 'string' ? llmObj.anthropicModelFuel : undefined
  const anthropicModelService = typeof llmObj.anthropicModelService === 'string' ? llmObj.anthropicModelService : undefined

  const providerOrderRaw = Array.isArray(llmObj.providerOrder) ? llmObj.providerOrder : null
  const providerOrderFromCfg = providerOrderRaw
    ? providerOrderRaw.filter((p): p is 'gemini' | 'anthropic' => p === 'gemini' || p === 'anthropic')
    : []

  // Legacy v2 shape used defaultProvider; convert to providerOrder.
  const legacyDefaultProvider =
    llmObj.defaultProvider === 'anthropic' || llmObj.defaultProvider === 'gemini'
      ? (llmObj.defaultProvider as 'anthropic' | 'gemini')
      : null
  const providerOrderFromLegacyDefault = legacyDefaultProvider
    ? [legacyDefaultProvider, legacyDefaultProvider === 'gemini' ? 'anthropic' : 'gemini']
    : []

  const providerOrder = (
    providerOrderFromCfg.length > 0
      ? providerOrderFromCfg
      : providerOrderFromLegacyDefault.length > 0
        ? providerOrderFromLegacyDefault
        : ['gemini', 'anthropic']
  ) as AppConfig['llm']['providerOrder']

  return {
    baseUrl: String(parsed.baseUrl).replace(/\/+$/, ''),
    lubeLoggerApiKey: String(parsed.lubeLoggerApiKey),
    cultureInvariant: parsed.cultureInvariant === undefined ? true : Boolean(parsed.cultureInvariant),
    showSoldVehicles: Boolean((parsed as Record<string, unknown>).showSoldVehicles),
    useProxy: Boolean(parsed.useProxy),
    llm: {
      providerOrder,
      ...(geminiApiKey ? { geminiApiKey: String(geminiApiKey) } : null),
      ...(anthropicApiKey ? { anthropicApiKey: String(anthropicApiKey) } : null),
      ...(geminiModelFuel?.trim() ? { geminiModelFuel: geminiModelFuel.trim() } : null),
      ...(geminiModelService?.trim() ? { geminiModelService: geminiModelService.trim() } : null),
      ...(anthropicModelFuel?.trim() ? { anthropicModelFuel: anthropicModelFuel.trim() } : null),
      ...(anthropicModelService?.trim() ? { anthropicModelService: anthropicModelService.trim() } : null),
    },
  }
}

export function loadConfig(): AppConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY_V2) ?? localStorage.getItem(CONFIG_KEY_V1)
  if (!raw) return null
  try {
    return normalizeConfigFromUnknown(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveConfig(cfg: AppConfig) {
  localStorage.setItem(
    CONFIG_KEY_V2,
    JSON.stringify({
      ...cfg,
      baseUrl: cfg.baseUrl.replace(/\/+$/, ''),
    } satisfies AppConfig),
  )
}
