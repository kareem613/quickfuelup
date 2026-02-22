import { GoogleGenerativeAI } from '@google/generative-ai'
import { ExtractionSchema, parseJsonFromText } from './extraction'
import type { LlmDebugEvent } from './llmDebug'
import { safeStringify, toPlainJson } from './llmDebug'
import { buildFuelPrompt, buildServicePrompt } from './prompts'
import { ServiceExtractionResultSchema } from './serviceExtraction'

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export async function extractFromImages(params: {
  apiKey: string
  model?: string
  pumpImage: Blob
  odometerImage: Blob
  onDebugEvent?: (event: LlmDebugEvent) => void
}) {
  const genAI = new GoogleGenerativeAI(params.apiKey)
  // Gemini model names vary by account/API version; try a small, explicit fallback list.
  const modelNames = [
    ...(params.model?.trim() ? [params.model.trim()] : []),
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ]

  const prompt = buildFuelPrompt()

  const [pumpB64, odoB64] = await Promise.all([
    blobToBase64(params.pumpImage),
    blobToBase64(params.odometerImage),
  ])

  let lastErr: unknown
  for (const name of modelNames) {
    try {
      const model = genAI.getGenerativeModel({
        model: name,
        // When supported, this makes the SDK return JSON without extra text.
        generationConfig: { responseMimeType: 'application/json' },
      })

      const requestParts = [
        { text: prompt },
        { inlineData: { data: pumpB64, mimeType: params.pumpImage.type || 'image/jpeg' } },
        { inlineData: { data: odoB64, mimeType: params.odometerImage.type || 'image/jpeg' } },
      ]

      params.onDebugEvent?.({
        type: 'request',
        provider: 'gemini',
        payload: {
          prompt,
        },
      })

      let text = ''
      if (params.onDebugEvent) {
        const streamed = await model.generateContentStream(requestParts as never)
        let answer = ''
        for await (const chunk of streamed.stream) {
          params.onDebugEvent?.({ type: 'chunk', provider: 'gemini', chunk: safeStringify(toPlainJson(chunk), 0) })
          const c0 = (chunk as unknown as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates?.[0]
          const chunkParts = c0?.content?.parts ?? []
          for (const p of chunkParts) {
            if (typeof p !== 'object' || p === null) continue
            const obj = p as Record<string, unknown>
            if (typeof obj.text !== 'string' || !obj.text) continue
            answer += obj.text
          }
        }
        text = answer.trim()
        try {
          const resp = await streamed.response
          params.onDebugEvent?.({ type: 'response', provider: 'gemini', payload: toPlainJson(resp) })
        } catch {
          // ignore
        }
      } else {
        const result = await model.generateContent(requestParts as never)
        text = result.response.text().trim()
      }

      const json = parseJsonFromText(text, 'Gemini did not return JSON')
      const parsed = ExtractionSchema.safeParse(json)
      if (!parsed.success) throw new Error(`Gemini response did not match schema: ${text}`)
      return { ...parsed.data, rawJson: json }
    } catch (e) {
      const msg = String(e)
      // Only fall back for explicit "model not found/unsupported" errors.
      if (msg.includes('404') && (msg.includes('not found') || msg.includes('not supported'))) {
        lastErr = e
        continue
      }
      throw e
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function extractServiceFromDocument(params: {
  apiKey: string
  model?: string
  images?: Blob[]
  documentText?: string
  vehicles: { id: number; name: string }[]
  extraFieldNamesByRecordType?: Record<string, string[]>
  onThinking?: (message: string) => void
  onDebugEvent?: (event: LlmDebugEvent) => void
}) {
  const genAI = new GoogleGenerativeAI(params.apiKey)
  const modelNames = [
    ...(params.model?.trim() ? [params.model.trim()] : []),
    // Prefer a stronger model for service invoice reasoning.
    // Docs: https://ai.google.dev/gemini-api/docs/models/gemini
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    // Older fallbacks for accounts without 2.5 access.
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ]

  const vehiclesText = params.vehicles.map((v) => `- ${v.id}: ${v.name}`).join('\n')
  const extraFieldsText = params.extraFieldNamesByRecordType
    ? Object.entries(params.extraFieldNamesByRecordType)
        .map(([k, names]) => `- ${k}: ${names.length ? names.join(', ') : '(none configured)'}`)
        .join('\n')
    : '(not provided)'

  const { prompt, debugPrompt } = buildServicePrompt({
    vehiclesText,
    extraFieldsText,
    documentText: params.documentText,
  })

  const imageBlobs = (params.images ?? []).slice(0, 3)
  const imageB64s = await Promise.all(imageBlobs.map((b) => blobToBase64(b)))

  let lastErr: unknown
  for (const name of modelNames) {
    try {
      const model = genAI.getGenerativeModel({
        model: name,
        generationConfig: (params.onThinking
          ? // Thought summaries (Gemini thinking docs): parts with { thought: true }.
            ({ thinkingConfig: { includeThoughts: true } } as unknown)
          : { responseMimeType: 'application/json' }) as never,
      })

      const parts: unknown[] = [{ text: prompt }]
      for (let i = 0; i < imageB64s.length; i++) {
        parts.push({
          inlineData: { data: imageB64s[i]!, mimeType: imageBlobs[i]?.type || 'image/jpeg' },
        })
      }

      params.onDebugEvent?.({
        type: 'request',
        provider: 'gemini',
        payload: {
          prompt: debugPrompt,
        },
      })

      let text = ''
      if (params.onThinking || params.onDebugEvent) {
        const streamed = await model.generateContentStream(parts as never)
        let answer = ''
        let lastThoughtSent = ''

        function summarizeThoughtLine(raw: string) {
          const firstLine = raw
            .split('\n')
            .map((l) => l.trim())
            .find((l) => Boolean(l))
          if (!firstLine) return null
          const heading = firstLine.match(/^\*\*([^*].*?)\*\*$/)
          if (heading) return heading[1]?.trim() || null
          // If it looks like an incomplete heading, wait for more.
          if (firstLine.startsWith('**') && !firstLine.endsWith('**')) return null
          return firstLine
        }

        for await (const chunk of streamed.stream) {
          if (params.onDebugEvent) {
            params.onDebugEvent({ type: 'chunk', provider: 'gemini', chunk: safeStringify(toPlainJson(chunk), 0) })
          }
          const c0 = (chunk as unknown as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates?.[0]
          const chunkParts = c0?.content?.parts ?? []
          for (const p of chunkParts) {
            if (typeof p !== 'object' || p === null) continue
            const obj = p as Record<string, unknown>
            if (typeof obj.text !== 'string' || !obj.text) continue
            if (obj.thought === true) {
              // Thought summaries come as distinct "thought" parts; show only a single headline line.
              const line = summarizeThoughtLine(obj.text)
              if (line && line !== lastThoughtSent) {
                lastThoughtSent = line
                params.onThinking?.(line)
              }
            } else {
              answer += obj.text
            }
          }
        }
        text = answer.trim()
        if (params.onDebugEvent) {
          try {
            const resp = await streamed.response
            params.onDebugEvent({ type: 'response', provider: 'gemini', payload: toPlainJson(resp) })
          } catch {
            // ignore
          }
        }
      } else {
        const result = await model.generateContent(parts as never)
        text = result.response.text().trim()
      }

      const json = parseJsonFromText(text, 'Gemini did not return JSON')
      const parsed = ServiceExtractionResultSchema.safeParse(json)
      if (!parsed.success) throw new Error(`Gemini response did not match schema: ${text}`)
      return { ...parsed.data, rawJson: json }
    } catch (e) {
      const msg = String(e)
      if (msg.includes('404') && (msg.includes('not found') || msg.includes('not supported'))) {
        lastErr = e
        continue
      }
      throw e
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
