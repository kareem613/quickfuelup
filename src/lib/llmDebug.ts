import type { LlmProvider } from './types'

export type LlmDebugEvent =
  | {
      type: 'request'
      provider: LlmProvider
      payload: unknown
    }
  | {
      type: 'chunk'
      provider: LlmProvider
      chunk: string
    }
  | {
      type: 'response'
      provider: LlmProvider
      payload: unknown
    }
  | {
      type: 'error'
      provider: LlmProvider
      error: string
    }

export function safeStringify(value: unknown, space = 2) {
  try {
    return JSON.stringify(value, null, space)
  } catch {
    return String(value)
  }
}

export function toPlainJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

