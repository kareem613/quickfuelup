import { z } from 'zod'
import { NullableNumber } from './extraction'

const RecordTypeSchema = z.enum(['service', 'repair', 'upgrade']).nullable()

const NullableTrimmedString = z.preprocess((v) => {
  if (v === '' || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  return v
}, z.string().nullable())

export const ExtraFieldValueSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
})

export const ServiceExtractionSchema = z.object({
  recordType: RecordTypeSchema,
  vehicleId: NullableNumber,
  date: NullableTrimmedString, // prefer yyyy-mm-dd, but we'll accept any string and normalize in UI
  odometer: NullableNumber,
  description: NullableTrimmedString,
  totalCost: NullableNumber,
  notes: NullableTrimmedString.optional(),
  tags: NullableTrimmedString.optional(),
  extraFields: z.array(ExtraFieldValueSchema).nullable().optional(),
  explanation: NullableTrimmedString.optional(),
})

export type ServiceExtraction = z.infer<typeof ServiceExtractionSchema> & { rawJson?: unknown }

