import type { LlmProvider } from './types'
import { extractFromImagesAnthropic } from './anthropic'
import { extractFromImages as extractFromImagesGemini } from './gemini'

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

