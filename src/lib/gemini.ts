import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'

const ExtractionSchema = z.object({
  odometer: z.number().nullable(),
  fuelQuantity: z.number().nullable(),
  totalCost: z.number().nullable(),
})

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export async function extractFromImages(params: {
  apiKey: string
  pumpImage: Blob
  odometerImage: Blob
}) {
  const genAI = new GoogleGenerativeAI(params.apiKey)
  // Gemini model names vary by account/API version; try a small, explicit fallback list.
  const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash'] as const

  const prompt = `
You will be given two photos:
1) a gas pump display showing total cost and quantity/volume
2) a vehicle odometer display

Extract these fields and return JSON ONLY matching this TypeScript type:
{
  "odometer": number | null,       // integer miles/km from odometer
  "fuelQuantity": number | null,   // numeric quantity (gallons/liters) from pump
  "totalCost": number | null       // numeric total cost from pump
}

Rules:
- Return only valid JSON (no markdown, no backticks).
- Use '.' as decimal separator.
- If you cannot find a value, set it to null.
`.trim()

  const [pumpB64, odoB64] = await Promise.all([
    blobToBase64(params.pumpImage),
    blobToBase64(params.odometerImage),
  ])

  let lastErr: unknown
  for (const name of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: name })
      const result = await model.generateContent([
        { text: prompt },
        { inlineData: { data: pumpB64, mimeType: params.pumpImage.type || 'image/jpeg' } },
        { inlineData: { data: odoB64, mimeType: params.odometerImage.type || 'image/jpeg' } },
      ])

      const text = result.response.text().trim()
      const json = JSON.parse(text) as unknown
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
