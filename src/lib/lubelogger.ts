import type { AppConfig, Vehicle } from './types'

function withBaseUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}

function buildHeaders(cfg: AppConfig): HeadersInit {
  const headers: Record<string, string> = {
    'x-api-key': cfg.lubeLoggerApiKey,
  }
  if (cfg.cultureInvariant) headers['culture-invariant'] = '1'
  return headers
}

export async function whoAmI(cfg: AppConfig) {
  const res = await fetch(withBaseUrl(cfg.baseUrl, '/api/whoami'), {
    headers: buildHeaders(cfg),
  })
  if (!res.ok) throw new Error(`whoami failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function getVehicles(cfg: AppConfig): Promise<Vehicle[]> {
  const res = await fetch(withBaseUrl(cfg.baseUrl, '/api/vehicles'), {
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
      const name = String(obj.name ?? obj.description ?? `Vehicle ${id}`)
      return { id, name }
    })
    .filter((v): v is Vehicle => v !== null)
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
  const url = new URL(withBaseUrl(cfg.baseUrl, '/api/vehicle/gasrecords/add'))
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
