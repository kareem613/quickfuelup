import type { AppConfig, Vehicle } from './types'

function withBaseUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}

function apiUrl(cfg: AppConfig, path: string) {
  return withBaseUrl(cfg.baseUrl, `/api${path}`)
}

function buildHeaders(cfg: AppConfig): HeadersInit {
  const headers: Record<string, string> = {
    'x-api-key': cfg.lubeLoggerApiKey,
  }
  if (cfg.cultureInvariant) headers['culture-invariant'] = '1'
  return headers
}

export async function whoAmI(cfg: AppConfig) {
  const res = await fetch(apiUrl(cfg, '/whoami'), {
    headers: buildHeaders(cfg),
  })
  if (!res.ok) throw new Error(`whoami failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function getVehicles(cfg: AppConfig): Promise<Vehicle[]> {
  const res = await fetch(apiUrl(cfg, '/vehicles'), {
    headers: buildHeaders(cfg),
  })
  if (!res.ok) throw new Error(`vehicles failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as unknown

  if (!Array.isArray(data)) return []

  return data
    .map((v): Vehicle | null => {
      if (typeof v !== 'object' || v === null) return null
      const obj = v as Record<string, unknown>
      const id = Number(obj.id)
      if (!Number.isFinite(id)) return null
      const byName = obj.name ?? obj.description
      const year = typeof obj.year === 'number' ? obj.year : Number(obj.year)
      const make = typeof obj.make === 'string' ? obj.make : undefined
      const model = typeof obj.model === 'string' ? obj.model : undefined
      const baseLabel = [Number.isFinite(year) ? String(year) : null, make ?? null, model ?? null]
        .filter(Boolean)
        .join(' ')

      const derived = baseLabel || null

      const name = String(byName ?? derived ?? `Vehicle ${id}`)
      const imageLocation = typeof obj.imageLocation === 'string' ? obj.imageLocation : undefined
      return { id, name, imageLocation }
    })
    .filter((v): v is Vehicle => v !== null)
}

export type ExtraFieldExportModel = {
  name: string
  isRequired?: boolean | string
  fieldType?: string
}

export type RecordExtraFieldExportModel = {
  recordType: string
  extraFields: ExtraFieldExportModel[]
}

export async function getExtraFields(cfg: AppConfig): Promise<RecordExtraFieldExportModel[]> {
  const res = await fetch(apiUrl(cfg, '/extrafields'), {
    headers: buildHeaders(cfg),
  })
  if (!res.ok) throw new Error(`extrafields failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as unknown
  if (!Array.isArray(data)) return []
  return data
    .map((r): RecordExtraFieldExportModel | null => {
      if (typeof r !== 'object' || r === null) return null
      const obj = r as Record<string, unknown>
      const recordType = typeof obj.recordType === 'string' ? obj.recordType : typeof obj.RecordType === 'string' ? obj.RecordType : null
      if (!recordType) return null
      const extraFieldsRaw = Array.isArray(obj.extraFields) ? obj.extraFields : Array.isArray(obj.ExtraFields) ? obj.ExtraFields : []
      const extraFields = extraFieldsRaw
        .map((ef): ExtraFieldExportModel | null => {
          if (typeof ef !== 'object' || ef === null) return null
          const efo = ef as Record<string, unknown>
          const name = typeof efo.name === 'string' ? efo.name : typeof efo.Name === 'string' ? efo.Name : null
          if (!name) return null
          const isRequiredRaw = efo.isRequired ?? efo.IsRequired
          const isRequired =
            typeof isRequiredRaw === 'boolean' || typeof isRequiredRaw === 'string' ? (isRequiredRaw as boolean | string) : undefined
          const fieldType = typeof efo.fieldType === 'string' ? efo.fieldType : typeof efo.FieldType === 'string' ? efo.FieldType : undefined
          return { name, isRequired, fieldType }
        })
        .filter((x): x is ExtraFieldExportModel => x !== null)
      return { recordType, extraFields }
    })
    .filter((x): x is RecordExtraFieldExportModel => x !== null)
}

export type AddGasRecordInput = {
  vehicleId: number
  dateMMDDYYYY: string
  odometer: number
  fuelconsumed: number
  cost: number
  isfilltofull: boolean
  missedfuelup: boolean
  notes?: string
}

export async function addGasRecord(cfg: AppConfig, input: AddGasRecordInput) {
  const url = new URL(apiUrl(cfg, '/vehicle/gasrecords/add'), window.location.origin)
  url.searchParams.set('vehicleId', String(input.vehicleId))

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...buildHeaders(cfg),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      date: input.dateMMDDYYYY,
      odometer: input.odometer,
      fuelconsumed: input.fuelconsumed,
      isfilltofull: input.isfilltofull,
      missedfuelup: input.missedfuelup,
      cost: input.cost,
      ...(input.notes ? { notes: input.notes } : null),
    }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`add gas record failed: ${res.status} ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export type UploadedFileRef = { name: string; location: string }

export async function uploadDocuments(cfg: AppConfig, documents: File[]): Promise<UploadedFileRef[]> {
  const form = new FormData()
  for (const f of documents) form.append('documents', f, f.name)

  const res = await fetch(apiUrl(cfg, '/documents/upload'), {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: form,
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`documents upload failed: ${res.status} ${text}`)

  const parsed = JSON.parse(text) as unknown
  if (!Array.isArray(parsed)) throw new Error(`documents upload did not return a list: ${text}`)
  return parsed
    .map((x): UploadedFileRef | null => {
      if (typeof x !== 'object' || x === null) return null
      const obj = x as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name : typeof obj.Name === 'string' ? obj.Name : null
      const location = typeof obj.location === 'string' ? obj.location : typeof obj.Location === 'string' ? obj.Location : null
      if (!name || !location) return null
      return { name, location }
    })
    .filter((x): x is UploadedFileRef => x !== null)
}

export type ServiceLikeRecordType = 'service' | 'repair' | 'upgrade'
export type ExtraFieldValue = { name: string; value: string }

export type AddServiceLikeRecordInput = {
  recordType: ServiceLikeRecordType
  vehicleId: number
  dateMMDDYYYY: string
  odometer: number
  description: string
  cost: number
  notes?: string
  tags?: string
  extraFields?: ExtraFieldValue[]
  files?: UploadedFileRef[]
}

export async function addServiceLikeRecord(cfg: AppConfig, input: AddServiceLikeRecordInput) {
  const segment = input.recordType === 'repair' ? 'repairrecords' : input.recordType === 'upgrade' ? 'upgraderecords' : 'servicerecords'
  const url = new URL(apiUrl(cfg, `/vehicle/${segment}/add`), window.location.origin)
  url.searchParams.set('vehicleId', String(input.vehicleId))

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...buildHeaders(cfg),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      date: input.dateMMDDYYYY,
      odometer: input.odometer,
      description: input.description,
      cost: input.cost,
      ...(input.notes ? { notes: input.notes } : null),
      ...(input.tags ? { tags: input.tags } : null),
      ...(input.extraFields?.length ? { extraFields: input.extraFields } : null),
      ...(input.files?.length ? { files: input.files } : null),
    }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`add ${segment} failed: ${res.status} ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
