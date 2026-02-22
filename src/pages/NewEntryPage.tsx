import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import { loadConfig } from '../lib/config'
import { toMMDDYYYY, todayISODate } from '../lib/date'
import { clearDraft, loadDraft, saveDraft } from '../lib/draft'
import { compressImage } from '../lib/image'
import { extractFromImagesWithFallback } from '../lib/llm'
import { addGasRecord, getVehicles } from '../lib/lubelogger'
import type { Draft, Vehicle } from '../lib/types'
import { VehicleSelectStep } from './newEntry/VehicleSelectStep'
import { PhotoStep } from './newEntry/PhotoStep'
import { FuelingStep } from './newEntry/FuelingStep'
import { DetailsStep } from './newEntry/DetailsStep'

function numberOrEmpty(n: number | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : ''
}

function splitVehicleName(name: string): { year?: string; model: string } {
  const trimmed = name.trim()
  const m = trimmed.match(/^(\d{4})\s+(.+)$/)
  if (m) return { year: m[1], model: m[2] ?? trimmed }
  return { model: trimmed }
}

function llmMessageFromGeminiError(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e)
  const prefixes = [
    'Gemini did not return JSON:',
    'Gemini response did not match schema:',
    'Anthropic did not return JSON:',
    'Anthropic response did not match schema:',
  ]
  for (const p of prefixes) {
    if (msg.startsWith(p)) {
      const sliced = msg.slice(p.length).trim()
      // Avoid leaking raw JSON blobs into the UI (keeps messaging short).
      if (sliced.startsWith('{') || sliced.startsWith('[')) return null
      return sliced || null
    }
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

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7h3l1-2h2l1 2h3a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
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

export default function NewEntryPage() {
  const navigate = useNavigate()
  // Avoid re-loading config object every render (prevents effect loops).
  const cfg = useMemo(() => loadConfig(), [])

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [draft, setDraft] = useState<Draft>({ date: todayISODate() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vehiclesLoadProblem, setVehiclesLoadProblem] = useState<string | null>(null)
  const [reloadVehiclesTick, setReloadVehiclesTick] = useState(0)
  const [imageBusy, setImageBusy] = useState(false)
  const [extractBusy, setExtractBusy] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitValidationMessage, setSubmitValidationMessage] = useState<string | null>(null)
  const [extractFailed, setExtractFailed] = useState(false)
  const [extractLlmMessage, setExtractLlmMessage] = useState<string | null>(null)
  const [forceExtractTick, setForceExtractTick] = useState(0)
  const lastForceExtractTickRef = useRef(0)
  const lastExtractSigRef = useRef<string>('')
  const [successOpen, setSuccessOpen] = useState(false)

  const pumpCameraInputRef = useRef<HTMLInputElement | null>(null)
  const pumpGalleryInputRef = useRef<HTMLInputElement | null>(null)
  const odoCameraInputRef = useRef<HTMLInputElement | null>(null)
  const odoGalleryInputRef = useRef<HTMLInputElement | null>(null)

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
    document.title = 'QuickFillUp - New Entry'
  }, [])

  useEffect(() => {
    ;(async () => {
      if (!cfg) return
      setBusy(true)
      setError(null)
      setVehiclesLoadProblem(null)
      try {
        const v = await withTimeout(getVehicles(cfg, { includeSold: Boolean(cfg.showSoldVehicles) }), 6000, 'Loading vehicles')
        const existingDraft = await loadDraft()
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
    // Persist the draft (including images) to enable retries across reloads.
    void saveDraft(draft)
  }, [draft])

  async function onFileChange(key: 'pumpImage' | 'odometerImage', file: File | null) {
    if (!file) return
    setImageBusy(true)
    setError(null)
    setExtractFailed(false)
    setExtractLlmMessage(null)
    // Force a re-extract when either image changes.
    lastExtractSigRef.current = ''
    setForceExtractTick((n) => n + 1)
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
  const providersWithKeys = useMemo(() => {
    const orderedProviders = cfg?.llm.providerOrder?.length ? cfg.llm.providerOrder : (['gemini', 'anthropic'] as const)
    return orderedProviders
      .map((p) => ({
        provider: p,
        apiKey: p === 'anthropic' ? (cfg?.llm.anthropicApiKey ?? '') : (cfg?.llm.geminiApiKey ?? ''),
        model:
          p === 'anthropic'
            ? (cfg?.llm.anthropicModelFuel ?? 'claude-haiku-4-5')
            : (cfg?.llm.geminiModelFuel ?? 'gemini-2.5-flash'),
      }))
      .filter((p) => p.apiKey.trim())
  }, [cfg])

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
    const forced = forceExtractTick !== lastForceExtractTickRef.current
    if (providersWithKeys.length === 0) return
    // Don't auto-overwrite if the user has started entering values manually (unless forced via Retry).
    if (
      !forced &&
      (typeof form.odometer === 'number' || typeof form.fuelconsumed === 'number' || typeof form.cost === 'number')
    )
      return
    if (imageBusy || extractBusy || submitBusy) return
    if (draft.extracted) return

    const sig = `${draft.vehicleId}:${draft.pumpImage?.size}:${draft.odometerImage?.size}:${draft.date}`
    if (sig === lastExtractSigRef.current) return
    lastExtractSigRef.current = sig

    ;(async () => {
      if (forced) lastForceExtractTickRef.current = forceExtractTick
      setExtractBusy(true)
      setError(null)
      setExtractFailed(false)
      setExtractLlmMessage(null)
      try {
        const extracted = await extractFromImagesWithFallback({
          providers: providersWithKeys,
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
            odometer: typeof d.form?.odometer === 'number' ? d.form.odometer : extracted.odometer ?? undefined,
            fuelconsumed:
              typeof d.form?.fuelconsumed === 'number' ? d.form.fuelconsumed : extracted.fuelQuantity ?? undefined,
            cost: typeof d.form?.cost === 'number' ? d.form.cost : extracted.totalCost ?? undefined,
            isfilltofull: d.form?.isfilltofull ?? true,
            missedfuelup: d.form?.missedfuelup ?? false,
          },
        }))
      } catch (e) {
        setExtractFailed(true)
        setExtractLlmMessage(llmMessageFromGeminiError(e) ?? (e instanceof Error ? e.message : String(e)))
      } finally {
        setExtractBusy(false)
      }
    })()
  }, [
    canExtract,
    cfg,
    draft.date,
    draft.extracted,
    draft.odometerImage,
    draft.pumpImage,
    draft.vehicleId,
    extractBusy,
    forceExtractTick,
    imageBusy,
    providersWithKeys,
    submitBusy,
  ])

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
    setSubmitAttempted(true)
    if (!canSubmit) {
      setSubmitValidationMessage('Some fields are missing or invalid.')
      return
    }
    setSubmitBusy(true)
    setSubmitValidationMessage(null)
    setError(null)
    try {
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
      setSubmitAttempted(false)
      setSubmitValidationMessage(null)
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
        <TopNav />
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
      <TopNav />

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

      <VehicleSelectStep
        stepDone={step1Done}
        open={card1Open}
        busy={busy}
        submitBusy={submitBusy}
        vehicles={vehicles}
        selectedVehicleId={draft.vehicleId}
        onToggle={() => {
          if (!step1Done) return
          card1Touched.current = true
          setCard1Open((v) => !v)
        }}
        onSelectVehicle={(vehicleId) => {
          setExtractFailed(false)
          setExtractLlmMessage(null)
          setDraft((d) => ({
            ...d,
            vehicleId,
            extracted: undefined,
          }))
        }}
        splitVehicleName={splitVehicleName}
        doneIcon={<DoneIcon />}
      />

      <PhotoStep
        stepNumber={2}
        title="Pump / receipt photo"
        stepDone={step2Done}
        open={card2Open}
        enabled={step1Done}
        submitBusy={submitBusy}
        imageUrl={pumpUrl}
        selectedLabel={draft.pumpImage ? 'Selected' : ''}
        cameraInputRef={pumpCameraInputRef}
        fileInputRef={pumpGalleryInputRef}
        accept="image/*"
        capture="environment"
        onToggle={() => {
          if (!step2Done) return
          card2Touched.current = true
          setCard2Open((v) => !v)
        }}
        onPickCamera={() => pumpCameraInputRef.current?.click()}
        onPickFiles={() => pumpGalleryInputRef.current?.click()}
        onFileSelected={(file) => onFileChange('pumpImage', file)}
        doneIcon={<DoneIcon />}
        cameraIcon={<CameraIcon />}
        fileIcon={<FileIcon />}
      />

      <PhotoStep
        stepNumber={3}
        title="Odometer photo"
        stepDone={step3Done}
        open={card3Open}
        enabled={step1Done && step2Done}
        submitBusy={submitBusy}
        imageUrl={odoUrl}
        selectedLabel={draft.odometerImage ? 'Selected' : ''}
        cameraInputRef={odoCameraInputRef}
        fileInputRef={odoGalleryInputRef}
        accept="image/*"
        capture="environment"
        onToggle={() => {
          if (!step3Done) return
          card3Touched.current = true
          setCard3Open((v) => !v)
        }}
        onPickCamera={() => odoCameraInputRef.current?.click()}
        onPickFiles={() => odoGalleryInputRef.current?.click()}
        onFileSelected={(file) => onFileChange('odometerImage', file)}
        doneIcon={<DoneIcon />}
        cameraIcon={<CameraIcon />}
        fileIcon={<FileIcon />}
      />

      <FuelingStep
        canEditDetails={canEditDetails}
        extractBusy={extractBusy}
        canExtract={canExtract}
        submitBusy={submitBusy}
        extractFailed={extractFailed}
        extractLlmMessage={extractLlmMessage}
        hasLlmResponse={Boolean(draft.extracted) || extractFailed}
        submitAttempted={submitAttempted}
        odometerInvalid={!(typeof form.odometer === 'number' && Number.isFinite(form.odometer) && form.odometer >= 0)}
        fuelQuantityInvalid={!(typeof form.fuelconsumed === 'number' && Number.isFinite(form.fuelconsumed) && form.fuelconsumed > 0)}
        totalCostInvalid={!(typeof form.cost === 'number' && Number.isFinite(form.cost) && form.cost > 0)}
        odometer={numberOrEmpty(form.odometer)}
        fuelQuantity={numberOrEmpty(form.fuelconsumed)}
        totalCost={numberOrEmpty(form.cost)}
        onRetry={() => {
          setExtractFailed(false)
          setExtractLlmMessage(null)
          lastExtractSigRef.current = ''
          setForceExtractTick((n) => n + 1)
          setDraft((d) => ({ ...d, extracted: undefined }))
        }}
        onOdometerChange={(value) => {
          const n = Number(value)
          setDraft((d) => ({
            ...d,
            form: { ...form, odometer: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
          }))
          if (submitAttempted) setSubmitValidationMessage(null)
        }}
        onFuelQuantityChange={(value) => {
          const n = Number(value)
          setDraft((d) => ({
            ...d,
            form: { ...form, fuelconsumed: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
          }))
          if (submitAttempted) setSubmitValidationMessage(null)
        }}
        onTotalCostChange={(value) => {
          const n = Number(value)
          setDraft((d) => ({
            ...d,
            form: { ...form, cost: Number.isFinite(n) ? n : undefined, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup },
          }))
          if (submitAttempted) setSubmitValidationMessage(null)
        }}
        refreshIcon={<RefreshIcon />}
      />

      <DetailsStep
        canEditDetails={canEditDetails}
        submitBusy={submitBusy}
        extractBusy={extractBusy}
        imageBusy={imageBusy}
        date={draft.date}
        isFillToFull={Boolean(form.isfilltofull)}
        missedFuelUp={Boolean(form.missedfuelup)}
        notes={form.notes ?? ''}
        submitAttempted={submitAttempted}
        canSubmit={canSubmit}
        submitValidationMessage={submitValidationMessage}
        onDateChange={(date) => setDraft((d) => ({ ...d, date }))}
        onFillToFullChange={(v) => setDraft((d) => ({ ...d, form: { ...form, isfilltofull: v, missedfuelup: form.missedfuelup } }))}
        onMissedFuelUpChange={(v) => setDraft((d) => ({ ...d, form: { ...form, missedfuelup: v, isfilltofull: form.isfilltofull } }))}
        onNotesChange={(v) =>
          setDraft((d) => ({ ...d, form: { ...form, notes: v, isfilltofull: form.isfilltofull, missedfuelup: form.missedfuelup } }))
        }
        onSubmit={onSubmit}
        onStartOver={async () => {
          await clearDraft()
          lastExtractSigRef.current = ''
          setExtractFailed(false)
          setExtractLlmMessage(null)
          setSubmitAttempted(false)
          setSubmitValidationMessage(null)
          setDraft({ date: todayISODate(), form: { isfilltofull: true, missedfuelup: false } })
        }}
        submitLabel={submitBusy ? 'Submitting…' : 'Submit to LubeLogger'}
        primaryButton={
          <button className="btn primary" disabled={submitBusy || extractBusy} onClick={onSubmit} type="button">
            {submitBusy ? 'Submitting…' : 'Submit to LubeLogger'}
          </button>
        }
      />

    </div>
  )
}
