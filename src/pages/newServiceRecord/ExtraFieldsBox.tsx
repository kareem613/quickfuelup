import type { ServiceDraftRecord } from '../../lib/types'

function TrashIcon() {
  return (
    <span className="status-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M9 3h6m-7 4h8m-9 0 1 14h8l1-14M10 10v8M14 10v8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function ExtraFieldsBox(props: {
  record: ServiceDraftRecord
  requiredNames: string[]
  attempted: boolean
  submitBusy: boolean
  isSubmitted: boolean
  datalistId: string
  nameOptions: string[]
  updateRecord: (id: string, fn: (r: ServiceDraftRecord) => ServiceDraftRecord) => void
}) {
  return (
    <div className="card stack" style={{ padding: 14 }}>
      <div className="row">
        <strong>Extra fields</strong>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            props.updateRecord(props.record.id, (prev) => ({
              ...prev,
              form: { ...prev.form, extraFields: [...(prev.form.extraFields ?? []), { name: '', value: '' }] },
            }))
          }}
          disabled={props.submitBusy || props.isSubmitted}
        >
          Add
        </button>
      </div>
      {(props.record.form.extraFields ?? []).length === 0 ? <div className="muted">None</div> : null}
      {(props.record.form.extraFields ?? []).map((ef, efIdx) => {
        const isReq = props.requiredNames.includes(ef.name)
        const missingRequired = isReq && !ef.value.trim()
        return (
          <div key={efIdx} className="extra-fields-row">
            <div className="field">
              <label>{isReq ? `Name (required)` : 'Name'}</label>
              <input
                value={ef.name}
                onChange={(e) => {
                  props.updateRecord(props.record.id, (prev) => {
                    const next = (prev.form.extraFields ?? []).slice()
                    next[efIdx] = { ...ef, name: e.target.value }
                    return { ...prev, form: { ...prev.form, extraFields: next } }
                  })
                }}
                disabled={props.submitBusy || props.isSubmitted}
                list={props.datalistId}
              />
            </div>
            <div className={`field${missingRequired && props.attempted ? ' invalid' : ''}`}>
              <label>{missingRequired ? 'Value (required)' : 'Value'}</label>
              <input
                value={ef.value}
                onChange={(e) => {
                  props.updateRecord(props.record.id, (prev) => {
                    const next = (prev.form.extraFields ?? []).slice()
                    next[efIdx] = { ...ef, value: e.target.value }
                    return { ...prev, form: { ...prev.form, extraFields: next } }
                  })
                }}
                disabled={props.submitBusy || props.isSubmitted}
              />
            </div>
            <button
              className="icon-btn"
              type="button"
              onClick={() => {
                props.updateRecord(props.record.id, (prev) => {
                  const next = (prev.form.extraFields ?? []).slice()
                  next.splice(efIdx, 1)
                  return { ...prev, form: { ...prev.form, extraFields: next } }
                })
              }}
              disabled={props.submitBusy || props.isSubmitted}
              aria-label="Remove extra field"
              title="Remove"
            >
              <TrashIcon />
            </button>
          </div>
        )
      })}
      <datalist id={props.datalistId}>
        {props.nameOptions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  )
}
