import type { ReactNode } from 'react'
import { Card } from './ui/Card'

export function LlmDebugCard(props: {
  title?: ReactNode
  request: string
  response: string
}) {
  return (
    <Card>
      <div className="row">
        <strong>{props.title ?? 'LLM Debug'}</strong>
        <span />
      </div>

      <div className="field">
        <label>Request</label>
        <textarea readOnly rows={6} value={props.request} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }} />
      </div>

      <div className="field">
        <label>Response (raw)</label>
        <textarea
          readOnly
          rows={10}
          value={props.response}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
        />
      </div>
    </Card>
  )
}

