import type { CSSProperties, ReactNode } from 'react'
import { Card } from './Card'

export function CollapsibleCard(props: {
  title: ReactNode
  open: boolean
  onToggle: () => void
  right?: ReactNode
  children?: ReactNode
  className?: string
  style?: CSSProperties
  invalid?: boolean
  extracting?: boolean
  disabled?: boolean
}) {
  return (
    <Card
      className={props.className}
      invalid={props.invalid}
      extracting={props.extracting}
      style={{ ...(props.style ?? null), ...(props.disabled ? { opacity: 0.6 } : null) }}
    >
      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
        <button className="row card-header-btn" type="button" onClick={props.onToggle} style={{ flex: 1, width: 'auto' }}>
          {props.title}
        </button>
        {props.right ? (
          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
            {props.right}
          </div>
        ) : null}
      </div>

      {props.open ? props.children : null}
    </Card>
  )
}

