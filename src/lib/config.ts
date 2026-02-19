import type { AppConfig } from './types'

const CONFIG_KEY = 'quickfuelup:config:v1'

export function loadConfig(): AppConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    if (!parsed.baseUrl || !parsed.lubeLoggerApiKey || !parsed.geminiApiKey) return null
    return {
      baseUrl: String(parsed.baseUrl).replace(/\/+$/, ''),
      lubeLoggerApiKey: String(parsed.lubeLoggerApiKey),
      geminiApiKey: String(parsed.geminiApiKey),
      cultureInvariant: Boolean(parsed.cultureInvariant),
      useProxy: Boolean(parsed.useProxy),
    }
  } catch {
    return null
  }
}

export function saveConfig(cfg: AppConfig) {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({
      ...cfg,
      baseUrl: cfg.baseUrl.replace(/\/+$/, ''),
    } satisfies AppConfig),
  )
}
