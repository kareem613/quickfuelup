import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'

const NullableNumber = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number().nullable()
)

const ExtractionSchema = z.object({
  odometer: NullableNumber,
  fuelQuantity: NullableNumber,
  totalCost: NullableNumber,
  explanation: z.string().nullable().optional(),
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
  const modelNames = [
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ] as const

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

  function parseJsonFromText(text: string): unknown {
    try {
      return JSON.parse(text)
    } catch {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start >= 0 && end > start) {
        const slice = text.slice(start, end + 1)
        return JSON.parse(slice)
      }
      throw new Error(`Gemini did not return JSON: ${text}`)
    }
  }

  let lastErr: unknown
  for (const name of modelNames) {
    try {
      const model = genAI.getGenerativeModel({
        model: name,
        // When supported, this makes the SDK return JSON without extra text.
        generationConfig: { responseMimeType: 'application/json' },
      })
      const result = await model.generateContent([
        { text: prompt },
        { inlineData: { data: pumpB64, mimeType: params.pumpImage.type || 'image/jpeg' } },
        { inlineData: { data: odoB64, mimeType: params.odometerImage.type || 'image/jpeg' } },
      ])

      const text = result.response.text().trim()
      const json = parseJsonFromText(text)
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
