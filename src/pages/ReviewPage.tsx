import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadConfig } from '../lib/config'
import { toMMDDYYYY, todayISODate } from '../lib/date'
import { clearDraft, loadDraft, saveDraft } from '../lib/draft'
import { extractFromImages } from '../lib/gemini'
import { addGasRecord } from '../lib/lubelogger'
import type { Draft } from '../lib/types'

function numberOrEmpty(n: number | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : ''
}

export default function ReviewPage() {
  const navigate = useNavigate()
  const cfg = loadConfig()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'QuickFuelUp - Review'
  }, [])

  useEffect(() => {
    ;(async () => {
      const d = await loadDraft()
      setDraft(
        d ?? {
          date: todayISODate(),
          form: { isfilltofull: true, missedfuelup: false },
        },
      )
    })()
  }, [])

  const pumpUrl = useMemo(() => {
    if (!draft?.pumpImage) return null
    return URL.createObjectURL(draft.pumpImage)
  }, [draft?.pumpImage])

  const odoUrl = useMemo(() => {
    if (!draft?.odometerImage) return null
    return URL.createObjectURL(draft.odometerImage)
  }, [draft?.odometerImage])

  useEffect(() => {
    return () => {
      if (pumpUrl) URL.revokeObjectURL(pumpUrl)
      if (odoUrl) URL.revokeObjectURL(odoUrl)
    }
  }, [pumpUrl, odoUrl])

  if (!cfg) return <div className="container">Missing config. Go to <Link to="/settings">Settings</Link>.</div>
  if (!draft) return <div className="container">Loading…</div>
  if (!draft.vehicleId || !draft.pumpImage || !draft.odometerImage) {
    return (
      <div className="container stack">
        <div className="card stack">
          <div>Draft is incomplete. Please select vehicle and photos again.</div>
          <Link className="btn primary" to="/new">
            Back
          </Link>
        </div>
      </div>
    )
  }

  const form = draft.form ?? { isfilltofull: true, missedfuelup: false }

  async function persist(next: Draft) {
    setDraft(next)
    await saveDraft(next)
  }

  async function onExtract() {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const cfg2 = cfg!
      const d = draft!
      const extracted = await extractFromImages({
        apiKey: cfg2.geminiApiKey,
        pumpImage: d.pumpImage!,
        odometerImage: d.odometerImage!,
      })

      const next: Draft = {
        ...d,
        extracted,
        form: {
          ...form,
          odometer: extracted.odometer ?? undefined,
          fuelconsumed: extracted.fuelQuantity ?? undefined,
          cost: extracted.totalCost ?? undefined,
          isfilltofull: form.isfilltofull ?? true,
          missedfuelup: form.missedfuelup ?? false,
        },
      }
      await persist(next)
      setInfo('Extracted values. Please review before submitting.')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit() {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (typeof form.odometer !== 'number') throw new Error('Odometer is required')
      if (typeof form.fuelconsumed !== 'number') throw new Error('Fuel quantity is required')
      if (typeof form.cost !== 'number') throw new Error('Total cost is required')

      const cfg2 = cfg!
      const d = draft!
      const res = await addGasRecord(cfg2, {
        vehicleId: d.vehicleId!,
        dateMMDDYYYY: toMMDDYYYY(d.date),
        odometer: form.odometer,
        fuelconsumed: form.fuelconsumed,
        cost: form.cost,
        isfilltofull: Boolean(form.isfilltofull),
        missedfuelup: Boolean(form.missedfuelup),
        notes: form.notes?.trim() ? form.notes.trim() : undefined,
      })

      await clearDraft()
      setInfo(`Submitted!\n${typeof res === 'string' ? res : JSON.stringify(res)}`)
      navigate('/new')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Review</h2>
        <Link to="/new" className="muted">
          Back
        </Link>
      </div>

      {error && <div className="error">{error}</div>}
      {info && <div className="card">{info}</div>}

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          {pumpUrl && <img src={pumpUrl} alt="Pump" style={{ width: 140, borderRadius: 10 }} />}
          {odoUrl && <img src={odoUrl} alt="Odometer" style={{ width: 140, borderRadius: 10 }} />}
        </div>

        <div className="field">
          <label>Date</label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => persist({ ...draft, date: e.target.value })}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label>Odometer</label>
          <input
            inputMode="numeric"
            value={numberOrEmpty(form.odometer)}
            onChange={(e) => {
              const n = Number(e.target.value)
              void persist({
                ...draft,
                form: { ...form, odometer: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
              })
            }}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label>Fuel quantity (fuelconsumed)</label>
          <input
            inputMode="decimal"
            value={numberOrEmpty(form.fuelconsumed)}
            onChange={(e) => {
              const n = Number(e.target.value)
              void persist({
                ...draft,
                form: { ...form, fuelconsumed: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
              })
            }}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label>Total cost</label>
          <input
            inputMode="decimal"
            value={numberOrEmpty(form.cost)}
            onChange={(e) => {
              const n = Number(e.target.value)
              void persist({
                ...draft,
                form: { ...form, cost: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
              })
            }}
            disabled={busy}
          />
        </div>

        <label className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={Boolean(form.isfilltofull)}
            onChange={(e) => persist({ ...draft, form: { ...form, isfilltofull: e.target.checked, missedfuelup: form.missedfuelup } })}
            disabled={busy}
          />
          <span>Fill to full</span>
        </label>

        <label className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={Boolean(form.missedfuelup)}
            onChange={(e) => persist({ ...draft, form: { ...form, missedfuelup: e.target.checked, isfilltofull: form.isfilltofull } })}
            disabled={busy}
          />
          <span>Missed fuel-up</span>
        </label>

        <div className="field">
          <label>Notes (optional)</label>
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => persist({ ...draft, form: { ...form, notes: e.target.value, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup } })}
            disabled={busy}
          />
        </div>

        <div className="row" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onExtract} disabled={busy}>
            {busy ? 'Working…' : 'Extract with Gemini'}
          </button>
          <button className="btn primary" onClick={onSubmit} disabled={busy}>
            Submit to LubeLogger
          </button>
        </div>

        <div className="muted">
          If submission fails, your draft (including photos) stays saved so you can retry.
        </div>
      </div>
    </div>
  )
}
