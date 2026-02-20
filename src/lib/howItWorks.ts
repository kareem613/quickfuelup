const HOW_IT_WORKS_DISMISSED_KEY = 'quickfuelup:howItWorksDismissed:v1'

export function isHowItWorksDismissed() {
  try {
    return localStorage.getItem(HOW_IT_WORKS_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissHowItWorks() {
  try {
    localStorage.setItem(HOW_IT_WORKS_DISMISSED_KEY, '1')
  } catch {
    // ignore (private mode / disabled storage)
  }
}

