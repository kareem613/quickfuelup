import { del, get, set } from 'idb-keyval'
import type { ServiceDraft } from './types'

const SERVICE_DRAFT_KEY = 'quickfuelup:serviceDraft:v1'

export async function loadServiceDraft(): Promise<ServiceDraft | null> {
  const draft = await get<ServiceDraft>(SERVICE_DRAFT_KEY)
  return draft ?? null
}

export async function saveServiceDraft(draft: ServiceDraft): Promise<void> {
  await set(SERVICE_DRAFT_KEY, draft)
}

export async function clearServiceDraft(): Promise<void> {
  await del(SERVICE_DRAFT_KEY)
}

