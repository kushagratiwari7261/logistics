// src/components/GlobalNotificationBell.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, CheckCircle2, AlertTriangle, Info, X, ExternalLink, Clock, ClipboardCheck, MessageSquare, FileText, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'
import './GlobalNotificationBell.css'

const GlobalNotificationBell = ({ user, inline = false }) => {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [pendingTasks, setPendingTasks] = useState([])
  const [unreadMessages, setUnreadMessages] = useState([])
  const [recentEnquiries, setRecentEnquiries] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [showPanel, setShowPanel] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [bellPulse, setBellPulse] = useState(false)
  const [activeTab, setActiveTab] = useState('all') // 'all', 'tasks', 'messages'

  // Drag state
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('gnb-position')
      return saved ? JSON.parse(saved) : { x: 0, y: 0 }
    } catch {
      return { x: 0, y: 0 }
    }
  })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

  // Fetch notifications from DB
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (data) setNotifications(data)
  }, [user?.id])

  // Fetch pending tasks assigned to this user
  const fetchPendingTasks = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('tasks')
      .select('*, sender:profiles!sender_id(full_name, email)')
      .eq('receiver_id', user.id)
      .neq('status', 'Completed')
      .order('created_at', { ascending: false })

    if (data) setPendingTasks(data)
  }, [user?.id])

  // Fetch unread messages for this user
  const fetchUnreadMessages = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles!sender_id(full_name, email)')
      .eq('receiver_id', user.id)
      .eq('is_read', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) setUnreadMessages(data)
  }, [user?.id])

  // Fetch recent job enquiries (last 24h)
  const fetchRecentEnquiries = useCallback(async () => {
    if (!user?.id) return
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('job_enquiries')
      .select('*')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) setRecentEnquiries(data)
  }, [user?.id])

  // Fetch recent payments (last 24h)
  const fetchRecentPayments = useCallback(async () => {
    if (!user?.id) return
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) setRecentPayments(data)
  }, [user?.id])

  // Total badge count
  useEffect(() => {
    const unreadNotifs = notifications.filter(n => !n.is_read).length
    const total = unreadNotifs + pendingTasks.length + unreadMessages.length
    setUnreadCount(total)
  }, [notifications, pendingTasks, unreadMessages])

  // All feeds combined for "All" tab
  const allFeedItems = useCallback(() => {
    const items = []

    // Pending tasks
    pendingTasks.forEach(t => items.push({
      id: `task-${t.id}`,
      type: 'task',
      title: t.title,
      subtitle: `From: ${t.sender?.full_name || 'Unknown'} · ${t.priority} Priority`,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline_at,
      time: t.created_at,
      path: '/job-allocation'
    }))

    // Unread messages
    unreadMessages.forEach(m => items.push({
      id: `msg-${m.id}`,
      type: 'message',
      title: `Message from ${m.sender?.full_name || 'Unknown'}`,
      subtitle: m.content?.substring(0, 80) || m.subject || 'New message',
      time: m.created_at,
      path: '/messages'
    }))

    // Recent enquiries
    recentEnquiries.forEach(e => items.push({
      id: `enq-${e.id}`,
      type: 'enquiry',
      title: `New Enquiry: ${e.enquiry_no || 'N/A'}`,
      subtitle: `${e.customer_name || 'Unknown Customer'} · ${e.job_type || ''} · ${e.status || 'pending'}`,
      time: e.created_at,
      path: '/job-enquiry'
    }))

    // Recent payments
    recentPayments.forEach(p => items.push({
      id: `pay-${p.id}`,
      type: 'payment',
      title: `Payment: ₹${p.amount?.toLocaleString() || '0'}`,
      subtitle: `${p.payment_mode || p.type || 'Payment'} · ${p.reference_no || ''}`,
      time: p.created_at,
      path: '/payments'
    }))

    // Unread notifications
    notifications.filter(n => !n.is_read).forEach(n => items.push({
      id: `notif-${n.id}`,
      type: 'notification',
      title: n.title,
      subtitle: n.message,
      time: n.created_at,
      path: n.type === 'assignment' ? '/job-allocation' : '/dashboard'
    }))

    // Sort by time descending
    items.sort((a, b) => new Date(b.time) - new Date(a.time))
    return items
  }, [pendingTasks, unreadMessages, recentEnquiries, recentPayments, notifications])

  // Fetch all data
  const fetchAll = useCallback(() => {
    fetchNotifications()
    fetchPendingTasks()
    fetchUnreadMessages()
    fetchRecentEnquiries()
    fetchRecentPayments()
  }, [fetchNotifications, fetchPendingTasks, fetchUnreadMessages, fetchRecentEnquiries, fetchRecentPayments])

  useEffect(() => {
    fetchAll()
    const pollId = setInterval(fetchAll, 15000)

    // Listen for real-time pushes from App.jsx
    const handleGlobalNotif = (event) => {
      const newNotif = event.detail
      if (!newNotif) return
      setNotifications(prev => [newNotif, ...prev])
      setBellPulse(true)
      setTimeout(() => setBellPulse(false), 1500)
      fetchAll()
    }

    window.addEventListener('new_app_notification', handleGlobalNotif)

    // Real-time listeners on all relevant tables
    const channel = supabase
      .channel(`gnb-global-${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchPendingTasks())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user?.id}` }, () => {
        fetchUnreadMessages()
        setBellPulse(true)
        setTimeout(() => setBellPulse(false), 1500)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_enquiries' }, () => fetchRecentEnquiries())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, () => fetchRecentPayments())
      .subscribe()

    return () => {
      clearInterval(pollId)
      window.removeEventListener('new_app_notification', handleGlobalNotif)
      supabase.removeChannel(channel)
    }
  }, [fetchAll, user?.id])

  const markAllAsRead = async () => {
    if (!user?.id) return
    
    // Mark notifications as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    // Mark messages as read
    await supabase
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('receiver_id', user.id)
      .eq('is_read', false)

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadMessages([])
  }

  // --- Drag Handlers ---
  const handlePointerDown = (e) => {
    if (inline) return
    isDragging.current = false
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
    e.target.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e) => {
    if (inline || !e.target.hasPointerCapture(e.pointerId)) return
    
    // Minimum distance to count as a drag (prevents clicks from dragging slightly)
    const newX = e.clientX - dragStart.current.x
    const newY = e.clientY - dragStart.current.y
    if (Math.abs(newX - position.x) > 3 || Math.abs(newY - position.y) > 3) {
      isDragging.current = true
    }
    
    if (isDragging.current) {
      setPosition({ x: newX, y: newY })
    }
  }

  const handlePointerUp = (e) => {
    if (inline) return
    e.target.releasePointerCapture(e.pointerId)
    if (isDragging.current) {
      localStorage.setItem('gnb-position', JSON.stringify(position))
    }
  }

  const handleClick = (e) => {
    if (isDragging.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    setShowPanel(!showPanel)
  }

  const getItemIcon = (type) => {
    switch (type) {
      case 'task': return <ClipboardCheck size={16} />
      case 'message': return <MessageSquare size={16} />
      case 'enquiry': return <FileText size={16} />
      case 'payment': return <CreditCard size={16} />
      default: return <Bell size={16} />
    }
  }

  const getItemColor = (type, priority) => {
    switch (type) {
      case 'task':
        if (priority === 'High') return '#ef4444'
        if (priority === 'Medium') return '#f59e0b'
        return '#10b981'
      case 'message': return '#3b82f6'
      case 'enquiry': return '#8b5cf6'
      case 'payment': return '#f59e0b'
      default: return '#6366f1'
    }
  }

  const getTimeAgo = (dateStr) => {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const getTypeLabel = (type) => {
    switch (type) {
      case 'task': return 'TASK'
      case 'message': return 'MESSAGE'
      case 'enquiry': return 'ENQUIRY'
      case 'payment': return 'PAYMENT'
      default: return 'ALERT'
    }
  }

  // Filtered items based on active tab
  const displayItems = activeTab === 'all'
    ? allFeedItems()
    : activeTab === 'tasks'
      ? allFeedItems().filter(i => i.type === 'task')
      : activeTab === 'messages'
        ? allFeedItems().filter(i => i.type === 'message')
        : allFeedItems()

  return (
    <div 
      className={inline ? "gnb-container-relative" : "gnb-container-fixed"}
      style={!inline ? { transform: `translate(${position.x}px, ${position.y}px)`, touchAction: 'none' } : {}}
    >
      {/* Bell Button */}
      <button
        className={`gnb-bell-btn ${bellPulse ? 'gnb-pulse' : ''} ${unreadCount > 0 ? 'gnb-has-unread' : ''}`}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="gnb-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown Panel */}
      {showPanel && (
        <>
          <div className="gnb-overlay" onClick={() => setShowPanel(false)} />
          <div className="gnb-panel">
            <div className="gnb-panel-header">
              <h3>Activity Center</h3>
              <div className="gnb-header-actions">
                <button className="gnb-mark-read" onClick={markAllAsRead}>Mark all read</button>
                <button className="gnb-close-panel" onClick={() => setShowPanel(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="gnb-tabs">
              <button
                className={`gnb-tab ${activeTab === 'all' ? 'gnb-tab-active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <Bell size={14} />
                All
                {unreadCount > 0 && <span className="gnb-tab-count">{unreadCount}</span>}
              </button>
              <button
                className={`gnb-tab ${activeTab === 'tasks' ? 'gnb-tab-active' : ''}`}
                onClick={() => setActiveTab('tasks')}
              >
                <ClipboardCheck size={14} />
                Tasks
                {pendingTasks.length > 0 && <span className="gnb-tab-count">{pendingTasks.length}</span>}
              </button>
              <button
                className={`gnb-tab ${activeTab === 'messages' ? 'gnb-tab-active' : ''}`}
                onClick={() => setActiveTab('messages')}
              >
                <MessageSquare size={14} />
                Msgs
                {unreadMessages.length > 0 && <span className="gnb-tab-count">{unreadMessages.length}</span>}
              </button>
            </div>

            <div className="gnb-panel-body">
              {displayItems.length === 0 ? (
                <div className="gnb-empty">
                  <CheckCircle2 size={36} opacity={0.2} />
                  <p>All caught up!</p>
                  <span>No pending activity</span>
                </div>
              ) : (
                displayItems.map(item => {
                  const color = getItemColor(item.type, item.priority)
                  return (
                    <div
                      key={item.id}
                      className="gnb-item gnb-unread"
                      onClick={() => {
                        navigate(item.path)
                        setShowPanel(false)
                      }}
                    >
                      <div className="gnb-item-icon" style={{ background: `${color}15` }}>
                        <span style={{ color }}>{getItemIcon(item.type)}</span>
                      </div>
                      <div className="gnb-item-content">
                        <p className="gnb-item-title">{item.title}</p>
                        <p className="gnb-item-msg">{item.subtitle}</p>
                        <div className="gnb-item-meta">
                          <span className="gnb-type-badge" style={{ background: `${color}15`, color }}>
                            {getTypeLabel(item.type)}
                          </span>
                          {item.status && (
                            <span className={`gnb-status gnb-status-${item.status.toLowerCase()}`}>
                              {item.status}
                            </span>
                          )}
                          {item.deadline && (
                            <span className="gnb-item-deadline">
                              <Clock size={10} />
                              {new Date(item.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          <span className="gnb-item-time">{getTimeAgo(item.time)}</span>
                        </div>
                      </div>
                      <ExternalLink size={14} className="gnb-item-link" />
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default GlobalNotificationBell
