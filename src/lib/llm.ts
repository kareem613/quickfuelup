import type { LlmProvider } from './types'
import { extractFromImagesAnthropic, extractServiceFromDocumentAnthropic } from './anthropic'
import { extractFromImages as extractFromImagesGemini, extractServiceFromDocument } from './gemini'

export type ProviderWithKey = { provider: LlmProvider; apiKey: string }

export async function extractFromImagesViaProvider(params: {
  provider: LlmProvider
  apiKey: string
  pumpImage: Blob
  odometerImage: Blob
}) {
  if (params.provider === 'anthropic') {
    return extractFromImagesAnthropic({
      apiKey: params.apiKey,
      pumpImage: params.pumpImage,
      odometerImage: params.odometerImage,
    })
  }
  return extractFromImagesGemini({
    apiKey: params.apiKey,
    pumpImage: params.pumpImage,
    odometerImage: params.odometerImage,
  })
}

export async function extractFromImagesWithFallback(params: {
  providers: ProviderWithKey[]
  pumpImage: Blob
  odometerImage: Blob
}) {
  const providers = params.providers.filter((p) => p.apiKey.trim())
  if (providers.length === 0) throw new Error('No LLM API keys configured (Settings).')

  let lastErr: unknown
  for (const p of providers) {
    try {
      return await extractFromImagesViaProvider({
        provider: p.provider,
        apiKey: p.apiKey,
        pumpImage: params.pumpImage,
        odometerImage: params.odometerImage,
      })
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function extractServiceFromDocumentWithFallback(params: {
  providers: ProviderWithKey[]
  images?: Blob[]
  documentText?: string
  vehicles: { id: number; name: string }[]
  extraFieldNamesByRecordType?: Record<string, string[]>
}) {
  const providers = params.providers.filter((p) => p.apiKey.trim())
  if (providers.length === 0) throw new Error('No LLM API keys configured (Settings).')

  let lastErr: unknown
  for (const p of providers) {
    try {
      if (p.provider === 'anthropic') {
        return await extractServiceFromDocumentAnthropic({
          apiKey: p.apiKey,
          images: params.images,
          documentText: params.documentText,
          vehicles: params.vehicles,
          extraFieldNamesByRecordType: params.extraFieldNamesByRecordType,
        })
      }
      return await extractServiceFromDocument({
        apiKey: p.apiKey,
        images: params.images,
        documentText: params.documentText,
        vehicles: params.vehicles,
        extraFieldNamesByRecordType: params.extraFieldNamesByRecordType,
      })
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
