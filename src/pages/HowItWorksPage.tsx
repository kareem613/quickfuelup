import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopNav from '../components/TopNav'
import { dismissHowItWorks } from '../lib/howItWorks'
import { getDeferredPrompt, isRunningStandalone, setDeferredPrompt } from '../lib/pwaInstall'

export default function HowItWorksPage(props: { onDismiss?: () => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const next = params.get('next') || '/new'
  const [installPromptReady, setInstallPromptReady] = useState(Boolean(getDeferredPrompt()))

  useEffect(() => {
    document.title = 'QuickFillUp - How it works'
  }, [])

  useEffect(() => {
    const onAny = () => setInstallPromptReady(Boolean(getDeferredPrompt()))
    window.addEventListener('beforeinstallprompt', onAny)
    window.addEventListener('appinstalled', onAny)
    return () => {
      window.removeEventListener('beforeinstallprompt', onAny)
      window.removeEventListener('appinstalled', onAny)
    }
  }, [])

  return (
    <div className="container stack">
      <TopNav />

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Welcome 👋</h3>
        <div className="muted">
          QuickFillUp is a small web app that helps you log fuel fill-ups and service records to your LubeLogger
          instance faster, using AI to pre-fill forms.
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div>
            <strong>Setup</strong>
            <ol style={{ margin: '8px 0 0 18px' }}>
              <li>
                In <strong>Settings</strong>, enter your LubeLogger Base URL and an API key with role{' '}
                <strong>Editor</strong>.
              </li>
              <li>
                Add at least one <strong>AI</strong> key (Gemini or Anthropic) for extraction.
              </li>
              <li>
                Tap <strong>Test connection</strong> to make sure everything can talk to your LubeLogger instance.
              </li>
              <li>Optional: Pick which model to use for Fuel vs Service.</li>
              <li>
                Optional: Install the app. <strong>Highly recommended</strong> for quick access from your home screen.
              </li>
            </ol>
          </div>

          <div>
            <strong>Logging a fill-up</strong>
            <ol style={{ margin: '8px 0 0 18px' }}>
              <li>Select your vehicle.</li>
              <li>Take a photo of the pump readout and a photo of the odometer.</li>
              <li>Confirm the extracted values (or type them manually), then submit.</li>
            </ol>
          </div>

          <div>
            <strong>Logging a service/repair/upgrade record</strong>
            <ol style={{ margin: '8px 0 0 18px' }}>
              <li>Upload an invoice/receipt (PDF or image).</li>
              <li>Wait for extraction (it may create multiple records from one invoice).</li>
              <li>Select a vehicle (auto-selected when possible).</li>
              <li>Review each record and submit.</li>
            </ol>
          </div>

          <div className="muted">
            Tip: If submission fails, your images/docs stay saved until it succeeds — so you can retry without
            re-uploading.
          </div>

          <div className="muted">
            Privacy: Nothing is sent anywhere except (1) to the AI provider you configured, using your own AI key, when
            you run extraction, and (2) to your own LubeLogger instance, using your own API key, when you submit
            (including uploading the invoice as an attachment).
          </div>
        </div>

        <div className="actions">
          {!isRunningStandalone() ? (
            <button
              className="btn"
              type="button"
              style={{ width: '100%' }}
              disabled={!installPromptReady}
              onClick={async () => {
                const p = getDeferredPrompt()
                if (!p) return
                await p.prompt()
                try {
                  await p.userChoice
                } finally {
                  setDeferredPrompt(null)
                  setInstallPromptReady(false)
                }
              }}
            >
              Install app
            </button>
          ) : null}
          <button
            className="btn primary"
            type="button"
            style={{ width: '100%' }}
            onClick={() => {
              dismissHowItWorks()
              props.onDismiss?.()
              navigate(next, { replace: true })
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
