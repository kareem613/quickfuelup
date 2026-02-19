import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadConfig } from '../lib/config'
import { todayISODate } from '../lib/date'
import { clearDraft, loadDraft, saveDraft } from '../lib/draft'
import { getVehicles } from '../lib/lubelogger'
import type { Draft, Vehicle } from '../lib/types'

export default function NewEntryPage() {
  const navigate = useNavigate()
  const cfg = loadConfig()

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [draft, setDraft] = useState<Draft>({ date: todayISODate() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setDraft(
          existingDraft ?? {
            date: todayISODate(),
            form: { isfilltofull: true, missedfuelup: false },
          },
        )
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

  async function onFileChange(key: 'pumpImage' | 'odometerImage', file: File | null) {
    if (!file) return
    setDraft((d) => ({ ...d, [key]: file }))
  }

  const canContinue = Boolean(draft.vehicleId && draft.pumpImage && draft.odometerImage)

  return (
    <div className="container stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>New Fuel Entry</h2>
        <Link to="/settings" className="muted">
          Settings
        </Link>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card stack">
        <div className="field">
          <label>Vehicle</label>
          <select
            value={draft.vehicleId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, vehicleId: Number(e.target.value) }))}
            disabled={busy}
          >
            <option value="" disabled>
              {busy ? 'Loading…' : 'Select a vehicle'}
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} (#{v.id})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Pump photo (total + quantity)</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => onFileChange('pumpImage', e.target.files?.[0] ?? null)}
          />
          <div className="muted">{draft.pumpImage ? `Selected: ${(draft.pumpImage as any).name ?? 'image'}` : ''}</div>
        </div>

        <div className="field">
          <label>Odometer photo</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => onFileChange('odometerImage', e.target.files?.[0] ?? null)}
          />
          <div className="muted">
            {draft.odometerImage ? `Selected: ${(draft.odometerImage as any).name ?? 'image'}` : ''}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <button className="btn primary" disabled={!canContinue} onClick={() => navigate('/review')}>
            Continue
          </button>
          <button
            className="btn"
            onClick={async () => {
              await clearDraft()
              setDraft({ date: todayISODate(), form: { isfilltofull: true, missedfuelup: false } })
            }}
          >
            Clear draft
          </button>
        </div>
      </div>

      <div className="muted">
        Photos are stored locally only until a successful submission, so you can retry if something fails.
      </div>
    </div>
  )
}

