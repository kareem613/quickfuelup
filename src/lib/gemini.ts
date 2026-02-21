import { GoogleGenerativeAI } from '@google/generative-ai'
import { ExtractionSchema, parseJsonFromText } from './extraction'
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
1) a gas pump display OR a fuel receipt showing total cost and quantity/volume
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
  images?: Blob[]
  documentText?: string
  vehicles: { id: number; name: string }[]
  extraFieldNamesByRecordType?: Record<string, string[]>
}) {
  const genAI = new GoogleGenerativeAI(params.apiKey)
  const modelNames = [
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ] as const

  const vehiclesText = params.vehicles.map((v) => `- ${v.id}: ${v.name}`).join('\n')
  const extraFieldsText = params.extraFieldNamesByRecordType
    ? Object.entries(params.extraFieldNamesByRecordType)
        .map(([k, names]) => `- ${k}: ${names.length ? names.join(', ') : '(none configured)'}`)
        .join('\n')
    : '(not provided)'

  const prompt = `
You will be given a vehicle service invoice/receipt as text and/or images.

Your job is to create a sensible set of LubeLogger records from this document.
This is NOT necessarily one record per line item: group logically into records that represent one service event/visit.

Return JSON ONLY matching this TypeScript type:
{
  "records": Array<{
    "recordType": "service" | "repair" | "upgrade" | null,
    "vehicleId": number | null,
    "date": string | null,          // yyyy-mm-dd (preferred). If unknown, null.
    "odometer": number | null,      // integer miles/km
    "description": string | null,   // VERY concise summary (e.g. "AC repair", "Oil change")
    "totalCost": number | null,     // best estimate for that record's cost
    "notes"?: string | null,
    "tags"?: string | null,
    "extraFields"?: { "name": string, "value": string }[] | null,
    "explanation"?: string | null
  }>,
  "explanation"?: string | null
}

Available vehicles (pick one vehicleId if confident; otherwise null):
${vehiclesText}

Configured LubeLogger extra fields by record type (prefer these names if they match):
${extraFieldsText}

Document text (may be empty for scanned PDFs):
${params.documentText?.trim() ? params.documentText.trim().slice(0, 12000) : '(none)'}

 Rules:
 - Return only valid JSON (no markdown, no backticks).
 - Use '.' as decimal separator.
 - If you choose a recordType, choose the one that best matches the work (service=scheduled maintenance, repair=unplanned fix, upgrade=enhancement).
 - Create between 1 and 8 records; prefer fewer records unless there are clearly distinct visits/dates/vehicles.
 - Do not produce a record for every part.
 - Keep "description" VERY concise (2-6 words). Put the detailed work performed (parts/labor/steps) in "notes".
   Example: description="AC repair", notes="Evacuated/recharged system; replaced condenser; replaced O-rings; leak test; added dye."
 - If you cannot determine a value, set it to null and briefly explain why in explanation.
`.trim()

  const imageBlobs = (params.images ?? []).slice(0, 3)
  const imageB64s = await Promise.all(imageBlobs.map((b) => blobToBase64(b)))

  let lastErr: unknown
  for (const name of modelNames) {
    try {
      const model = genAI.getGenerativeModel({
        model: name,
        generationConfig: { responseMimeType: 'application/json' },
      })

      const parts: unknown[] = [{ text: prompt }]
      for (let i = 0; i < imageB64s.length; i++) {
        parts.push({
          inlineData: { data: imageB64s[i]!, mimeType: imageBlobs[i]?.type || 'image/jpeg' },
        })
      }

      const result = await model.generateContent(parts as never)
      const text = result.response.text().trim()
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
