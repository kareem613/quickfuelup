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
  const lastExtractSigRef = useRef<string>('')
  const [vehicleImgMode, setVehicleImgMode] = useState<Record<number, 'direct' | 'proxy' | 'none'>>({})

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
  const form = draft.form ?? { isfilltofull: true, missedfuelup: false }

  useEffect(() => {
    if (!cfg) return
    if (!canExtract) return
    if (imageBusy || extractBusy || submitBusy) return
    if (draft.extracted) return

    const sig = `${draft.vehicleId}:${draft.pumpImage?.size}:${draft.odometerImage?.size}:${draft.date}`
    if (sig === lastExtractSigRef.current) return
    lastExtractSigRef.current = sig

    ;(async () => {
      setExtractBusy(true)
      setError(null)
      try {
        const extracted = await extractFromImages({
          apiKey: geminiApiKey,
          pumpImage: draft.pumpImage!,
          odometerImage: draft.odometerImage!,
        })

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
        setError(String(e))
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
      // Keep response in console for now; UX can add a toast later.
      console.log('Submitted', res)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitBusy(false)
    }
  }

  function vehicleImageUrlDirect(imageLocation?: string) {
    if (!cfg) return null
    if (!imageLocation) return null
    if (/^https?:\/\//i.test(imageLocation)) return imageLocation
    return `${cfg.baseUrl.replace(/\/+$/, '')}${imageLocation.startsWith('/') ? '' : '/'}${imageLocation}`
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

      <div className="card stack">
        <div className="row">
          <strong>1) Select vehicle</strong>
          <span className="muted">{draft.vehicleId ? 'Done' : 'Required'}</span>
        </div>
        {busy ? (
          <div className="muted">Loading vehicles…</div>
        ) : (
          <div className="vehicle-grid">
            {vehicles.map((v) => {
              const direct = vehicleImageUrlDirect(v.imageLocation)
              const img = vehicleImgMode[v.id] === 'none' ? null : direct
              const selected = draft.vehicleId === v.id
              return (
                <button
                  key={v.id}
                  className={`vehicle-card${selected ? ' selected' : ''}`}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      vehicleId: v.id,
                      extracted: undefined,
                    }))
                  }
                  disabled={submitBusy}
                  type="button"
                >
                  <div className="vehicle-thumb">
                    {img ? (
                      <img
                        src={img}
                        alt={v.name}
                        loading="lazy"
                        onError={() => {
                          setVehicleImgMode((m) => ({ ...m, [v.id]: 'none' }))
                        }}
                      />
                    ) : (
                      <div className="image-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M6 11.5 7.3 8.6A2 2 0 0 1 9.1 7.4h5.8a2 2 0 0 1 1.8 1.2l1.3 2.9H21a1 1 0 0 1 1 1v4.2A2.3 2.3 0 0 1 19.7 19H19a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4.3A2.3 2.3 0 0 1 2 16.7v-4.2a1 1 0 0 1 1-1H6Z"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                          <circle cx="6.5" cy="19" r="2" stroke="currentColor" strokeWidth="1.6" />
                          <circle cx="17.5" cy="19" r="2" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="vehicle-name">{v.name}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="card stack" style={{ opacity: draft.vehicleId ? 1 : 0.6 }}>
        <div className="row">
          <strong>2) Pump photo</strong>
          <span className="muted">{draft.pumpImage ? 'Done' : 'Required'}</span>
        </div>
        <label
          className={`image-preview clickable${!draft.vehicleId || submitBusy ? ' disabled' : ''}`}
          aria-disabled={!draft.vehicleId || submitBusy}
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
            disabled={!draft.vehicleId || submitBusy}
          />
        </label>
        <div className="muted">
          {draft.pumpImage ? `Selected: ${draft.pumpImage.type || 'image'} (${Math.round(draft.pumpImage.size / 1024)} KB)` : ''}
        </div>
      </div>

      <div className="card stack" style={{ opacity: draft.vehicleId && draft.pumpImage ? 1 : 0.6 }}>
        <div className="row">
          <strong>3) Odometer photo</strong>
          <span className="muted">{draft.odometerImage ? 'Done' : 'Required'}</span>
        </div>
        <label
          className={`image-preview clickable${!draft.vehicleId || !draft.pumpImage || submitBusy ? ' disabled' : ''}`}
          aria-disabled={!draft.vehicleId || !draft.pumpImage || submitBusy}
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
            disabled={!draft.vehicleId || !draft.pumpImage || submitBusy}
          />
        </label>
        <div className="muted">
          {draft.odometerImage
            ? `Selected: ${draft.odometerImage.type || 'image'} (${Math.round(draft.odometerImage.size / 1024)} KB)`
            : ''}
        </div>
      </div>

      <div className="card stack" style={{ opacity: canExtract ? 1 : 0.6 }}>
        <div className="row">
          <strong>4) Review & submit</strong>
          <span className="muted">
            {imageBusy ? 'Processing…' : extractBusy ? 'Extracting…' : canSubmit ? 'Ready' : 'Waiting'}
          </span>
        </div>

        <div className="grid two">
          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label>Date</label>
              <button
                className="btn small"
                disabled={!canExtract || extractBusy || submitBusy}
                onClick={() => {
                  lastExtractSigRef.current = ''
                  setDraft((d) => ({ ...d, extracted: undefined }))
                }}
                type="button"
              >
                Retry extract
              </button>
            </div>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              disabled={submitBusy}
            />
          </div>
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
              disabled={!canExtract || submitBusy}
            />
          </div>
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
              disabled={!canExtract || submitBusy}
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
              disabled={!canExtract || submitBusy}
            />
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <label className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.isfilltofull)}
              onChange={(e) => setDraft((d) => ({ ...d, form: { ...form, isfilltofull: e.target.checked, missedfuelup: form.missedfuelup } }))}
              disabled={!canExtract || submitBusy}
            />
            <span>Fill to full</span>
          </label>

          <label className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.missedfuelup)}
              onChange={(e) => setDraft((d) => ({ ...d, form: { ...form, missedfuelup: e.target.checked, isfilltofull: form.isfilltofull } }))}
              disabled={!canExtract || submitBusy}
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
            disabled={!canExtract || submitBusy}
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
              setDraft({ date: todayISODate(), form: { isfilltofull: true, missedfuelup: false } })
            }}
            type="button"
          >
            Start over
          </button>
        </div>
      </div>

      <div className="muted">
        {imageBusy
          ? 'Processing images…'
          : extractBusy
            ? 'Extracting from photos…'
            : 'After an error, your draft stays saved so you can retry without retaking photos.'}
      </div>
    </div>
  )
}
