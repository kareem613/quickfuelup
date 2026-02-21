import type { ReactNode } from 'react'

export function DetailsStep(props: {
  canEditDetails: boolean
  submitBusy: boolean
  extractBusy: boolean
  imageBusy: boolean
  date: string
  isFillToFull: boolean
  missedFuelUp: boolean
  notes: string
  submitAttempted: boolean
  canSubmit: boolean
  submitValidationMessage: string | null
  onDateChange: (date: string) => void
  onFillToFullChange: (v: boolean) => void
  onMissedFuelUpChange: (v: boolean) => void
  onNotesChange: (v: string) => void
  onSubmit: () => void
  onStartOver: () => void
  submitLabel: string
  primaryButton: ReactNode
}) {
  return (
    <div className="card stack" style={{ opacity: props.canEditDetails ? 1 : 0.6 }}>
      <div className="row">
        <strong>5) Details</strong>
        <span className="muted">{props.date}</span>
      </div>

      <div className="field">
        <label>Date</label>
        <input type="date" value={props.date} onChange={(e) => props.onDateChange(e.target.value)} disabled={props.submitBusy} />
      </div>

      <div className="row" style={{ justifyContent: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <label className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(props.isFillToFull)}
            onChange={(e) => props.onFillToFullChange(e.target.checked)}
            disabled={!props.canEditDetails || props.submitBusy}
          />
          <span>Fill to full</span>
        </label>

        <label className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(props.missedFuelUp)}
            onChange={(e) => props.onMissedFuelUpChange(e.target.checked)}
            disabled={!props.canEditDetails || props.submitBusy}
          />
          <span>Missed fuel-up</span>
        </label>
      </div>

      <div className="field">
        <label>Notes (optional)</label>
        <textarea rows={2} value={props.notes} onChange={(e) => props.onNotesChange(e.target.value)} disabled={!props.canEditDetails || props.submitBusy} />
      </div>

      {props.submitAttempted && !props.canSubmit && props.submitValidationMessage ? (
        <div className="error">{props.submitValidationMessage}</div>
      ) : null}

      <div className="actions">
        {props.primaryButton}
        <button className="btn" disabled={props.submitBusy || props.extractBusy || props.imageBusy} onClick={props.onStartOver} type="button">
          Start over
        </button>
      </div>
    </div>
  )
}

