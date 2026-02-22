import type { ReactNode, RefObject } from 'react'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'

export function InvoiceStep(props: {
  stepDone: boolean
  open: boolean
  onToggle: () => void
  previewUrl: string | null
  docBusy: boolean
  submitBusy: boolean
  docCameraInputRef: RefObject<HTMLInputElement | null>
  docFileInputRef: RefObject<HTMLInputElement | null>
  onDocumentChange: (file: File | null) => void
  selectedLabel: string
  doneIcon: ReactNode
  cameraIcon: ReactNode
  fileIcon: ReactNode
}) {
  const disabled = props.docBusy || props.submitBusy
  const title = <strong>1) Invoice / receipt (PDF or image)</strong>
  const right = props.stepDone ? props.doneIcon : <span className="muted">Required</span>
  return (
    <CollapsibleCard title={title} open={props.open || !props.stepDone} onToggle={props.onToggle} right={right}>
        <>
          <div className={`image-preview clickable split${disabled ? ' disabled' : ''}`}>
            {props.previewUrl ? <img src={props.previewUrl} alt="Document preview" /> : null}
            <div className="image-split-overlay" aria-hidden="true">
              <button
                className="image-split-btn"
                type="button"
                onClick={() => props.docCameraInputRef.current?.click()}
                disabled={disabled}
              >
                {props.cameraIcon}
                <div>Camera</div>
              </button>
              <button
                className="image-split-btn"
                type="button"
                onClick={() => props.docFileInputRef.current?.click()}
                disabled={disabled}
              >
                {props.fileIcon}
                <div>Files</div>
              </button>
            </div>
            {!props.previewUrl ? <div className="image-placeholder" aria-hidden="true" /> : null}
          </div>
          <input
            ref={props.docCameraInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => props.onDocumentChange(e.target.files?.[0] ?? null)}
            disabled={disabled}
          />
          <input
            ref={props.docFileInputRef}
            className="sr-only"
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => props.onDocumentChange(e.target.files?.[0] ?? null)}
            disabled={disabled}
          />
          <div className="muted">{props.selectedLabel}</div>
        </>
    </CollapsibleCard>
  )
}
