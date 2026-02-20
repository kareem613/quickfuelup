export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const ENABLE_KEY = 'quickfuelup:pwaInstallEnabled'

let deferred: BeforeInstallPromptEvent | null = null

export function isPwaInstallEnabled() {
  return localStorage.getItem(ENABLE_KEY) === '1'
}

export function setPwaInstallEnabled(enabled: boolean) {
  localStorage.setItem(ENABLE_KEY, enabled ? '1' : '0')
}

export function setDeferredPrompt(e: BeforeInstallPromptEvent | null) {
  deferred = e
}

export function getDeferredPrompt() {
  return deferred
}

export function isRunningStandalone() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone === true
}

export function setupPwaInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Defer the browser prompt so we can show it only after Settings "Test connection" succeeds.
    e.preventDefault()
    setDeferredPrompt(e as BeforeInstallPromptEvent)
  })

  window.addEventListener('appinstalled', () => {
    setDeferredPrompt(null)
  })
}

