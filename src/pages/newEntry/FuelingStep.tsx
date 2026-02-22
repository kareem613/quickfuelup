import type { ReactNode } from 'react'
import { Card } from '../../components/ui/Card'

export function FuelingStep(props: {
  canEditDetails: boolean
  extractBusy: boolean
  canExtract: boolean
  submitBusy: boolean
  extractFailed: boolean
  extractLlmMessage: string | null
  hasLlmResponse: boolean
  submitAttempted: boolean
  odometerInvalid: boolean
  fuelQuantityInvalid: boolean
  totalCostInvalid: boolean
  odometer: string
  fuelQuantity: string
  totalCost: string
  onRetry: () => void
  onOdometerChange: (value: string) => void
  onFuelQuantityChange: (value: string) => void
  onTotalCostChange: (value: string) => void
  refreshIcon: ReactNode
}) {
  const showRetry = props.hasLlmResponse && !props.extractBusy
  return (
    <Card extracting={props.extractBusy} style={{ opacity: props.canEditDetails ? 1 : 0.6 }}>
      <div className="row">
        <strong>4) Fueling</strong>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          {showRetry ? (
            <button
              className="icon-btn"
              disabled={!props.canExtract || props.extractBusy || props.submitBusy}
              onClick={props.onRetry}
              type="button"
              aria-label="Retry extraction"
              title="Retry"
            >
              {props.refreshIcon}
            </button>
          ) : null}
        </div>
      </div>

      {props.extractFailed ? (
        <div className="error">
          <div>Failed to extract values. Enter manually or try again.</div>
          {props.extractLlmMessage ? (
            <div className="muted" style={{ marginTop: 6 }}>
              {props.extractLlmMessage.length > 500 ? `${props.extractLlmMessage.slice(0, 500)}…` : props.extractLlmMessage}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`field${props.submitAttempted && props.odometerInvalid ? ' invalid' : ''}`}>
        <label>Odometer</label>
        <input
          inputMode="numeric"
          value={props.odometer}
          onChange={(e) => props.onOdometerChange(e.target.value)}
          disabled={!props.canEditDetails || props.submitBusy}
        />
      </div>

      <div className="grid two no-collapse">
        <div className={`field${props.submitAttempted && props.fuelQuantityInvalid ? ' invalid' : ''}`}>
          <label>Fuel quantity</label>
          <input
            inputMode="decimal"
            value={props.fuelQuantity}
            onChange={(e) => props.onFuelQuantityChange(e.target.value)}
            disabled={!props.canEditDetails || props.submitBusy}
          />
        </div>
        <div className={`field${props.submitAttempted && props.totalCostInvalid ? ' invalid' : ''}`}>
          <label>Total cost</label>
          <input
            inputMode="decimal"
            value={props.totalCost}
            onChange={(e) => props.onTotalCostChange(e.target.value)}
            disabled={!props.canEditDetails || props.submitBusy}
          />
        </div>
      </div>
    </Card>
  )
}
