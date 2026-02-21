import type { ReactNode, RefObject } from 'react'

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
  return (
    <div className={`card stack${props.stepDone && !props.open ? ' collapsed' : ''}`} style={{ opacity: props.enabled ? 1 : 0.6 }}>
      <button className="row card-header-btn" type="button" onClick={props.onToggle}>
        <strong>
          {props.stepNumber}) {props.title}
        </strong>
        {props.stepDone ? props.doneIcon : <span className="muted">Required</span>}
      </button>
      {props.stepDone && !props.open ? null : (
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
      )}
    </div>
  )
}

