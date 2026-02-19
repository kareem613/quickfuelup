export type AppConfig = {
  baseUrl: string
  lubeLoggerApiKey: string
  geminiApiKey: string
  cultureInvariant: boolean
  useProxy: boolean
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
}
