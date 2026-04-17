import { useState, useEffect } from 'react'
import { Plus, Briefcase, Clock, Bell, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const Header = ({ createNewShipment, creatActiveJob, user }) => {
  const [now, setNow] = useState(new Date())
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch notifications
  useEffect(() => {
    if (!user?.id) return

    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.is_read).length)
      }
    }

    fetchNotifications()

    // Real-time subscription for notifications
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev])
        setUnreadCount(c => c + 1)
        // Note: Sound and Toast are handled in App.jsx via Socket.io for immediate response
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const markAllAsRead = async () => {
    if (!user?.id || unreadCount === 0) return
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    
    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    }
  }

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

        {/* Notification Bell */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              background: 'none', border: 'none', padding: 8, cursor: 'pointer',
              color: 'var(--text-secondary)', transition: 'transform 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                background: '#ef4444', color: '#fff', fontSize: 10,
                width: 16, height: 16, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, border: '2px solid var(--bg-surface)'
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div 
                style={{ position: 'fixed', inset: 0, zIndex: 998 }} 
                onClick={() => setShowNotifications(false)} 
              />
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 12,
                width: 320, maxHeight: 400, background: 'var(--bg-surface)',
                borderRadius: 16, border: '1px solid var(--border)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.15)', zIndex: 999,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'notificationIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                <style>{`
                  @keyframes notificationIn {
                    from { opacity: 0; transform: translateY(-10px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                  }
                `}</style>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Notifications</h3>
                  <button onClick={markAllAsRead} style={{ color: 'var(--brand-primary)', border: 'none', background: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Info size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                      <p style={{ margin: 0, fontSize: 13 }}>All caught up!</p>
                    </div>
                  ) : notifications.map(n => (
                    <div key={n.id} style={{ 
                      padding: '12px 20px', display: 'flex', gap: 12,
                      background: n.is_read ? 'transparent' : 'rgba(79, 70, 229, 0.05)',
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.2s', cursor: 'pointer'
                    }}>
                      <div style={{ 
                        width: 32, height: 32, borderRadius: 8, 
                        background: n.type === 'assignment' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        {n.type === 'assignment' ? <CheckCircle2 size={16} color="#4f46e5" /> : <AlertTriangle size={16} color="#f59e0b" />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: n.is_read ? 500 : 700 }}>{n.title}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.message}</p>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
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