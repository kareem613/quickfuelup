import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
          QuickFillUp is a tiny PWA that helps you log a fuel fill-up to your LubeLogger instance fast — using two photos
          and an LLM to pre-fill the numbers.
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div>
            <strong>How to use it</strong>
            <ol style={{ margin: '8px 0 0 18px' }}>
              <li>Tap <strong>Settings</strong> and enter your LubeLogger Base URL + API key.</li>
              <li>Select your vehicle.</li>
              <li>Take a photo of the pump readout and a photo of the odometer.</li>
              <li>Confirm the extracted values (or type them manually), then submit.</li>
            </ol>
          </div>

          <div className="muted">
            Tip: If submission fails, your photos stay saved until it succeeds — so you can retry without taking them
            again.
          </div>
        </div>

        <div className="actions">
          <Link className="btn" to="/settings">
            Settings
          </Link>
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

