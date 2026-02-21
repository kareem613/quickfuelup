import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { dismissHowItWorks } from '../lib/howItWorks'

export default function HowItWorksPage(props: { onDismiss?: () => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const next = params.get('next') || '/new'

  useEffect(() => {
    document.title = 'QuickFillUp - How it works'
  }, [])

  return (
    <div className="container stack">
      <div className="row">
        <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <img src="/icons/ios/32.png" alt="" width={24} height={24} style={{ borderRadius: 6 }} />
          <h2 style={{ margin: 0 }}>QuickFillUp</h2>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Welcome 👋</h3>
        <div className="muted">
          QuickFillUp is a small web app that helps you log a fuel fill-up to your LubeLogger instance fast — using two
          photos and AI to pre-fill the numbers.
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
                Add at least one <strong>AI</strong> key (Gemini or Anthropic) for photo extraction.
              </li>
              <li>
                Tap <strong>Test connection</strong> to make sure everything can talk to your LubeLogger instance.
              </li>
              <li>
                Optional: Install the app to get an icon on your home screen.
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
              <li>Select your vehicle.</li>
              <li>Select an invoice/receipt file (PDF or image).</li>
              <li>Confirm the extracted values (including extra fields), then submit.</li>
            </ol>
          </div>

          <div className="muted">
            Tip: If submission fails, your photos stay saved until it succeeds — so you can retry without taking them
            again.
          </div>

          <div className="muted">
            Privacy: Nothing is sent anywhere except (1) to the AI provider you configured, using your own AI key, when
            you run extraction, and (2) to your own LubeLogger instance, using your own API key, when you submit
            (including uploading the invoice as an attachment).
          </div>
        </div>

        <div className="actions">
          <button
            className="btn primary"
            type="button"
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
