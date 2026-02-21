export type LlmProvider = 'gemini' | 'anthropic'

export type AppConfig = {
  baseUrl: string
  lubeLoggerApiKey: string
  cultureInvariant: boolean
  useProxy: boolean
  llm: {
    providerOrder: LlmProvider[]
    geminiApiKey?: string
    anthropicApiKey?: string
  }
}

export type Draft = {
  vehicleId?: number
  date: string // yyyy-mm-dd (for <input type="date">)
  pumpImage?: Blob
  odometerImage?: Blob
  extracted?: {
    odometer: number | null
    fuelQuantity: number | null
    totalCost: number | null
    explanation?: string | null
    rawJson?: unknown
  }
  form?: {
    odometer?: number
    fuelconsumed?: number
    cost?: number
    isfilltofull: boolean
    missedfuelup: boolean
    notes?: string
  }
}

export type Vehicle = {
  id: number
  name: string
  imageLocation?: string
}

export type ServiceLikeRecordType = 'service' | 'repair' | 'upgrade'

export type ExtraFieldValue = {
  name: string
  value: string
}

export type UploadedFileRef = {
  name: string
  location: string
}

export type ServiceExtraction = {
  recordType: ServiceLikeRecordType | null
  vehicleId: number | null
  date: string | null // yyyy-mm-dd for <input type="date">
  odometer: number | null
  description: string | null
  totalCost: number | null
  notes?: string | null
  tags?: string | null
  extraFields?: ExtraFieldValue[] | null
  explanation?: string | null
  rawJson?: unknown
}

export type ServiceDraft = {
  vehicleId?: number
  recordType?: ServiceLikeRecordType
  date: string // yyyy-mm-dd (for <input type="date">)
  document?: { blob: Blob; name: string; type: string; size: number }
  documentText?: string
  documentImages?: Blob[]
  uploadedFiles?: UploadedFileRef[]
  extracted?: ServiceExtraction
  form?: {
    recordType?: ServiceLikeRecordType
    date?: string
    odometer?: number
    description?: string
    cost?: number
    notes?: string
    tags?: string
    extraFields?: ExtraFieldValue[]
  }
}
