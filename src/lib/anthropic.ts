import { ExtractionSchema, parseJsonFromText } from './extraction'

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export async function extractFromImagesAnthropic(params: {
  apiKey: string
  pumpImage: Blob
  odometerImage: Blob
}) {
  const prompt = `
You will be given two photos:
1) a gas pump display showing total cost and quantity/volume
2) a vehicle odometer display

Extract these fields and return JSON ONLY matching this TypeScript type:
{
  "odometer": number | null,       // integer miles/km from odometer
  "fuelQuantity": number | null,   // numeric quantity (gallons/liters) from pump
  "totalCost": number | null,      // numeric total cost from pump
  "explanation"?: string | null    // if you cannot determine one or more values, explain why
}

Rules:
- Return only valid JSON (no markdown, no backticks).
- Use '.' as decimal separator.
- If you cannot determine a value, set it to null AND include a short explanation.
- If a value can't be determined from an image, describe what that image appears to be (e.g. blurry dashboard, dark photo, receipt, random object), and end with a mildly sarcastic line like: "It's a photo of <what it looks like> — how do you expect me to read <missing value> from that?"
`.trim()

  const [pumpB64, odoB64] = await Promise.all([
    blobToBase64(params.pumpImage),
    blobToBase64(params.odometerImage),
  ])

  const modelNames = [
    'claude-3-5-haiku-latest',
    'claude-3-5-sonnet-latest',
    'claude-3-haiku-20240307',
  ] as const

  let lastErr: unknown
  for (const model of modelNames) {
    try {
      const res = await fetch('/api/anthropic/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': params.apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
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
        }),
      })

      const text = (await res.text()).trim()
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${text}`)

      const data = JSON.parse(text) as unknown
      const content =
        typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).content)
          ? ((data as Record<string, unknown>).content as unknown[])
          : []
      const joined = content
        .map((c) => {
          if (typeof c !== 'object' || c === null) return null
          const obj = c as Record<string, unknown>
          if (obj.type !== 'text') return null
          return typeof obj.text === 'string' ? obj.text : null
        })
        .filter((t): t is string => Boolean(t))
        .join('\n')
        .trim()

      if (!joined) throw new Error(`Anthropic did not return text: ${text}`)

      const json = parseJsonFromText(joined, 'Anthropic did not return JSON')
      const parsed = ExtractionSchema.safeParse(json)
      if (!parsed.success) throw new Error(`Anthropic response did not match schema: ${joined}`)
      return { ...parsed.data, rawJson: json }
    } catch (e) {
      const msg = String(e)
      if (msg.includes('model') && msg.includes('not') && msg.includes('found')) {
        lastErr = e
        continue
      }
      throw e
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
