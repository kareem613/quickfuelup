import type { LlmProvider } from './types'
import { extractFromImagesAnthropic, extractServiceFromDocumentAnthropic } from './anthropic'
import { extractFromImages as extractFromImagesGemini, extractServiceFromDocument } from './gemini'
import type { LlmDebugEvent } from './llmDebug'
import { ServiceExtractionResultSchema } from './serviceExtraction'

export type ProviderWithKey = { provider: LlmProvider; apiKey: string; model?: string }

export async function extractFromImagesViaProvider(params: {
  provider: LlmProvider
  apiKey: string
  model?: string
  pumpImage: Blob
  odometerImage: Blob
  onDebugEvent?: (event: LlmDebugEvent) => void
}) {
  if (params.provider === 'anthropic') {
    return extractFromImagesAnthropic({
      apiKey: params.apiKey,
      model: params.model,
      pumpImage: params.pumpImage,
      odometerImage: params.odometerImage,
      onDebugEvent: params.onDebugEvent,
    })
  }
  return extractFromImagesGemini({
    apiKey: params.apiKey,
    model: params.model,
    pumpImage: params.pumpImage,
    odometerImage: params.odometerImage,
    onDebugEvent: params.onDebugEvent,
  })
}

export async function extractFromImagesWithFallback(params: {
  providers: ProviderWithKey[]
  pumpImage: Blob
  odometerImage: Blob
  onDebugEvent?: (event: LlmDebugEvent) => void
}) {
  const providers = params.providers.filter((p) => p.apiKey.trim())
  if (providers.length === 0) throw new Error('No LLM API keys configured (Settings).')

  let lastErr: unknown
  for (const p of providers) {
    try {
      return await extractFromImagesViaProvider({
        provider: p.provider,
        apiKey: p.apiKey,
        model: p.model,
        pumpImage: params.pumpImage,
        odometerImage: params.odometerImage,
        onDebugEvent: params.onDebugEvent,
      })
    } catch (e) {
      params.onDebugEvent?.({
        type: 'error',
        provider: p.provider,
        error: e instanceof Error ? e.message : String(e),
      })
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
  onThinking?: (message: string) => void
  onDebugEvent?: (event: LlmDebugEvent) => void
}) {
  const providers = params.providers.filter((p) => p.apiKey.trim())
  if (providers.length === 0) throw new Error('No LLM API keys configured (Settings).')

  let lastErr: unknown
  for (const p of providers) {
    try {
      if (p.provider === 'anthropic') {
        const onThinking = params.onThinking ? (m: string) => params.onThinking?.(`Anthropic: ${m}`) : undefined
        const extracted = await extractServiceFromDocumentAnthropic({
          apiKey: p.apiKey,
          model: p.model,
          images: params.images,
          documentText: params.documentText,
          vehicles: params.vehicles,
          extraFieldNamesByRecordType: params.extraFieldNamesByRecordType,
          onThinking,
          onDebugEvent: params.onDebugEvent,
        })
        const parsed = ServiceExtractionResultSchema.safeParse(extracted)
        if (!parsed.success) throw new Error(`Anthropic response did not match schema: ${JSON.stringify(extracted)}`)
        return extracted
      }
      const onThinking = params.onThinking ? (m: string) => params.onThinking?.(`Gemini: ${m}`) : undefined
      const extracted = await extractServiceFromDocument({
        apiKey: p.apiKey,
        model: p.model,
        images: params.images,
        documentText: params.documentText,
        vehicles: params.vehicles,
        extraFieldNamesByRecordType: params.extraFieldNamesByRecordType,
        onThinking,
        onDebugEvent: params.onDebugEvent,
      })
      const parsed = ServiceExtractionResultSchema.safeParse(extracted)
      if (!parsed.success) throw new Error(`Gemini response did not match schema: ${JSON.stringify(extracted)}`)
      return extracted
    } catch (e) {
      params.onDebugEvent?.({
        type: 'error',
        provider: p.provider,
        error: e instanceof Error ? e.message : String(e),
      })
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
