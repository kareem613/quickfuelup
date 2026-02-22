import type { ThemePreference } from './types'
export type { ThemePreference } from './types'

const THEME_KEY = 'quickfuelup:uiTheme:v1'
const DARK_MQ = '(prefers-color-scheme: dark)'

let mq: MediaQueryList | null = null
let mqListener: ((e: MediaQueryListEvent) => void) | null = null

function isThemePreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark'
}

export function loadThemePreference(): ThemePreference {
  const raw = localStorage.getItem(THEME_KEY)
  return isThemePreference(raw) ? raw : 'system'
}

export function saveThemePreference(pref: ThemePreference) {
  localStorage.setItem(THEME_KEY, pref)
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia(DARK_MQ).matches ? 'dark' : 'light'
  }
  return pref
}

export function applyThemePreference(pref: ThemePreference) {
  const resolved = resolveTheme(pref)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved

  if (pref !== 'system') {
    if (mq && mqListener) mq.removeEventListener('change', mqListener)
    mq = null
    mqListener = null
    return
  }

  if (!mq) mq = window.matchMedia(DARK_MQ)
  if (!mqListener) {
    mqListener = () => {
      document.documentElement.dataset.theme = resolveTheme('system')
      document.documentElement.style.colorScheme = resolveTheme('system')
    }
    mq.addEventListener('change', mqListener)
  }
}
