import { Link, useLocation } from 'react-router-dom'

function PumpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h8a2 2 0 0 1 2 2v15H8a2 2 0 0 1-2-2V3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 7h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M16 8h1.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M18 6l2 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChecklistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 6h11M9 12h11M9 18h11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 15a8 8 0 0 0 .1-2l2-1.2-2-3.4-2.2.7a8.6 8.6 0 0 0-1.7-1L15 5h-6l-.6 2.1a8.6 8.6 0 0 0-1.7 1L4.5 7.4l-2 3.4 2 1.2a8 8 0 0 0 0 2l-2 1.2 2 3.4 2.2-.7a8.6 8.6 0 0 0 1.7 1L9 21h6l.6-2.1a8.6 8.6 0 0 0 1.7-1l2.2.7 2-3.4-2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function TopNav() {
  const { pathname } = useLocation()
  const active = (to: string) => (pathname === to ? ' active' : '')

  return (
    <nav className="top-nav" aria-label="Main menu">
      <Link to="/new" className="top-nav-brand" aria-label="QuickFillUp home">
        <img src="/icons/ios/32.png" alt="" width={22} height={22} style={{ borderRadius: 6 }} />
        <span className="top-nav-brand-text">QuickFillUp</span>
      </Link>
      <Link to="/new" className={`top-nav-item${active('/new')}`} aria-label="Fuel">
        <span className="top-nav-icon">
          <PumpIcon />
        </span>
        <span className="top-nav-label">Fuel</span>
      </Link>
      <Link to="/service" className={`top-nav-item${active('/service')}`} aria-label="Service">
        <span className="top-nav-icon">
          <ChecklistIcon />
        </span>
        <span className="top-nav-label">Service</span>
      </Link>
      <Link to="/settings" className={`top-nav-item${active('/settings')}`} aria-label="Settings">
        <span className="top-nav-icon">
          <GearIcon />
        </span>
        <span className="top-nav-label">Settings</span>
      </Link>
    </nav>
  )
}
