import { useState, useEffect } from 'react'
import { Plus, Briefcase, Clock } from 'lucide-react'

const Header = ({ createNewShipment, creatActiveJob, user }) => {
  const [now, setNow] = useState(new Date())

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hour = now.getHours()
  const greeting =
    hour < 5 ? 'Good night' :
      hour < 12 ? 'Good morning' :
        hour < 17 ? 'Good afternoon' :
          hour < 21 ? 'Good evening' : 'Good night'

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const firstName = user?.email
    ? user.email.split('@')[0].replace(/[._]/g, ' ')
    : ''
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'SF'

  return (
    <div className="header-section">
      <div className="header-content">
        <h1 className="header-title">
          <span className="header-title-gradient">{greeting}</span>
          {firstName && (
            <span className="header-title-gradient">, {firstName}</span>
          )}
        </h1>
        <p className="header-subtitle">
          <span>{dateStr}</span>
          <span className="header-time-badge">
            <Clock size={12} style={{ marginRight: 4, opacity: 0.8 }} />
            {timeStr}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>· Freight Overview</span>
        </p>
      </div>

      <div className="header-actions">
        <button className="primary-button" onClick={createNewShipment} id="new-shipment-btn">
          <Plus size={16} />
          New Shipment
        </button>
        <button
          className="primary-button"
          onClick={creatActiveJob}
          id="new-job-btn"
          style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)', boxShadow: '0 3px 16px rgba(8,145,178,0.3)' }}
        >
          <Briefcase size={16} />
          New Job
        </button>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'var(--brand-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          flexShrink: 0, cursor: 'default',
          boxShadow: '0 0 0 2px var(--brand-glow)',
        }} title={user?.email}>
          {initials}
        </div>
      </div>
    </div>
  )
}

export default Header