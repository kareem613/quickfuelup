import type { ReactNode } from 'react'
import { marked } from 'marked'
import { Card } from './ui/Card'

export function LlmDebugCard(props: {
  title?: ReactNode
  prompt: string
  response: string
}) {
  // Avoid HTML injection from prompt text (vehicles names, etc.)
  const promptSafe = props.prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const promptHtml = marked.parse(promptSafe)

  return (
    <Card>
      <div className="row">
        <strong>{props.title ?? 'LLM Debug'}</strong>
        <span />
      </div>

      <div className="field">
        <label>Prompt</label>
        <div className="markdown" dangerouslySetInnerHTML={{ __html: promptHtml }} />
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
