import { ExtractionSchema, parseJsonFromText } from './extraction'
import { ServiceExtractionResultSchema } from './serviceExtraction'

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
}) {
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': params.apiKey,
    },
    body: JSON.stringify({
      model: params.model?.trim() || 'claude-haiku-4-5',
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
}

export async function extractServiceFromDocumentAnthropic(params: {
  apiKey: string
  model?: string
  images?: Blob[]
  documentText?: string
  vehicles: { id: number; name: string }[]
  extraFieldNamesByRecordType?: Record<string, string[]>
}) {
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
    "date": string | null,
    "odometer": number | null,
    "description": string | null,   // VERY concise summary (e.g. "AC repair", "Oil change")
    "totalCost": number | null,
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
 - Cost math (do this when the invoice is itemized and shows subtotal/tax/total):
   - Treat EVERY charge as a line item amount that must be counted: parts, labor, fees, shop supplies, discounts/credits (negative), etc.
   - Assign each line item to exactly one record (based on your logical grouping), then compute each record's pre-tax subtotal by summing its line items (parts + labor + fees).
   - Make sure the SUM of all record pre-tax subtotals matches the invoice SUBTOTAL (pre-tax). If the invoice subtotal doesn't match the sum of itemized lines, mention it in "explanation".
   - If the invoice shows tax amount and/or tax rate, allocate tax across records proportionally by each record's pre-tax subtotal, round to cents, and adjust the final record by any rounding remainder so totals match.
   - Set each record's "totalCost" to (record pre-tax subtotal + allocated tax, if any). Ensure the SUM of all record totalCost values matches the invoice TOTAL as closely as possible.
   - If you cannot confidently allocate costs per record, keep the records but set some totalCost to null and explain the uncertainty in "explanation".
 - If you cannot determine a value, set it to null and briefly explain why in explanation.
`.trim()

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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': params.apiKey,
    },
    body: JSON.stringify({
      model: params.model?.trim() || 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    }),
  })

  const text = (await res.text()).trim()
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${text}`)

  const data = JSON.parse(text) as unknown
  const bodyContent =
    typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).content)
      ? ((data as Record<string, unknown>).content as unknown[])
      : []
  const joined = bodyContent
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
  const parsed = ServiceExtractionResultSchema.safeParse(json)
  if (!parsed.success) throw new Error(`Anthropic response did not match schema: ${joined}`)
  return { ...parsed.data, rawJson: json }
}
