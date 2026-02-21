import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadConfig } from '../lib/config'
import { todayISODate, toMMDDYYYY } from '../lib/date'
import { clearServiceDraft, loadServiceDraft, saveServiceDraft } from '../lib/serviceDraft'
import { compressImage } from '../lib/image'
import { extractServiceFromDocumentWithFallback } from '../lib/llm'
import { addServiceLikeRecord, getExtraFields, getVehicles, uploadDocuments } from '../lib/lubelogger'
import { pdfToTextAndImages } from '../lib/pdf'
import type { ExtraFieldValue, ServiceDraft, ServiceLikeRecordType, Vehicle } from '../lib/types'

function numberOrEmpty(n: number | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : ''
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

function normalizeToISODate(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const mm = String(mdy[1]!).padStart(2, '0')
    const dd = String(mdy[2]!).padStart(2, '0')
    const yyyy = String(mdy[3]!)
    return `${yyyy}-${mm}-${dd}`
  }
  const d = new Date(s)
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function DoneIcon() {
  return (
    <span className="status-icon muted" aria-label="Done">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 6 9 17l-5-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function RefreshIcon() {
  return (
    <span className="status-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M20 12a8 8 0 0 1-14.3 5M4 12a8 8 0 0 1 14.3-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M20 16v-4h-4M4 8v4h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export default function NewServiceRecordPage() {
  const navigate = useNavigate()
  const cfg = useMemo(() => loadConfig(), [])

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [extraFieldDefs, setExtraFieldDefs] = useState<{ recordType: string; extraFields: { name: string; isRequired?: unknown }[] }[]>([])
  const [draft, setDraft] = useState<ServiceDraft>({ date: todayISODate() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vehiclesLoadProblem, setVehiclesLoadProblem] = useState<string | null>(null)
  const [reloadVehiclesTick, setReloadVehiclesTick] = useState(0)
  const [docBusy, setDocBusy] = useState(false)
  const [extractBusy, setExtractBusy] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [extractFailed, setExtractFailed] = useState(false)
  const [extractMessage, setExtractMessage] = useState<string | null>(null)
  const [forceExtractTick, setForceExtractTick] = useState(0)
  const lastForceExtractTickRef = useRef(0)
  const lastExtractSigRef = useRef<string>('')
  const [successOpen, setSuccessOpen] = useState(false)

  const vehicleTouched = useRef(false)
  const recordTypeTouched = useRef(false)

  const docInputRef = useRef<HTMLInputElement | null>(null)

  const [card1Open, setCard1Open] = useState(true)
  const [card2Open, setCard2Open] = useState(true)
  const card1Touched = useRef(false)
  const card2Touched = useRef(false)

  const providersWithKeys = useMemo(() => {
    const orderedProviders = cfg?.llm.providerOrder?.length ? cfg.llm.providerOrder : (['gemini', 'anthropic'] as const)
    return orderedProviders
      .map((p) => ({
        provider: p,
        apiKey: p === 'anthropic' ? (cfg?.llm.anthropicApiKey ?? '') : (cfg?.llm.geminiApiKey ?? ''),
      }))
      .filter((p) => p.apiKey.trim())
  }, [cfg])

  const extraFieldNamesByRecordType = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const r of extraFieldDefs) {
      out[r.recordType] = (r.extraFields ?? []).map((x) => x.name).filter(Boolean)
    }
    return out
  }, [extraFieldDefs])

  const previewUrl = useMemo(() => {
    const img = draft.documentImages?.[0]
    if (!img) return null
    return URL.createObjectURL(img)
  }, [draft.documentImages])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    document.title = 'QuickFillUp - Service Record'
  }, [])

  useEffect(() => {
    ;(async () => {
      if (!cfg) return
      setBusy(true)
      setError(null)
      setVehiclesLoadProblem(null)
      try {
        const [v, defs, existingDraft] = await Promise.all([
          withTimeout(getVehicles(cfg), 6000, 'Loading vehicles'),
          withTimeout(getExtraFields(cfg), 6000, 'Loading extra fields'),
          loadServiceDraft(),
        ])
        setVehicles(v)
        setExtraFieldDefs(defs)
        const initial = existingDraft ?? { date: todayISODate(), form: { extraFields: [] } }
        const vehicleId = initial.vehicleId ?? (v.length === 1 ? v[0]?.id : undefined)
        setDraft({ ...initial, vehicleId })
      } catch (e) {
        const isOffline = navigator.onLine === false
        const details = e instanceof Error ? e.message : String(e)
        setVehiclesLoadProblem(
          isOffline
            ? 'You appear to be offline. Connect to the internet and try again.'
            : `Could not reach your LubeLogger server. Check your connection and try again.\n\nDetails: ${details}`,
        )
      } finally {
        setBusy(false)
      }
    })()
  }, [cfg, reloadVehiclesTick])

  useEffect(() => {
    void saveServiceDraft(draft)
  }, [draft])

  async function onDocumentChange(file: File | null) {
    if (!file) return
    setDocBusy(true)
    setError(null)
    setExtractFailed(false)
    setExtractMessage(null)
    lastExtractSigRef.current = ''
    setForceExtractTick((n) => n + 1)

    try {
      const baseDraft: ServiceDraft = {
        ...draft,
        document: { blob: file, name: file.name, type: file.type, size: file.size },
        documentText: undefined,
        documentImages: undefined,
        uploadedFiles: undefined,
        extracted: undefined,
        form: { ...(draft.form ?? { extraFields: [] }) },
      }

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const rendered = await pdfToTextAndImages(file, { maxPages: 3 })
        setDraft({
          ...baseDraft,
          documentText: rendered.text || undefined,
          documentImages: rendered.images,
        })
      } else if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file, { maxDimension: 2000, quality: 0.88 })
        setDraft({
          ...baseDraft,
          documentImages: [compressed],
        })
      } else {
        throw new Error('Unsupported file type. Please select a PDF or an image.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDocBusy(false)
    }
  }

  const step1Done = Boolean(draft.vehicleId)
  const step2Done = Boolean(draft.document && (draft.documentImages?.length || draft.documentText))

  useEffect(() => {
    if (!step1Done) {
      setCard1Open(true)
      card1Touched.current = false
      return
    }
    if (!card1Touched.current) setCard1Open(false)
  }, [step1Done])

  useEffect(() => {
    if (!step2Done) {
      setCard2Open(true)
      card2Touched.current = false
      return
    }
    if (!card2Touched.current) setCard2Open(false)
  }, [step2Done])

  const canExtract = Boolean(cfg && draft.document && providersWithKeys.length && draft.documentImages?.length)
  const form = draft.form ?? { extraFields: [] }

  useEffect(() => {
    if (!cfg) return
    if (!draft.document) return
    if (!draft.vehicleId) return
    if (providersWithKeys.length === 0) return
    const forced = forceExtractTick !== lastForceExtractTickRef.current
    if (docBusy || extractBusy || submitBusy) return
    if (!forced && (typeof form.odometer === 'number' || typeof form.cost === 'number' || (form.description ?? '').trim())) return
    if (draft.extracted) return

    const sig = `${draft.vehicleId}:${draft.document.size}:${draft.document.name}:${draft.documentImages?.[0]?.size ?? 0}:${draft.documentText?.length ?? 0}:${draft.date}`
    if (sig === lastExtractSigRef.current) return
    lastExtractSigRef.current = sig

    ;(async () => {
      if (forced) lastForceExtractTickRef.current = forceExtractTick
      setExtractBusy(true)
      setError(null)
      setExtractFailed(false)
      setExtractMessage(null)

      try {
        const extracted = await extractServiceFromDocumentWithFallback({
          providers: providersWithKeys,
          images: draft.documentImages?.slice(0, 3),
          documentText: draft.documentText,
          vehicles,
          extraFieldNamesByRecordType,
        })

        if (extracted.explanation) setExtractMessage(extracted.explanation)

        const nextIso = normalizeToISODate(extracted.date)
        const nextVehicleId =
          typeof extracted.vehicleId === 'number' && vehicles.some((v) => v.id === extracted.vehicleId) ? extracted.vehicleId : null

        setDraft((d) => ({
          ...d,
          vehicleId: !vehicleTouched.current && nextVehicleId ? nextVehicleId : d.vehicleId,
          extracted,
          form: {
            ...(d.form ?? { extraFields: [] }),
            recordType:
              recordTypeTouched.current || !extracted.recordType ? (d.form?.recordType ?? d.recordType) : extracted.recordType ?? undefined,
            date: typeof d.form?.date === 'string' ? d.form.date : nextIso ?? undefined,
            odometer: typeof d.form?.odometer === 'number' ? d.form.odometer : extracted.odometer ?? undefined,
            description: typeof d.form?.description === 'string' && d.form.description.trim() ? d.form.description : extracted.description ?? undefined,
            cost: typeof d.form?.cost === 'number' ? d.form.cost : extracted.totalCost ?? undefined,
            notes: typeof d.form?.notes === 'string' ? d.form.notes : extracted.notes ?? undefined,
            tags: typeof d.form?.tags === 'string' ? d.form.tags : extracted.tags ?? undefined,
            extraFields:
              Array.isArray(d.form?.extraFields) && d.form.extraFields.length
                ? d.form.extraFields
                : (extracted.extraFields ?? undefined) ?? [],
          },
        }))
      } catch (e) {
        setExtractFailed(true)
        setExtractMessage(e instanceof Error ? e.message : String(e))
      } finally {
        setExtractBusy(false)
      }
    })()
  }, [
    cfg,
    docBusy,
    draft.date,
    draft.document,
    draft.documentImages,
    draft.documentText,
    draft.extracted,
    draft.vehicleId,
    extractBusy,
    extraFieldNamesByRecordType,
    forceExtractTick,
    form.cost,
    form.description,
    form.odometer,
    providersWithKeys,
    submitBusy,
    vehicles,
  ])

  const selectedRecordType: ServiceLikeRecordType | undefined = form.recordType ?? draft.recordType
  const requiredExtraFields = useMemo(() => {
    const mappedType =
      selectedRecordType === 'repair' ? 'RepairRecord' : selectedRecordType === 'upgrade' ? 'UpgradeRecord' : 'ServiceRecord'
    const group = extraFieldDefs.find((g) => g.recordType === mappedType)
    return (group?.extraFields ?? []).filter((x) => String(x.isRequired ?? '').toLowerCase() === 'true').map((x) => x.name)
  }, [extraFieldDefs, selectedRecordType])

  const canSubmit =
    Boolean(draft.vehicleId) &&
    Boolean(selectedRecordType) &&
    typeof form.date === 'string' &&
    Boolean(form.date) &&
    typeof form.odometer === 'number' &&
    Number.isFinite(form.odometer) &&
    form.odometer >= 0 &&
    typeof form.cost === 'number' &&
    Number.isFinite(form.cost) &&
    form.cost > 0 &&
    typeof form.description === 'string' &&
    Boolean(form.description.trim()) &&
    requiredExtraFields.every((name) => (form.extraFields ?? []).some((ef) => ef.name === name && ef.value.trim()))

  async function onSubmit() {
    if (!cfg) return
    if (!draft.vehicleId) return
    if (!selectedRecordType) return
    if (!canSubmit) {
      setError('Please confirm record type, date, odometer, description, cost, and required extra fields.')
      return
    }
    if (!draft.document) {
      setError('Please select a document.')
      return
    }

    setSubmitBusy(true)
    setError(null)
    try {
      const file = new File([draft.document.blob], draft.document.name, { type: draft.document.type || undefined })
      const uploaded = draft.uploadedFiles?.length ? draft.uploadedFiles : await uploadDocuments(cfg, [file])

      const res = await addServiceLikeRecord(cfg, {
        recordType: selectedRecordType,
        vehicleId: draft.vehicleId,
        dateMMDDYYYY: toMMDDYYYY(form.date!),
        odometer: form.odometer!,
        description: form.description!.trim(),
        cost: form.cost!,
        notes: form.notes?.trim() ? form.notes.trim() : undefined,
        tags: form.tags?.trim() ? form.tags.trim() : undefined,
        extraFields: (form.extraFields ?? []).filter((x) => x.name.trim() && x.value.trim()),
        files: uploaded,
      })

      await clearServiceDraft()
      vehicleTouched.current = false
      recordTypeTouched.current = false
      setDraft({ date: todayISODate(), form: { extraFields: [] } })
      lastExtractSigRef.current = ''
      setSuccessOpen(true)
      console.log('Submitted', res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitBusy(false)
    }
  }

  if (!cfg) {
    return (
      <div className="container stack">
        <h2 style={{ margin: 0 }}>QuickFillUp</h2>
        <div className="card stack">
          <div>Setup required.</div>
          <Link className="btn primary" to="/settings">
            Go to Settings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container stack">
      <div className="row">
        <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <img src="/icons/ios/32.png" alt="" width={24} height={24} style={{ borderRadius: 6 }} />
          <h2 style={{ margin: 0 }}>QuickFillUp</h2>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <Link to="/new" className="btn small">
            Fuel
          </Link>
          <Link to="/service" className="btn small primary">
            Service
          </Link>
          <Link to="/settings" className="muted">
            Settings
          </Link>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {vehiclesLoadProblem ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Connectivity problem"
          onClick={() => setVehiclesLoadProblem(null)}
        >
          <div className="modal card stack" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Can’t load vehicles</h3>
            <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {vehiclesLoadProblem}
            </div>
            <div className="actions">
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  setVehiclesLoadProblem(null)
                  setReloadVehiclesTick((n) => n + 1)
                }}
              >
                Retry
              </button>
              <button className="btn" type="button" onClick={() => navigate('/settings')}>
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {successOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Submission successful"
          onClick={() => setSuccessOpen(false)}
        >
          <div className="modal card stack" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Success!</h3>
            <div>Record submitted to LubeLogger.</div>
            <a href={cfg.baseUrl} target="_blank" rel="noopener noreferrer" className="btn">
              Open LubeLogger
            </a>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                setSuccessOpen(false)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      <div className={`card stack${step1Done && !card1Open ? ' collapsed' : ''}`}>
        <button
          className="row card-header-btn"
          type="button"
          onClick={() => {
            if (!step1Done) return
            card1Touched.current = true
            setCard1Open((v) => !v)
          }}
        >
          <strong>1) Select vehicle</strong>
          {step1Done ? <DoneIcon /> : <span className="muted">Required</span>}
        </button>
        {step1Done && !card1Open ? null : busy ? (
          <div className="muted">Loading vehicles…</div>
        ) : (
          <div className="vehicle-grid">
            {vehicles.map((v) => {
              const selected = draft.vehicleId === v.id
              return (
                <button
                  key={v.id}
                  className={`vehicle-card${selected ? ' selected' : ''}`}
                  onClick={() => {
                    vehicleTouched.current = true
                    setExtractFailed(false)
                    setExtractMessage(null)
                    setDraft((d) => ({ ...d, vehicleId: v.id, extracted: undefined }))
                  }}
                  disabled={submitBusy}
                  type="button"
                >
                  <div className="vehicle-name">{v.name}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className={`card stack${step2Done && !card2Open ? ' collapsed' : ''}`} style={{ opacity: step1Done ? 1 : 0.6 }}>
        <button
          className="row card-header-btn"
          type="button"
          onClick={() => {
            if (!step2Done) return
            card2Touched.current = true
            setCard2Open((v) => !v)
          }}
        >
          <strong>2) Invoice / receipt (PDF or image)</strong>
          {step2Done ? <DoneIcon /> : <span className="muted">Required</span>}
        </button>

        {step2Done && !card2Open ? null : (
          <>
            <div className={`image-preview clickable${!step1Done || submitBusy ? ' disabled' : ''}`} onClick={() => docInputRef.current?.click()}>
              {previewUrl ? <img src={previewUrl} alt="Document preview" /> : <div className="muted">Tap to choose a PDF or image</div>}
            </div>
            <input
              ref={docInputRef}
              className="sr-only"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => onDocumentChange(e.target.files?.[0] ?? null)}
              disabled={!step1Done || submitBusy}
            />
            <div className="muted">
              {draft.document ? `Selected: ${draft.document.name}` : ''}
              {draft.document && draft.documentText ? ` (text extracted)` : draft.document ? '' : ''}
            </div>
          </>
        )}
      </div>

      <div className={`card stack${extractBusy ? ' extracting' : ''}`} style={{ opacity: step1Done && step2Done ? 1 : 0.6 }}>
        <div className="row">
          <strong>3) Review</strong>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button
              className="btn small"
              disabled={!canExtract || extractBusy || submitBusy}
              onClick={() => {
                setExtractFailed(false)
                setExtractMessage(null)
                lastExtractSigRef.current = ''
                setForceExtractTick((n) => n + 1)
                setDraft((d) => ({ ...d, extracted: undefined }))
              }}
              type="button"
              aria-label="Retry extraction"
              title="Retry"
            >
              <RefreshIcon />
            </button>
          </div>
        </div>

        {extractFailed ? (
          <div className="error">
            <div>Failed to extract values. Enter manually or try again.</div>
            {extractMessage ? (
              <div className="muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                {extractMessage.length > 800 ? `${extractMessage.slice(0, 800)}…` : extractMessage}
              </div>
            ) : null}
          </div>
        ) : extractMessage ? (
          <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
            {extractMessage.length > 500 ? `${extractMessage.slice(0, 500)}…` : extractMessage}
          </div>
        ) : null}

        <div className="grid two no-collapse">
          <div className="field">
            <label>Record type</label>
            <select
              value={selectedRecordType ?? ''}
              onChange={(e) => {
                recordTypeTouched.current = true
                const v = e.target.value as ServiceLikeRecordType
                setDraft((d) => ({ ...d, form: { ...(d.form ?? { extraFields: [] }), recordType: v } }))
              }}
              disabled={!step1Done || submitBusy}
            >
              <option value="" disabled>
                Select…
              </option>
              <option value="service">Service</option>
              <option value="repair">Repair</option>
              <option value="upgrade">Upgrade</option>
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={form.date ?? draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, form: { ...(d.form ?? { extraFields: [] }), date: e.target.value } }))}
              disabled={submitBusy}
            />
          </div>
        </div>

        <div className="field">
          <label>Odometer</label>
          <input
            inputMode="numeric"
            value={numberOrEmpty(form.odometer)}
            onChange={(e) => {
              const n = Number(e.target.value)
              setDraft((d) => ({ ...d, form: { ...(d.form ?? { extraFields: [] }), odometer: Number.isFinite(n) ? n : undefined } }))
            }}
            disabled={submitBusy}
          />
        </div>

        <div className="field">
          <label>Description</label>
          <input
            value={form.description ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, form: { ...(d.form ?? { extraFields: [] }), description: e.target.value } }))}
            disabled={submitBusy}
          />
        </div>

        <div className="grid two no-collapse">
          <div className="field">
            <label>Total cost</label>
            <input
              inputMode="decimal"
              value={numberOrEmpty(form.cost)}
              onChange={(e) => {
                const n = Number(e.target.value)
                setDraft((d) => ({ ...d, form: { ...(d.form ?? { extraFields: [] }), cost: Number.isFinite(n) ? n : undefined } }))
              }}
              disabled={submitBusy}
            />
          </div>
          <div className="field">
            <label>Tags (optional)</label>
            <input
              value={form.tags ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, form: { ...(d.form ?? { extraFields: [] }), tags: e.target.value } }))}
              disabled={submitBusy}
              placeholder="oilchange tires …"
            />
          </div>
        </div>

        <div className="field">
          <label>Notes (optional)</label>
          <textarea
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, form: { ...(d.form ?? { extraFields: [] }), notes: e.target.value } }))}
            disabled={submitBusy}
          />
        </div>

        <div className="card stack" style={{ padding: 14 }}>
          <div className="row">
            <strong>Extra fields</strong>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                const next = [...(form.extraFields ?? []), { name: '', value: '' } satisfies ExtraFieldValue]
                setDraft((d) => ({ ...d, form: { ...(d.form ?? {}), extraFields: next } }))
              }}
              disabled={submitBusy}
            >
              Add
            </button>
          </div>
          {(form.extraFields ?? []).length === 0 ? <div className="muted">None</div> : null}
          {(form.extraFields ?? []).map((ef, idx) => {
            const required = requiredExtraFields.includes(ef.name)
            const missingRequired = required && !ef.value.trim()
            return (
              <div key={idx} className="grid two no-collapse" style={{ alignItems: 'flex-end' }}>
                <div className="field">
                  <label>{required ? `Name (required)` : 'Name'}</label>
                  <input
                    value={ef.name}
                    onChange={(e) => {
                      const next = (form.extraFields ?? []).slice()
                      next[idx] = { ...ef, name: e.target.value }
                      setDraft((d) => ({ ...d, form: { ...(d.form ?? {}), extraFields: next } }))
                    }}
                    disabled={submitBusy}
                    list="extra-field-names"
                  />
                </div>
                <div className="field">
                  <label>{missingRequired ? 'Value (required)' : 'Value'}</label>
                  <input
                    value={ef.value}
                    onChange={(e) => {
                      const next = (form.extraFields ?? []).slice()
                      next[idx] = { ...ef, value: e.target.value }
                      setDraft((d) => ({ ...d, form: { ...(d.form ?? {}), extraFields: next } }))
                    }}
                    disabled={submitBusy}
                  />
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => {
                      const next = (form.extraFields ?? []).slice()
                      next.splice(idx, 1)
                      setDraft((d) => ({ ...d, form: { ...(d.form ?? {}), extraFields: next } }))
                    }}
                    disabled={submitBusy}
                    aria-label="Remove extra field"
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
          <datalist id="extra-field-names">
            {(selectedRecordType
              ? extraFieldNamesByRecordType[selectedRecordType === 'repair' ? 'RepairRecord' : selectedRecordType === 'upgrade' ? 'UpgradeRecord' : 'ServiceRecord'] ?? []
              : []
            ).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        <div className="actions">
          <button className="btn primary" disabled={!canSubmit || submitBusy || extractBusy} onClick={onSubmit} type="button">
            {submitBusy ? 'Submitting…' : 'Submit to LubeLogger'}
          </button>
          <button
            className="btn"
            disabled={submitBusy || extractBusy || docBusy}
            onClick={async () => {
              await clearServiceDraft()
              vehicleTouched.current = false
              recordTypeTouched.current = false
              lastExtractSigRef.current = ''
              setExtractFailed(false)
              setExtractMessage(null)
              setDraft({ date: todayISODate(), form: { extraFields: [] } })
            }}
            type="button"
          >
            Start over
          </button>
        </div>
      </div>

      {docBusy || extractBusy ? <div className="muted">{docBusy ? 'Processing document…' : 'Extracting from document…'}</div> : null}
    </div>
  )
}
