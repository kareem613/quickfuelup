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
