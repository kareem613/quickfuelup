import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import { loadConfig } from '../lib/config'
import { todayISODate, toMMDDYYYY } from '../lib/date'
import { clearServiceDraft, loadServiceDraft, saveServiceDraft } from '../lib/serviceDraft'
import { compressImage } from '../lib/image'
import { extractServiceFromDocumentWithFallback } from '../lib/llm'
import { addServiceLikeRecord, getExtraFields, getVehicles, uploadDocuments } from '../lib/lubelogger'
import { pdfToTextAndImages } from '../lib/pdf'
import type { ServiceDraft, ServiceDraftRecord, ServiceLikeRecordType, Vehicle } from '../lib/types'
import { InvoiceStep } from './newServiceRecord/InvoiceStep'
import { ExtractStep } from './newServiceRecord/ExtractStep'
import { VehicleStep } from './newServiceRecord/VehicleStep'
import { ReviewStep } from './newServiceRecord/ReviewStep'

function numberOrEmpty(n: number | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : ''
}

function splitVehicleName(name: string): { year?: string; model: string } {
  const trimmed = name.trim()
  const m = trimmed.match(/^(\d{4})\s+(.+)$/)
  if (m) return { year: m[1], model: m[2] ?? trimmed }
  return { model: trimmed }
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

  const docCameraInputRef = useRef<HTMLInputElement | null>(null)
  const docFileInputRef = useRef<HTMLInputElement | null>(null)

  const [card1Open, setCard1Open] = useState(true)
  const [card2Open, setCard2Open] = useState(true)
  const [card3Open, setCard3Open] = useState(true)
  const card1Touched = useRef(false)
  const card2Touched = useRef(false)
  const card3Touched = useRef(false)

  const providersWithKeys = useMemo(() => {
    const orderedProviders = cfg?.llm.providerOrder?.length ? cfg.llm.providerOrder : (['gemini', 'anthropic'] as const)
    return orderedProviders
      .map((p) => ({
        provider: p,
        apiKey: p === 'anthropic' ? (cfg?.llm.anthropicApiKey ?? '') : (cfg?.llm.geminiApiKey ?? ''),
        model:
          p === 'anthropic'
            ? (cfg?.llm.anthropicModelService ?? 'claude-sonnet-4-5')
            : (cfg?.llm.geminiModelService ?? 'gemini-2.5-pro'),
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

  const selectedVehicleName = useMemo(() => {
    const v = vehicles.find((x) => x.id === draft.vehicleId)
    return v?.name ?? null
  }, [draft.vehicleId, vehicles])

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
          withTimeout(getVehicles(cfg, { includeSold: Boolean(cfg.showSoldVehicles) }), 6000, 'Loading vehicles'),
          withTimeout(getExtraFields(cfg), 6000, 'Loading extra fields'),
          loadServiceDraft(),
        ])
        setVehicles(v)
        setExtraFieldDefs(defs)
        const initial: ServiceDraft = existingDraft ?? { date: todayISODate() }
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
        records: undefined,
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

  const step1Done = Boolean(draft.document && (draft.documentImages?.length || draft.documentText))
  const hasRecords = Boolean(draft.records?.length)
  const step2Done = Boolean(draft.extracted || extractFailed || hasRecords)
  const step3Done = Boolean(
    (draft.records?.length ? draft.records.every((r) => typeof r.form.vehicleId === 'number') : false) || draft.vehicleId,
  )
  const extractedWarnings = draft.extracted?.warnings ?? []
  const keepExtractOpen = extractFailed || extractedWarnings.length > 0

  function hasWarningForRecordField(recordIdx: number, field: string) {
    return extractedWarnings.some((w) => w.path === `/records/${recordIdx}/${field}`)
  }

  const anyVehicleIdWarning = extractedWarnings.some((w) => /^\/records\/\d+\/vehicleId$/.test(w.path))
  const anyVehicleIdInvalid = (draft.records ?? []).some((r) => r.validationAttempted && typeof r.form.vehicleId !== 'number')

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
    if (!card2Touched.current) setCard2Open(keepExtractOpen)
  }, [keepExtractOpen, step2Done])

  useEffect(() => {
    if (!step3Done) {
      setCard3Open(true)
      card3Touched.current = false
      return
    }
    if (!card3Touched.current) setCard3Open(anyVehicleIdWarning)
  }, [anyVehicleIdWarning, step3Done])

  const canExtractAny = Boolean(cfg && draft.document && providersWithKeys.length && (draft.documentImages?.length || draft.documentText))

  function updateRecord(id: string, fn: (r: ServiceDraftRecord) => ServiceDraftRecord) {
    setDraft((d) => ({
      ...d,
      records: (d.records ?? []).map((r) => (r.id === id ? fn(r) : r)),
    }))
  }

  function updateRecordAndClearWarnings(params: {
    id: string
    clearPaths: string[]
    fn: (r: ServiceDraftRecord) => ServiceDraftRecord
  }) {
    setDraft((d) => {
      const extracted =
        d.extracted?.warnings?.length && params.clearPaths.length
          ? { ...d.extracted, warnings: d.extracted.warnings.filter((w) => !params.clearPaths.includes(w.path)) }
          : d.extracted
      return {
        ...d,
        extracted,
        records: (d.records ?? []).map((r) => (r.id === params.id ? params.fn(r) : r)),
      }
    })
  }

  useEffect(() => {
    if (!cfg) return
    if (!draft.document) return
    if (vehicles.length === 0) return
    if (providersWithKeys.length === 0) return
    const forced = forceExtractTick !== lastForceExtractTickRef.current
    if (docBusy || extractBusy || submitBusy) return
    if (!forced && draft.records?.length) return
    if (draft.extracted) return

    const sig = `${draft.document.size}:${draft.document.name}:${draft.documentImages?.[0]?.size ?? 0}:${draft.documentText?.length ?? 0}:${draft.date}:${vehicles.length}`
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
          onThinking: (m) => setExtractMessage(m),
        })

        if (extracted.explanation) setExtractMessage(extracted.explanation)

        const anySuggestedVehicle = extracted.records
          .map((r) => r.vehicleId)
          .find((id) => typeof id === 'number' && vehicles.some((v) => v.id === id))

        setDraft((d) => {
          const currentVehicleId = d.vehicleId
          const baseVehicleId =
            (anySuggestedVehicle && typeof currentVehicleId === 'number' && currentVehicleId !== anySuggestedVehicle
              ? anySuggestedVehicle
              : (!vehicleTouched.current && anySuggestedVehicle ? anySuggestedVehicle : currentVehicleId)) ?? null

          // If the LLM suggests the same vehicle the user already selected (explicitly), treat vehicleId warnings as resolved/noise.
          const cleanedExtracted =
            vehicleTouched.current &&
            anySuggestedVehicle &&
            typeof currentVehicleId === 'number' &&
            currentVehicleId === anySuggestedVehicle
              ? {
                  ...extracted,
                  warnings: (extracted.warnings ?? []).filter((w) => !/^\/records\/\d+\/vehicleId$/.test(w.path)),
                }
              : extracted

          const shouldWarnVehicle = Boolean(
            anySuggestedVehicle &&
              (!vehicleTouched.current || (typeof currentVehicleId === 'number' && currentVehicleId !== anySuggestedVehicle)),
          )

          const baseWarnings = cleanedExtracted.warnings ?? []
          const warnings =
            shouldWarnVehicle && cleanedExtracted.records.length
              ? (() => {
                  const next = baseWarnings.slice()
                  for (let i = 0; i < cleanedExtracted.records.length; i++) {
                    const path = `/records/${i}/vehicleId`
                    if (next.some((w) => w.path === path)) continue
                    next.push({
                      path,
                      reason: typeof currentVehicleId === 'number' && currentVehicleId !== anySuggestedVehicle ? 'conflict' : 'guessed',
                      message:
                        typeof currentVehicleId === 'number' && currentVehicleId !== anySuggestedVehicle
                          ? 'Vehicle differs from your selection; please confirm.'
                          : 'Vehicle was selected automatically; please confirm.',
                    })
                  }
                  return next
                })()
              : baseWarnings

          const extractedWithWarnings = shouldWarnVehicle ? { ...cleanedExtracted, warnings } : cleanedExtracted

          const records: ServiceDraftRecord[] = extractedWithWarnings.records.map((r, idx) => {
            const vehicleId =
              typeof r.vehicleId === 'number' && vehicles.some((v) => v.id === r.vehicleId) ? r.vehicleId : baseVehicleId
            const iso = normalizeToISODate(r.date)
            return {
              id: `rec-${idx + 1}`,
              status: 'pending',
              extracted: r,
              form: {
                vehicleId: vehicleId ?? undefined,
                recordType: r.recordType ?? undefined,
                date: iso ?? undefined,
                odometer: r.odometer ?? undefined,
                description: r.description ?? undefined,
                cost: r.totalCost ?? undefined,
                notes: r.notes ?? undefined,
                tags: r.tags ?? undefined,
                extraFields: (r.extraFields ?? undefined) ?? [],
              },
            }
          })

          return {
            ...d,
            // If the LLM suggests a different vehicle, prefer it over the current selection.
            vehicleId: baseVehicleId ?? d.vehicleId,
            extracted: extractedWithWarnings,
            records,
          }
        })
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
    providersWithKeys,
    submitBusy,
    vehicles,
  ])

  function mappedRecordType(t: ServiceLikeRecordType | undefined) {
    return t === 'repair' ? 'RepairRecord' : t === 'upgrade' ? 'UpgradeRecord' : 'ServiceRecord'
  }

  function requiredExtraFieldsFor(t: ServiceLikeRecordType | undefined) {
    const group = extraFieldDefs.find((g) => g.recordType === mappedRecordType(t))
    return (group?.extraFields ?? []).filter((x) => String(x.isRequired ?? '').toLowerCase() === 'true').map((x) => x.name)
  }

  function recordCanSubmit(r: ServiceDraftRecord) {
    const req = requiredExtraFieldsFor(r.form.recordType)
    const date = r.form.date ?? draft.date
    return (
      typeof r.form.vehicleId === 'number' &&
      Boolean(r.form.recordType) &&
      typeof date === 'string' &&
      Boolean(date) &&
      typeof r.form.odometer === 'number' &&
      Number.isFinite(r.form.odometer) &&
      r.form.odometer >= 0 &&
      typeof r.form.cost === 'number' &&
      Number.isFinite(r.form.cost) &&
      r.form.cost > 0 &&
      typeof r.form.description === 'string' &&
      Boolean(r.form.description.trim()) &&
      req.every((name) => (r.form.extraFields ?? []).some((ef) => ef.name === name && ef.value.trim()))
    )
  }

  async function onSubmitRecord(id: string) {
    if (!cfg) return
    if (!draft.document) {
      setError('Please select a document.')
      return
    }
    const rec = (draft.records ?? []).find((r) => r.id === id)
    if (!rec) return
    if (!recordCanSubmit(rec)) {
      const missingVehicle = typeof rec.form.vehicleId !== 'number'
      if (missingVehicle) setCard3Open(true)
      setDraft((d) => ({
        ...d,
        records: (d.records ?? []).map((r) => (r.id === id ? { ...r, validationAttempted: true } : r)),
      }))
      return
    }

    setSubmitBusy(true)
    setError(null)
    try {
      const file = new File([draft.document.blob], draft.document.name, { type: draft.document.type || undefined })
      const uploaded = draft.uploadedFiles?.length ? draft.uploadedFiles : await uploadDocuments(cfg, [file])
      if (!draft.uploadedFiles?.length) setDraft((d) => ({ ...d, uploadedFiles: uploaded }))

      setDraft((d) => ({
        ...d,
        records: (d.records ?? []).map((r) =>
          r.id === id ? { ...r, status: 'submitting' as const, submitError: undefined } : r,
        ),
      }))

      const res = await addServiceLikeRecord(cfg, {
        recordType: rec.form.recordType!,
        vehicleId: rec.form.vehicleId!,
        dateMMDDYYYY: toMMDDYYYY(rec.form.date ?? draft.date),
        odometer: rec.form.odometer!,
        description: rec.form.description!.trim(),
        cost: rec.form.cost!,
        notes: rec.form.notes?.trim() ? rec.form.notes.trim() : undefined,
        tags: rec.form.tags?.trim() ? rec.form.tags.trim() : undefined,
        extraFields: (rec.form.extraFields ?? []).filter((x) => x.name.trim() && x.value.trim()),
        files: uploaded,
      })

      console.log('Submitted', res)
      let allSubmitted = false
      setDraft((d) => {
        const nextRecords = (d.records ?? []).map((r) =>
          r.id === id ? { ...r, status: 'submitted' as const, submitError: undefined } : r,
        )
        allSubmitted = nextRecords.length > 0 && nextRecords.every((r) => r.status === 'submitted')
        return { ...d, records: nextRecords }
      })

      if (allSubmitted) {
        await clearServiceDraft()
        vehicleTouched.current = false
        setDraft({ date: todayISODate() })
        lastExtractSigRef.current = ''
        setSuccessOpen(true)
      }
      console.log('Submitted', res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setDraft((d) => ({
        ...d,
        records: (d.records ?? []).map((r) => (r.id === id ? { ...r, status: 'failed' as const, submitError: msg } : r)),
      }))
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

      <InvoiceStep
        stepDone={step1Done}
        open={card1Open}
        onToggle={() => {
          if (!step1Done) return
          card1Touched.current = true
          setCard1Open((v) => !v)
        }}
        previewUrl={previewUrl}
        docBusy={docBusy}
        submitBusy={submitBusy}
        docCameraInputRef={docCameraInputRef}
        docFileInputRef={docFileInputRef}
        onDocumentChange={onDocumentChange}
        selectedLabel={`${draft.document ? `Selected: ${draft.document.name}` : ''}${draft.document && draft.documentText ? ` (text extracted)` : ''}`}
        doneIcon={<DoneIcon />}
        cameraIcon={<CameraIcon />}
        fileIcon={<FileIcon />}
      />

      <ExtractStep
        step1Done={step1Done}
        stepDone={step2Done}
        open={card2Open}
        extracting={extractBusy}
        canExtractAny={canExtractAny}
        submitBusy={submitBusy}
        extractFailed={extractFailed}
        extractMessage={extractMessage}
        keepOpen={keepExtractOpen}
        onToggle={() => {
          if (!step1Done) return
          if (!step2Done) return
          card2Touched.current = true
          setCard2Open((v) => !v)
        }}
        onRetry={() => {
          setExtractFailed(false)
          setExtractMessage(null)
          lastExtractSigRef.current = ''
          setForceExtractTick((n) => n + 1)
          setDraft((d) => ({ ...d, extracted: undefined, records: undefined }))
        }}
        doneIcon={<DoneIcon />}
        refreshIcon={<RefreshIcon />}
      />

      <VehicleStep
        step1Done={step1Done}
        stepDone={step3Done}
        open={card3Open}
        anyInvalid={anyVehicleIdInvalid}
        selectedVehicleName={selectedVehicleName}
        vehicles={vehicles}
        selectedVehicleId={draft.vehicleId}
        anyVehicleWarning={anyVehicleIdWarning}
        busy={busy}
        submitBusy={submitBusy}
        onToggle={() => {
          if (!step1Done) return
          card3Touched.current = true
          setCard3Open((v) => !v)
        }}
        onSelectVehicle={(vehicleId) => {
          vehicleTouched.current = true
          setDraft((d) => ({
            ...d,
            vehicleId,
            extracted:
              d.extracted?.warnings?.length
                ? { ...d.extracted, warnings: d.extracted.warnings.filter((w) => !/^\/records\/\d+\/vehicleId$/.test(w.path)) }
                : d.extracted,
            records: (d.records ?? []).map((r) => (typeof r.form.vehicleId === 'number' ? r : { ...r, form: { ...r.form, vehicleId } })),
          }))
        }}
        splitVehicleName={splitVehicleName}
        doneIcon={<DoneIcon />}
      />

      <ReviewStep
        step1Done={step1Done}
        step2Done={step2Done}
        hasRecords={hasRecords}
        draftDate={draft.date}
        records={draft.records ?? []}
        submitBusy={submitBusy}
        extractBusy={extractBusy}
        docBusy={docBusy}
        numberOrEmpty={numberOrEmpty}
        requiredExtraFieldsFor={requiredExtraFieldsFor}
        recordCanSubmit={recordCanSubmit}
        mappedRecordType={mappedRecordType}
        extraFieldNamesByRecordType={extraFieldNamesByRecordType}
        updateRecord={updateRecord}
        updateRecordAndClearWarnings={updateRecordAndClearWarnings}
        hasWarningForRecordField={hasWarningForRecordField}
        onSubmitRecord={onSubmitRecord}
        doneIcon={<DoneIcon />}
      />

      <div className="actions">
        <button
          className="btn"
          disabled={submitBusy || extractBusy || docBusy}
          onClick={async () => {
            await clearServiceDraft()
            vehicleTouched.current = false
            lastExtractSigRef.current = ''
            setExtractFailed(false)
            setExtractMessage(null)
            setDraft({ date: todayISODate() })
          }}
          type="button"
        >
          Start over
        </button>
      </div>

      {docBusy || extractBusy ? <div className="muted">{docBusy ? 'Processing document…' : 'Extracting from document…'}</div> : null}
    </div>
  )
}
