import { ExtractionSchema, parseJsonFromText } from './extraction'
import { ServiceExtractionResultSchema } from './serviceExtraction'
import type { LlmDebugEvent } from './llmDebug'
import { buildFuelPrompt, buildServicePrompt } from './prompts'

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export async function extractFromImagesAnthropic(params: {
  apiKey: string
  model?: string
  pumpImage: Blob
  odometerImage: Blob
  onDebugEvent?: (event: LlmDebugEvent) => void
}) {
  const prompt = buildFuelPrompt()

  const [pumpB64, odoB64] = await Promise.all([
    blobToBase64(params.pumpImage),
    blobToBase64(params.odometerImage),
  ])

  const body = {
    model: params.model?.trim() || 'claude-haiku-4-5',
    max_tokens: 300,
    ...(params.onDebugEvent ? { stream: true } : null),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: params.pumpImage.type || 'image/jpeg',
              data: pumpB64,
            },
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: params.odometerImage.type || 'image/jpeg',
              data: odoB64,
            },
          },
        ],
      },
    ],
  }

  params.onDebugEvent?.({
    type: 'request',
    provider: 'anthropic',
    payload: { prompt },
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': params.apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = (await res.text()).trim()
    throw new Error(`Anthropic HTTP ${res.status}: ${text}`)
  }

  let joined = ''
  if (params.onDebugEvent) {
    if (!res.body) throw new Error('Anthropic stream body missing.')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let textAcc = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      while (true) {
        const sep = buf.indexOf('\n\n')
        if (sep === -1) break
        const rawEvent = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        const dataLines = rawEvent
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice('data:'.length).trim())
          .filter(Boolean)
        if (!dataLines.length) continue

        for (const dataStr of dataLines) {
          if (dataStr === '[DONE]') continue
          params.onDebugEvent({ type: 'chunk', provider: 'anthropic', chunk: `data: ${dataStr}` })
          let evt: unknown
          try {
            evt = JSON.parse(dataStr)
          } catch {
            continue
          }
          if (typeof evt !== 'object' || evt === null) continue
          const obj = evt as Record<string, unknown>
          if (obj.type === 'content_block_delta') {
            const delta = typeof obj.delta === 'object' && obj.delta !== null ? (obj.delta as Record<string, unknown>) : null
            const textDelta = delta && typeof delta.text === 'string' ? delta.text : ''
            if (textDelta) textAcc += textDelta
          }
        }
      }
    }
    joined = textAcc.trim()
    params.onDebugEvent({ type: 'response', provider: 'anthropic', payload: { text: joined } })
  } else {
    const text = (await res.text()).trim()
    const data = JSON.parse(text) as unknown
    const content =
      typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).content)
        ? ((data as Record<string, unknown>).content as unknown[])
        : []
    joined = content
      .map((c) => {
        if (typeof c !== 'object' || c === null) return null
        const obj = c as Record<string, unknown>
        if (obj.type !== 'text') return null
        return typeof obj.text === 'string' ? obj.text : null
      })
      .filter((t): t is string => Boolean(t))
      .join('\n')
      .trim()
  }

  if (!joined) throw new Error('Anthropic did not return text.')

  const json = parseJsonFromText(joined, 'Anthropic did not return JSON')
  const parsed = ExtractionSchema.safeParse(json)
  if (!parsed.success) throw new Error(`Anthropic response did not match schema: ${joined}`)
  return { ...parsed.data, rawJson: json }
}

export async function extractServiceFromDocumentAnthropic(params: {
  apiKey: string
  model?: string
  images?: Blob[]
  documentText?: string
  vehicles: { id: number; name: string }[]
  extraFieldNamesByRecordType?: Record<string, string[]>
  onThinking?: (message: string) => void
  onDebugEvent?: (event: LlmDebugEvent) => void
}) {
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

  const content: unknown[] = [{ type: 'text', text: prompt }]
  for (let i = 0; i < imageB64s.length; i++) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageBlobs[i]?.type || 'image/jpeg',
        data: imageB64s[i]!,
      },
    })
  }

  const body = {
    model: params.model?.trim() || 'claude-haiku-4-5',
    // When extended thinking is enabled, max_tokens must be > thinking.budget_tokens.
    max_tokens: 2048,
    ...(params.onThinking || params.onDebugEvent
      ? {
          stream: true,
          // Extended thinking: stream only the thinking block to the UI.
          ...(params.onThinking ? { thinking: { type: 'enabled', budget_tokens: 1024 } } : null),
        }
      : null),
    messages: [{ role: 'user', content }],
  }

  params.onDebugEvent?.({
    type: 'request',
    provider: 'anthropic',
    payload: { prompt: debugPrompt },
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': params.apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = (await res.text()).trim()
    throw new Error(`Anthropic HTTP ${res.status}: ${text}`)
  }

  let joined = ''
  if (params.onThinking || params.onDebugEvent) {
    if (!res.body) throw new Error('Anthropic stream body missing.')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const blockTypeByIndex = new Map<number, string>()
    let thinkingAcc = ''
    let textAcc = ''
    let lastThinkingSent = ''

    function summarizeThinkingLine(paragraphRaw: string) {
      const paragraph = paragraphRaw.trim()
      if (!paragraph) return null
      const lines = paragraph
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (!lines.length) return null
      const firstLine = lines[0] ?? ''
      const heading = firstLine.match(/^\*\*([^*].*?)\*\*$/)
      if (heading) return heading[1]?.trim() || null
      if (firstLine.startsWith('**') && !firstLine.endsWith('**')) return null
      // If we haven't seen the newline that terminates the first line yet, avoid showing partial words.
      if (!paragraph.includes('\n') && !/[.!?:]$/.test(firstLine)) return null
      return firstLine
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      while (true) {
        const sep = buf.indexOf('\n\n')
        if (sep === -1) break
        const rawEvent = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        const dataLines = rawEvent
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice('data:'.length).trim())
          .filter(Boolean)
        if (!dataLines.length) continue

        for (const dataStr of dataLines) {
          if (dataStr === '[DONE]') continue
          if (params.onDebugEvent) params.onDebugEvent({ type: 'chunk', provider: 'anthropic', chunk: `data: ${dataStr}` })
          let evt: unknown
          try {
            evt = JSON.parse(dataStr)
          } catch {
            continue
          }
          if (typeof evt !== 'object' || evt === null) continue
          const obj = evt as Record<string, unknown>
          const evtType = typeof obj.type === 'string' ? obj.type : null

          if (evtType === 'content_block_start') {
            const index = typeof obj.index === 'number' ? obj.index : null
            const block = typeof obj.content_block === 'object' && obj.content_block !== null ? obj.content_block : null
            const blockType =
              block && typeof (block as Record<string, unknown>).type === 'string'
                ? String((block as Record<string, unknown>).type)
                : null
            if (typeof index === 'number' && blockType) blockTypeByIndex.set(index, blockType)
          }

          if (evtType === 'content_block_delta') {
            const index = typeof obj.index === 'number' ? obj.index : null
            const delta = typeof obj.delta === 'object' && obj.delta !== null ? (obj.delta as Record<string, unknown>) : null
            if (typeof index !== 'number' || !delta) continue

            const deltaType = typeof delta.type === 'string' ? delta.type : null
            const blockType = blockTypeByIndex.get(index) ?? null

            const thinkingDelta = typeof delta.thinking === 'string' ? delta.thinking : ''
            const textDelta = typeof delta.text === 'string' ? delta.text : ''

            if ((deltaType === 'thinking_delta' || blockType === 'thinking') && thinkingDelta) {
              thinkingAcc += thinkingDelta
              // Streaming thinking is a growing buffer; show only the latest paragraph's headline line.
              const nextParagraph = thinkingAcc
                .split(/\n{2,}/)
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(-1)[0]
              const nextThinking = nextParagraph ? summarizeThinkingLine(nextParagraph) : null
              if (nextThinking && nextThinking !== lastThinkingSent) {
                lastThinkingSent = nextThinking
                params.onThinking?.(nextThinking)
              }
            } else if ((deltaType === 'text_delta' || blockType === 'text') && textDelta) {
              textAcc += textDelta
            }
          }
        }
      }
    }
    joined = textAcc.trim()
    if (params.onDebugEvent) params.onDebugEvent({ type: 'response', provider: 'anthropic', payload: { text: joined } })
  } else {
    const text = (await res.text()).trim()
    const data = JSON.parse(text) as unknown
    const bodyContent =
      typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).content)
        ? ((data as Record<string, unknown>).content as unknown[])
        : []
    joined = bodyContent
      .map((c) => {
        if (typeof c !== 'object' || c === null) return null
        const obj = c as Record<string, unknown>
        if (obj.type !== 'text') return null
        return typeof obj.text === 'string' ? obj.text : null
      })
      .filter((t): t is string => Boolean(t))
      .join('\n')
      .trim()
  }

  if (!joined) throw new Error('Anthropic did not return text.')

  const json = parseJsonFromText(joined, 'Anthropic did not return JSON')
  const parsed = ServiceExtractionResultSchema.safeParse(json)
  if (!parsed.success) throw new Error(`Anthropic response did not match schema: ${joined}`)
  return { ...parsed.data, rawJson: json }
}
