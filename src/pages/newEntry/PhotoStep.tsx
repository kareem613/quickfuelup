import type { ReactNode, RefObject } from 'react'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'

export function PhotoStep(props: {
  stepNumber: 2 | 3
  title: string
  stepDone: boolean
  open: boolean
  enabled: boolean
  submitBusy: boolean
  imageUrl: string | null
  selectedLabel: string
  cameraInputRef: RefObject<HTMLInputElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  accept: string
  capture?: string
  onToggle: () => void
  onPickCamera: () => void
  onPickFiles: () => void
  onFileSelected: (file: File | null) => void
  doneIcon: ReactNode
  cameraIcon: ReactNode
  fileIcon: ReactNode
}) {
  const disabled = !props.enabled || props.submitBusy
  const headerTitle = (
    <strong>
      {props.stepNumber}) {props.title}
    </strong>
  )
  const headerRight = props.stepDone ? props.doneIcon : <span className="muted">Required</span>
  return (
    <CollapsibleCard
      title={headerTitle}
      open={props.open || !props.stepDone}
      onToggle={props.onToggle}
      right={headerRight}
      disabled={!props.enabled}
    >
        <>
          <div className={`image-preview clickable split${disabled ? ' disabled' : ''}`}>
            {props.imageUrl ? <img src={props.imageUrl} alt={`${props.title} preview`} /> : null}
            <div className="image-split-overlay" aria-hidden="true">
              <button className="image-split-btn" type="button" onClick={props.onPickCamera} disabled={disabled}>
                {props.cameraIcon}
                <div>Camera</div>
              </button>
              <button className="image-split-btn" type="button" onClick={props.onPickFiles} disabled={disabled}>
                {props.fileIcon}
                <div>Files</div>
              </button>
            </div>
          </div>
          <input
            ref={props.cameraInputRef}
            className="sr-only"
            type="file"
            accept={props.accept}
            capture={props.capture as never}
            onChange={(e) => props.onFileSelected(e.target.files?.[0] ?? null)}
            disabled={disabled}
          />
          <input
            ref={props.fileInputRef}
            className="sr-only"
            type="file"
            accept={props.accept}
            onChange={(e) => props.onFileSelected(e.target.files?.[0] ?? null)}
            disabled={disabled}
          />
          <div className="muted">{props.selectedLabel}</div>
        </>
    </CollapsibleCard>
  )
}
