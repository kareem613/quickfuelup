import { z } from 'zod'

export const NullableNumber = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().nullable())

export const ExtractionSchema = z.object({
  odometer: NullableNumber,
  fuelQuantity: NullableNumber,
  totalCost: NullableNumber,
  explanation: z.string().nullable().optional(),
})

export type Extraction = z.infer<typeof ExtractionSchema> & { rawJson?: unknown }

export function parseJsonFromText(text: string, errPrefix: string) {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1)
      return JSON.parse(slice)
    }
    throw new Error(`${errPrefix}: ${text}`)
  }
}

