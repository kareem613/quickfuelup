import type { LlmProvider } from './types'
import { extractFromImagesAnthropic } from './anthropic'
import { extractFromImages as extractFromImagesGemini } from './gemini'

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
