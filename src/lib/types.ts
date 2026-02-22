export type LlmProvider = 'gemini' | 'anthropic'

export type ThemePreference = 'system' | 'light' | 'dark'

export type AppConfig = {
  baseUrl: string
  lubeLoggerApiKey: string
  cultureInvariant: boolean
  // When false/undefined, sold vehicles are hidden from pickers.
  showSoldVehicles?: boolean
  uiTheme?: ThemePreference
  // When enabled, show an in-app LLM debug panel during extraction.
  llmDebugEnabled?: boolean
  useProxy: boolean
  llm: {
    providerOrder: LlmProvider[]
    geminiApiKey?: string
    anthropicApiKey?: string
    // Optional per-feature model overrides (blank/undefined = provider defaults).
    geminiModelFuel?: string
    geminiModelService?: string
    anthropicModelFuel?: string
    anthropicModelService?: string
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

export type ServiceRecordExtraction = {
  recordType: ServiceLikeRecordType | null
  vehicleId: number | null
  date: string | null // yyyy-mm-dd for <input type="date">
  odometer: number | null
  description: string | null
  totalCost: number | null
  notes?: string | null
  tags?: string | null
  extraFields?: ExtraFieldValue[] | null
  explanation?: string | null // per-record notes about ambiguity, optional
}

export type ServiceExtractionResult = {
  records: ServiceRecordExtraction[]
  explanation?: string | null // overall grouping notes / caveats
  warnings?: ServiceExtractionWarning[]
  rawJson?: unknown
}

export type ServiceExtractionWarningReason = 'missing' | 'guessed' | 'uncertain' | 'conflict'

export type ServiceExtractionWarning = {
  path: string
  reason: ServiceExtractionWarningReason
  message?: string | null
}

export type ServiceDraftRecord = {
  id: string
  vehicleTouched?: boolean
  recordTypeTouched?: boolean
  validationAttempted?: boolean
  status?: 'pending' | 'submitting' | 'submitted' | 'failed'
  submitError?: string
  extracted?: ServiceRecordExtraction
  form: {
    vehicleId?: number
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

export type ServiceDraft = {
  vehicleId?: number
  date: string // yyyy-mm-dd (for <input type="date">)
  document?: { blob: Blob; name: string; type: string; size: number }
  documentText?: string
  documentImages?: Blob[]
  uploadedFiles?: UploadedFileRef[]
  extracted?: ServiceExtractionResult
  records?: ServiceDraftRecord[]
}
