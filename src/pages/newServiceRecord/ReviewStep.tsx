import type { ReactNode } from 'react'
import type { ServiceDraftRecord, ServiceLikeRecordType } from '../../lib/types'
import { ExtraFieldsBox } from './ExtraFieldsBox'

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

export function ReviewStep(props: {
  step1Done: boolean
  step2Done: boolean
  hasRecords: boolean
  draftDate: string
  records: ServiceDraftRecord[]
  submitBusy: boolean
  onDeleteRecord: (recordId: string) => void
  numberOrEmpty: (n: number | undefined) => string
  requiredExtraFieldsFor: (t: ServiceLikeRecordType | undefined) => string[]
  recordCanSubmit: (r: ServiceDraftRecord) => boolean
  mappedRecordType: (t: ServiceLikeRecordType | undefined) => string
  extraFieldNamesByRecordType: Record<string, string[]>
  updateRecord: (id: string, fn: (r: ServiceDraftRecord) => ServiceDraftRecord) => void
  updateRecordAndClearWarnings: (params: {
    id: string
    clearPaths: string[]
    fn: (r: ServiceDraftRecord) => ServiceDraftRecord
  }) => void
  hasWarningForRecordField: (recordIdx: number, field: string) => boolean
  doneIcon: ReactNode
}) {
  return (
    <div className={`card stack`} style={{ opacity: props.step1Done && props.step2Done ? 1 : 0.6 }}>
      <div className="row">
        <strong>4) Review</strong>
      </div>

      {!props.hasRecords ? <div className="muted">No records have been extracted.</div> : null}

      {(props.records ?? []).map((r, idx) => {
        const required = props.requiredExtraFieldsFor(r.form.recordType)
        const datalistId = `extra-field-names-${r.id}`
        const isSubmitted = r.status === 'submitted'
        const attempted = Boolean(r.validationAttempted)

        const invalidRecordType = attempted && !r.form.recordType
        const invalidOdometer =
          attempted && !(typeof r.form.odometer === 'number' && Number.isFinite(r.form.odometer) && r.form.odometer >= 0)
        const invalidDescription = attempted && !(typeof r.form.description === 'string' && Boolean(r.form.description.trim()))
        const invalidTotalCost = attempted && !(typeof r.form.cost === 'number' && Number.isFinite(r.form.cost) && r.form.cost > 0)
        const invalidDate =
          attempted && !(typeof (r.form.date ?? props.draftDate) === 'string' && Boolean(r.form.date ?? props.draftDate))

        const warnRecordType = props.hasWarningForRecordField(idx, 'recordType')
        const warnDate = props.hasWarningForRecordField(idx, 'date')
        const warnOdometer = props.hasWarningForRecordField(idx, 'odometer')
        const warnDescription = props.hasWarningForRecordField(idx, 'description')
        const warnTotalCost = props.hasWarningForRecordField(idx, 'totalCost')
        const warnTags = props.hasWarningForRecordField(idx, 'tags')
        const warnNotes = props.hasWarningForRecordField(idx, 'notes')

        const nameOptions = r.form.recordType
          ? props.extraFieldNamesByRecordType[props.mappedRecordType(r.form.recordType)] ?? []
          : []

        return (
          <div key={r.id} className="card stack" style={{ padding: 14 }}>
            <div className="row">
              <strong>Record {idx + 1}</strong>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                {isSubmitted ? (
                  props.doneIcon
                ) : (
                  <span className="muted">{r.status === 'failed' ? 'Needs attention' : 'Pending'}</span>
                )}
                {!isSubmitted ? (
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => props.onDeleteRecord(r.id)}
                    disabled={props.submitBusy}
                    aria-label="Delete record"
                    title="Delete record"
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            </div>

            {r.submitError ? (
              <div className="error" style={{ whiteSpace: 'pre-wrap' }}>
                {r.submitError}
              </div>
            ) : null}

            <div className="grid two no-collapse">
              <div className={`field${warnRecordType ? ' warn' : ''}${invalidRecordType ? ' invalid' : ''}`}>
                <label>Record type</label>
                <select
                  value={r.form.recordType ?? ''}
                  onChange={(e) => {
                    props.updateRecordAndClearWarnings({
                      id: r.id,
                      clearPaths: [`/records/${idx}/recordType`],
                      fn: (prev) => ({
                        ...prev,
                        recordTypeTouched: true,
                        form: { ...prev.form, recordType: e.target.value as ServiceLikeRecordType },
                      }),
                    })
                  }}
                  disabled={props.submitBusy || isSubmitted}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  <option value="service">Service</option>
                  <option value="repair">Repair</option>
                  <option value="upgrade">Upgrade</option>
                </select>
              </div>
              <div className={`field${warnDate ? ' warn' : ''}${invalidDate ? ' invalid' : ''}`}>
                <label>Date</label>
                <input
                  type="date"
                  value={r.form.date ?? props.draftDate}
                  onChange={(e) =>
                    props.updateRecordAndClearWarnings({
                      id: r.id,
                      clearPaths: [`/records/${idx}/date`],
                      fn: (prev) => ({ ...prev, form: { ...prev.form, date: e.target.value } }),
                    })
                  }
                  disabled={props.submitBusy || isSubmitted}
                />
              </div>
            </div>

            <div className={`field${warnOdometer ? ' warn' : ''}${invalidOdometer ? ' invalid' : ''}`}>
              <label>Odometer</label>
              <input
                inputMode="numeric"
                value={props.numberOrEmpty(r.form.odometer)}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  props.updateRecordAndClearWarnings({
                    id: r.id,
                    clearPaths: [`/records/${idx}/odometer`],
                    fn: (prev) => ({ ...prev, form: { ...prev.form, odometer: Number.isFinite(n) ? n : undefined } }),
                  })
                }}
                disabled={props.submitBusy || isSubmitted}
              />
            </div>

            <div className={`field${warnDescription ? ' warn' : ''}${invalidDescription ? ' invalid' : ''}`}>
              <label>Description</label>
              <input
                value={r.form.description ?? ''}
                onChange={(e) =>
                  props.updateRecordAndClearWarnings({
                    id: r.id,
                    clearPaths: [`/records/${idx}/description`],
                    fn: (prev) => ({ ...prev, form: { ...prev.form, description: e.target.value } }),
                  })
                }
                disabled={props.submitBusy || isSubmitted}
              />
            </div>

            <div className="grid two no-collapse">
              <div className={`field${warnTotalCost ? ' warn' : ''}${invalidTotalCost ? ' invalid' : ''}`}>
                <label>Total cost</label>
                <input
                  inputMode="decimal"
                  value={props.numberOrEmpty(r.form.cost)}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    props.updateRecordAndClearWarnings({
                      id: r.id,
                      clearPaths: [`/records/${idx}/totalCost`],
                      fn: (prev) => ({ ...prev, form: { ...prev.form, cost: Number.isFinite(n) ? n : undefined } }),
                    })
                  }}
                  disabled={props.submitBusy || isSubmitted}
                />
              </div>
              <div className={`field${warnTags ? ' warn' : ''}`}>
                <label>Tags (optional)</label>
                <input
                  value={r.form.tags ?? ''}
                  onChange={(e) =>
                    props.updateRecordAndClearWarnings({
                      id: r.id,
                      clearPaths: [`/records/${idx}/tags`],
                      fn: (prev) => ({ ...prev, form: { ...prev.form, tags: e.target.value } }),
                    })
                  }
                  disabled={props.submitBusy || isSubmitted}
                  placeholder="oilchange tires …"
                />
              </div>
            </div>

            <div className={`field${warnNotes ? ' warn' : ''}`}>
              <label>Notes (optional)</label>
              <textarea
                rows={2}
                value={r.form.notes ?? ''}
                onChange={(e) =>
                  props.updateRecordAndClearWarnings({
                    id: r.id,
                    clearPaths: [`/records/${idx}/notes`],
                    fn: (prev) => ({ ...prev, form: { ...prev.form, notes: e.target.value } }),
                  })
                }
                disabled={props.submitBusy || isSubmitted}
              />
            </div>

            <ExtraFieldsBox
              record={r}
              requiredNames={required}
              attempted={attempted}
              submitBusy={props.submitBusy}
              isSubmitted={isSubmitted}
              datalistId={datalistId}
              nameOptions={nameOptions}
              updateRecord={props.updateRecord}
            />

            {attempted && !props.recordCanSubmit(r) ? <div className="error">Some fields are missing or invalid.</div> : null}
          </div>
        )
      })}
    </div>
  )
}
