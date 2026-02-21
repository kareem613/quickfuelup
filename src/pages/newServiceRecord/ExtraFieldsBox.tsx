import type { ServiceDraftRecord } from '../../lib/types'

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
          <div key={efIdx} className="grid two no-collapse" style={{ alignItems: 'flex-end' }}>
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
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn small"
                type="button"
                onClick={() => {
                  props.updateRecord(props.record.id, (prev) => {
                    const next = (prev.form.extraFields ?? []).slice()
                    next.splice(efIdx, 1)
                    return { ...prev, form: { ...prev.form, extraFields: next } }
                  })
                }}
                disabled={props.submitBusy || props.isSubmitted}
              >
                Remove
              </button>
            </div>
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

