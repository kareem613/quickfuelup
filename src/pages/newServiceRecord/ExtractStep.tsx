import type { ReactNode } from 'react'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'

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
  const showRetry = props.step1Done && (props.stepDone || props.extractFailed)

  const message = !props.step1Done
    ? { kind: 'muted' as const, text: 'Upload an invoice to start extraction.' }
    : props.extractFailed
      ? {
          kind: 'error' as const,
          text:
            'Failed to extract values. Enter manually or retry.\n\n' +
            (props.extractMessage ? (props.extractMessage.length > 800 ? `${props.extractMessage.slice(0, 800)}…` : props.extractMessage) : ''),
        }
      : props.extractMessage
        ? {
            kind: 'muted' as const,
            text: props.extractMessage.length > 500 ? `${props.extractMessage.slice(0, 500)}…` : props.extractMessage,
          }
        : props.extracting
          ? { kind: 'muted' as const, text: 'Extracting records. This can take a minute.' }
          : !props.stepDone
            ? { kind: 'muted' as const, text: 'Ready to extract.' }
            : null

  const title = <strong>2) Extract</strong>
  const right = (
    <>
      {props.stepDone ? props.doneIcon : <span className="muted">Required</span>}
      {showRetry ? (
        <button
          className="icon-btn"
          disabled={!props.canExtractAny || props.extracting || props.submitBusy}
          onClick={props.onRetry}
          type="button"
          aria-label="Retry extraction"
          title="Retry"
        >
          {props.refreshIcon}
        </button>
      ) : null}
    </>
  )

  return (
    <CollapsibleCard
      title={title}
      open={props.open || !props.stepDone}
      onToggle={props.onToggle}
      right={right}
      extracting={props.extracting}
      disabled={!props.step1Done}
    >
      {message ? (
        <div className={message.kind === 'error' ? 'error' : 'muted'} style={{ whiteSpace: 'pre-wrap' }}>
          {message.text}
        </div>
      ) : null}
    </CollapsibleCard>
  )
}
