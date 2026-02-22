import type { ReactNode } from 'react'

export function ExtractStep(props: {
  step1Done: boolean
  stepDone: boolean
  open: boolean
  extracting: boolean
  canExtractAny: boolean
  submitBusy: boolean
  extractFailed: boolean
  extractMessage: string | null
  keepOpen: boolean
  onToggle: () => void
  onRetry: () => void
  doneIcon: ReactNode
  refreshIcon: ReactNode
}) {
  const statusText =
    !props.step1Done || props.extractMessage
      ? null
      : props.extracting
        ? 'Extracting records. This can take a minute.'
        : !props.stepDone
          ? 'Starting…'
          : null

  return (
    <div
      className={`card stack${props.extracting ? ' extracting' : ''}${props.stepDone && !props.open ? ' collapsed' : ''}`}
      style={{ opacity: props.step1Done ? 1 : 0.6 }}
    >
      <button className="row card-header-btn" type="button" onClick={props.onToggle}>
        <strong>2) Extract</strong>
        {props.stepDone ? props.doneIcon : <span className="muted">Required</span>}
      </button>

      {props.stepDone && !props.open ? null : !props.step1Done ? (
        <div className="muted">Upload an invoice to start extraction.</div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {statusText ? <div className="muted">{statusText}</div> : <span />}
            <button
              className="btn small"
              disabled={!props.canExtractAny || props.extracting || props.submitBusy}
              onClick={props.onRetry}
              type="button"
              aria-label="Retry extraction"
              title="Retry"
            >
              {props.refreshIcon}
            </button>
          </div>

          {props.extractFailed ? (
            <div className="error">
              <div>Failed to extract values. Enter manually or try again.</div>
              {props.extractMessage ? (
                <div className="muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  {props.extractMessage.length > 800 ? `${props.extractMessage.slice(0, 800)}…` : props.extractMessage}
                </div>
              ) : null}
            </div>
          ) : props.extractMessage ? (
            <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {props.extractMessage.length > 500 ? `${props.extractMessage.slice(0, 500)}…` : props.extractMessage}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
