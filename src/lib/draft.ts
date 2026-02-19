import { del, get, set } from 'idb-keyval'
import type { Draft } from './types'

const DRAFT_KEY = 'quickfuelup:draft:v1'

export async function loadDraft(): Promise<Draft | null> {
  const draft = await get<Draft>(DRAFT_KEY)
  return draft ?? null
}

export async function saveDraft(draft: Draft): Promise<void> {
  await set(DRAFT_KEY, draft)
}

export async function clearDraft(): Promise<void> {
  await del(DRAFT_KEY)
}

