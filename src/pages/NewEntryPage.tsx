import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadConfig } from '../lib/config'
import { toMMDDYYYY, todayISODate } from '../lib/date'
import { clearDraft, loadDraft, saveDraft } from '../lib/draft'
import { extractFromImages } from '../lib/gemini'
import { compressImage } from '../lib/image'
import { addGasRecord, getVehicles } from '../lib/lubelogger'
import type { Draft, Vehicle } from '../lib/types'

function numberOrEmpty(n: number | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : ''
}

function llmMessageFromGeminiError(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e)
  const prefixes = ['Gemini did not return JSON:', 'Gemini response did not match schema:']
  for (const p of prefixes) {
    if (msg.startsWith(p)) return msg.slice(p.length).trim() || null
  }
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

export default function NewEntryPage() {
  // Avoid re-loading config object every render (prevents effect loops).
  const cfg = useMemo(() => loadConfig(), [])
  const geminiApiKey = cfg?.geminiApiKey ?? ''

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [draft, setDraft] = useState<Draft>({ date: todayISODate() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [extractBusy, setExtractBusy] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [extractFailed, setExtractFailed] = useState(false)
  const [extractLlmMessage, setExtractLlmMessage] = useState<string | null>(null)
  const lastExtractSigRef = useRef<string>('')
  const [successOpen, setSuccessOpen] = useState(false)

  const [card1Open, setCard1Open] = useState(true)
  const [card2Open, setCard2Open] = useState(true)
  const [card3Open, setCard3Open] = useState(true)
  const card1Touched = useRef(false)
  const card2Touched = useRef(false)
  const card3Touched = useRef(false)

  const pumpUrl = useMemo(() => {
    if (!draft.pumpImage) return null
    return URL.createObjectURL(draft.pumpImage)
  }, [draft.pumpImage])

  const odoUrl = useMemo(() => {
    if (!draft.odometerImage) return null
    return URL.createObjectURL(draft.odometerImage)
  }, [draft.odometerImage])

  useEffect(() => {
    return () => {
      if (pumpUrl) URL.revokeObjectURL(pumpUrl)
      if (odoUrl) URL.revokeObjectURL(odoUrl)
    }
  }, [odoUrl, pumpUrl])

  useEffect(() => {
    document.title = 'QuickFuelUp - New Entry'
  }, [])

  useEffect(() => {
    ;(async () => {
      if (!cfg) return
      setBusy(true)
      setError(null)
      try {
        const [existingDraft, v] = await Promise.all([loadDraft(), getVehicles(cfg)])
        setVehicles(v)
        const initial =
          existingDraft ?? {
            date: todayISODate(),
            form: { isfilltofull: true, missedfuelup: false },
          }
        // If there is only one vehicle, auto-select it (unless a draft already chose one).
        const vehicleId = initial.vehicleId ?? (v.length === 1 ? v[0]?.id : undefined)
        setDraft({ ...initial, vehicleId })
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
      }
    })()
  }, [cfg])

  useEffect(() => {
    // Persist the draft (including images) to enable retries across reloads.
    void saveDraft(draft)
  }, [draft])

  async function onFileChange(key: 'pumpImage' | 'odometerImage', file: File | null) {
    if (!file) return
    setImageBusy(true)
    setError(null)
    setExtractFailed(false)
    setExtractLlmMessage(null)
    try {
      const compressed = await compressImage(file, { maxDimension: 1600, quality: 0.85 })
      setDraft((d) => ({
        ...d,
        [key]: compressed,
        extracted: undefined,
        form: { ...(d.form ?? { isfilltofull: true, missedfuelup: false }), isfilltofull: true, missedfuelup: false },
      }))
    } catch (e) {
      setError(String(e))
    } finally {
      setImageBusy(false)
    }
  }

  const canExtract = Boolean(draft.vehicleId && draft.pumpImage && draft.odometerImage)
  const canEditDetails = Boolean(draft.vehicleId)
  const form = draft.form ?? { isfilltofull: true, missedfuelup: false }

  const step1Done = Boolean(draft.vehicleId)
  const step2Done = Boolean(draft.pumpImage)
  const step3Done = Boolean(draft.odometerImage)

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

  useEffect(() => {
    if (!step3Done) {
      setCard3Open(true)
      card3Touched.current = false
      return
    }
    if (!card3Touched.current) setCard3Open(false)
  }, [step3Done])

  useEffect(() => {
    if (!cfg) return
    if (!canExtract) return
    // Don't auto-overwrite if the user has started entering values manually.
    if (
      typeof form.odometer === 'number' ||
      typeof form.fuelconsumed === 'number' ||
      typeof form.cost === 'number'
    ) {
      return
    }
    if (imageBusy || extractBusy || submitBusy) return
    if (draft.extracted) return

    const sig = `${draft.vehicleId}:${draft.pumpImage?.size}:${draft.odometerImage?.size}:${draft.date}`
    if (sig === lastExtractSigRef.current) return
    lastExtractSigRef.current = sig

    ;(async () => {
      setExtractBusy(true)
      setError(null)
      setExtractFailed(false)
      setExtractLlmMessage(null)
      try {
        const extracted = await extractFromImages({
          apiKey: geminiApiKey,
          pumpImage: draft.pumpImage!,
          odometerImage: draft.odometerImage!,
        })

        if (
          extracted.explanation &&
          (extracted.odometer === null || extracted.fuelQuantity === null || extracted.totalCost === null)
        ) {
          setExtractFailed(true)
          setExtractLlmMessage(extracted.explanation)
        }

        setDraft((d) => ({
          ...d,
          extracted,
          form: {
            ...(d.form ?? { isfilltofull: true, missedfuelup: false }),
            odometer: extracted.odometer ?? undefined,
            fuelconsumed: extracted.fuelQuantity ?? undefined,
            cost: extracted.totalCost ?? undefined,
            isfilltofull: d.form?.isfilltofull ?? true,
            missedfuelup: d.form?.missedfuelup ?? false,
          },
        }))
      } catch (e) {
        setExtractFailed(true)
        setExtractLlmMessage(llmMessageFromGeminiError(e))
      } finally {
        setExtractBusy(false)
      }
    })()
  }, [canExtract, cfg, draft.date, draft.extracted, draft.odometerImage, draft.pumpImage, draft.vehicleId, extractBusy, geminiApiKey, imageBusy, submitBusy])

  const canSubmit =
    Boolean(draft.vehicleId) &&
    typeof form.odometer === 'number' &&
    typeof form.fuelconsumed === 'number' &&
    typeof form.cost === 'number' &&
    form.odometer >= 0 &&
    form.fuelconsumed > 0 &&
    form.cost > 0

  async function onSubmit() {
    if (!draft.vehicleId) return
    if (!cfg) return
    setSubmitBusy(true)
    setError(null)
    try {
      if (!canSubmit) throw new Error('Please confirm odometer, fuel quantity, and total cost.')
      const res = await addGasRecord(cfg, {
        vehicleId: draft.vehicleId,
        dateMMDDYYYY: toMMDDYYYY(draft.date),
        odometer: form.odometer!,
        fuelconsumed: form.fuelconsumed!,
        cost: form.cost!,
        isfilltofull: Boolean(form.isfilltofull),
        missedfuelup: Boolean(form.missedfuelup),
        notes: form.notes?.trim() ? form.notes.trim() : undefined,
      })

      await clearDraft()
      setDraft({ date: todayISODate(), form: { isfilltofull: true, missedfuelup: false } })
      lastExtractSigRef.current = ''
      setSuccessOpen(true)
      // Keep response in console for now; UX can add a toast later.
      console.log('Submitted', res)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitBusy(false)
    }
  }

  if (!cfg) {
    return (
      <div className="container stack">
        <h2 style={{ margin: 0 }}>QuickFuelUp</h2>
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
        <h2 style={{ margin: 0 }}>Fuel Wizard</h2>
        <Link to="/settings" className="muted">
          Settings
        </Link>
      </div>

      {error && <div className="error">{error}</div>}
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
            <div>Fuel-up submitted to LubeLogger.</div>
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
                      setExtractFailed(false)
                      setExtractLlmMessage(null)
                      setDraft((d) => ({
                        ...d,
                        vehicleId: v.id,
                        extracted: undefined,
                      }))
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
          <strong>2) Pump photo</strong>
          {step2Done ? <DoneIcon /> : <span className="muted">Required</span>}
        </button>
        {step2Done && !card2Open ? null : (
          <>
            <label
              className={`image-preview clickable${!step1Done || submitBusy ? ' disabled' : ''}`}
              aria-disabled={!step1Done || submitBusy}
            >
              {pumpUrl ? (
                <>
                  <img src={pumpUrl} alt="Pump preview" />
                  <div className="image-overlay">Tap to replace</div>
                </>
              ) : (
                <div className="image-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M7 7h3l1-2h2l1 2h3a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path d="M12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                  <div>{draft.pumpImage ? 'Replace pump photo' : 'Tap to choose pump photo'}</div>
                </div>
              )}
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(e) => onFileChange('pumpImage', e.target.files?.[0] ?? null)}
                disabled={!step1Done || submitBusy}
              />
            </label>
            <div className="muted">
              {draft.pumpImage
                ? `Selected: ${draft.pumpImage.type || 'image'} (${Math.round(draft.pumpImage.size / 1024)} KB)`
                : ''}
            </div>
          </>
        )}
      </div>

      <div className={`card stack${step3Done && !card3Open ? ' collapsed' : ''}`} style={{ opacity: step1Done && step2Done ? 1 : 0.6 }}>
        <button
          className="row card-header-btn"
          type="button"
          onClick={() => {
            if (!step3Done) return
            card3Touched.current = true
            setCard3Open((v) => !v)
          }}
        >
          <strong>3) Odometer photo</strong>
          {step3Done ? <DoneIcon /> : <span className="muted">Required</span>}
        </button>
        {step3Done && !card3Open ? null : (
          <>
            <label
              className={`image-preview clickable${!step1Done || !step2Done || submitBusy ? ' disabled' : ''}`}
              aria-disabled={!step1Done || !step2Done || submitBusy}
            >
              {odoUrl ? (
                <>
                  <img src={odoUrl} alt="Odometer preview" />
                  <div className="image-overlay">Tap to replace</div>
                </>
              ) : (
                <div className="image-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M7 7h3l1-2h2l1 2h3a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15 12.5 12.8 14M8.5 17.5A6.8 6.8 0 0 1 12 10.2a6.8 6.8 0 0 1 3.5 7.3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div>{draft.odometerImage ? 'Replace odometer photo' : 'Tap to choose odometer photo'}</div>
                </div>
              )}
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(e) => onFileChange('odometerImage', e.target.files?.[0] ?? null)}
                disabled={!step1Done || !step2Done || submitBusy}
              />
            </label>
            <div className="muted">
              {draft.odometerImage
                ? `Selected: ${draft.odometerImage.type || 'image'} (${Math.round(draft.odometerImage.size / 1024)} KB)`
                : ''}
            </div>
          </>
        )}
      </div>

      <div className={`card stack${extractBusy ? ' extracting' : ''}`} style={{ opacity: canEditDetails ? 1 : 0.6 }}>
        <div className="row">
          <strong>4) Fueling</strong>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button
              className="btn small"
              disabled={!canExtract || extractBusy || submitBusy}
              onClick={() => {
                lastExtractSigRef.current = ''
                setExtractFailed(false)
                setExtractLlmMessage(null)
                setDraft((d) => ({
                  ...d,
                  extracted: undefined,
                  form: {
                    ...(d.form ?? { isfilltofull: true, missedfuelup: false }),
                    odometer: undefined,
                    fuelconsumed: undefined,
                    cost: undefined,
                    isfilltofull: d.form?.isfilltofull ?? true,
                    missedfuelup: d.form?.missedfuelup ?? false,
                  },
                }))
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
            {extractLlmMessage ? (
              <div className="muted" style={{ marginTop: 6 }}>
                {extractLlmMessage.length > 500 ? `${extractLlmMessage.slice(0, 500)}…` : extractLlmMessage}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <label>Odometer</label>
          <input
            inputMode="numeric"
            value={numberOrEmpty(form.odometer)}
            onChange={(e) => {
              const n = Number(e.target.value)
              setDraft((d) => ({
                ...d,
                form: { ...form, odometer: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
              }))
            }}
            disabled={!canEditDetails || submitBusy}
          />
        </div>

        <div className="grid two no-collapse">
          <div className="field">
            <label>Fuel quantity</label>
            <input
              inputMode="decimal"
              value={numberOrEmpty(form.fuelconsumed)}
              onChange={(e) => {
                const n = Number(e.target.value)
                setDraft((d) => ({
                  ...d,
                  form: { ...form, fuelconsumed: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
                }))
              }}
              disabled={!canEditDetails || submitBusy}
            />
          </div>
          <div className="field">
            <label>Total cost</label>
            <input
              inputMode="decimal"
              value={numberOrEmpty(form.cost)}
              onChange={(e) => {
                const n = Number(e.target.value)
                setDraft((d) => ({
                  ...d,
                  form: { ...form, cost: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
                }))
              }}
              disabled={!canEditDetails || submitBusy}
            />
          </div>
        </div>
      </div>

      <div className="card stack" style={{ opacity: canEditDetails ? 1 : 0.6 }}>
        <div className="row">
          <strong>5) Details</strong>
          <span className="muted">{draft.date}</span>
        </div>

        <div className="field">
          <label>Date</label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            disabled={submitBusy}
          />
        </div>

        <div className="row" style={{ justifyContent: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <label className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(form.isfilltofull)}
                onChange={(e) => setDraft((d) => ({ ...d, form: { ...form, isfilltofull: e.target.checked, missedfuelup: form.missedfuelup } }))}
                disabled={!canEditDetails || submitBusy}
              />
              <span>Fill to full</span>
            </label>

          <label className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(form.missedfuelup)}
                onChange={(e) => setDraft((d) => ({ ...d, form: { ...form, missedfuelup: e.target.checked, isfilltofull: form.isfilltofull } }))}
                disabled={!canEditDetails || submitBusy}
              />
              <span>Missed fuel-up</span>
            </label>
          </div>

        <div className="field">
          <label>Notes (optional)</label>
          <textarea
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, form: { ...form, notes: e.target.value, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup } }))}
            disabled={!canEditDetails || submitBusy}
          />
        </div>

        <div className="actions">
          <button className="btn primary" disabled={!canSubmit || submitBusy || extractBusy} onClick={onSubmit} type="button">
            {submitBusy ? 'Submitting…' : 'Submit to LubeLogger'}
          </button>
          <button
            className="btn"
            disabled={submitBusy || extractBusy || imageBusy}
            onClick={async () => {
              await clearDraft()
              lastExtractSigRef.current = ''
              setExtractFailed(false)
              setExtractLlmMessage(null)
              setDraft({ date: todayISODate(), form: { isfilltofull: true, missedfuelup: false } })
            }}
            type="button"
          >
            Start over
          </button>
        </div>
      </div>

      {imageBusy || extractBusy ? (
        <div className="muted">{imageBusy ? 'Processing images…' : 'Extracting from photos…'}</div>
      ) : null}
    </div>
  )
}
