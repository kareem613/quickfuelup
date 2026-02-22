import type { CSSProperties, ReactNode } from 'react'

export function Card(props: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  stack?: boolean
  invalid?: boolean
  extracting?: boolean
}) {
  const cls = [
    'card',
    props.stack === false ? null : 'stack',
    props.invalid ? 'invalid' : null,
    props.extracting ? 'extracting' : null,
    props.className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={props.style}>
      {props.children}
    </div>
  )
}

