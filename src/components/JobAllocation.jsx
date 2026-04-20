import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus,
  Send,
  Inbox,
  CheckCircle2, 
  Clock, 
  AlertCircle,
  User,
  Calendar,
  MessageSquare,
  X,
  Target,
  ChevronRight,
  Sparkles,
  Search,
  Zap,
  ArrowRight
} from 'lucide-react'

const JobAllocation = ({ user }) => {
  const [tasksReceived, setTasksReceived] = useState([])
  const [tasksSent, setTasksSent] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('received') // 'received' or 'sent'
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSync, setLastSync] = useState(new Date())
  
  // Form State
  const [newTicket, setNewTicket] = useState({
    receiver_id: '',
    title: '',
    description: '',
    priority: 'Medium',
    deadline_at: ''
  })

  const fetchData = useCallback(async (isSilent = false) => {
    if (!user?.id) return
    if (!isSilent) setLoading(true)
    setErrorMsg(null)
    try {
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name, email')
      setProfiles(profilesData || [])

      const { data: received } = await supabase
        .from('tasks')
        .select('*, sender:profiles!sender_id(full_name, email)')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })

      const { data: sent } = await supabase
        .from('tasks')
        .select('*, receiver:profiles!receiver_id(full_name, email)')
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false })

      setTasksReceived(received || [])
      setTasksSent(sent || [])
      setLastSync(new Date())
    } catch (err) {
      console.error('Fetch error:', err.message)
      if (err.message.includes('tasks" does not exist')) {
        setErrorMsg('Database structure not found. Please run the setup SQL.')
      }
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [user?.id])

  // --- Reliability: 5s Polling + Real-time Subscription ---
  useEffect(() => {
    fetchData()
    
    // 5-second Heartbeat sync
    const interval = setInterval(() => {
      fetchData(true)
    }, 5000)

    // Real-time listener
    const channel = supabase
      .channel('tasks-heartbeat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData(true))
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  const handleCreateTicket = async (e) => {
    e.preventDefault()
    if (!newTicket.receiver_id || !newTicket.title || isSubmitting) return

    setIsSubmitting(true)
    
    // OPTIMISTIC UPDATE: Immediate UI update
    const tempId = `temp-${Date.now()}`
    const receiver = profiles.find(p => p.id === newTicket.receiver_id)
    const optimisticTask = {
      ...newTicket,
      id: tempId,
      sender_id: user.id,
      status: 'Pending',
      created_at: new Date().toISOString(),
      receiver: receiver || { full_name: 'Team Member' }
    }
    
    setTasksSent(prev => [optimisticTask, ...prev])
    setShowCreateModal(false)
    setActiveTab('sent')

    try {
      const { data, error } = await supabase.from('tasks').insert([{
        ...newTicket,
        sender_id: user.id,
        status: 'Pending'
      }]).select().single()

      if (error) throw error
      
      // Update the optimistic item with real data
      setTasksSent(prev => prev.map(t => t.id === tempId ? { ...data, receiver: optimisticTask.receiver } : t))
      setNewTicket({ receiver_id: '', title: '', description: '', priority: 'Medium', deadline_at: '' })
    } catch (err) {
      setTasksSent(prev => prev.filter(t => t.id !== tempId))
      alert('Sync Fail: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      setTasksReceived(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
      if (error) throw error
    } catch (err) {
      fetchData(true)
    }
  }

  const [showPastDeadlines, setShowPastDeadlines] = useState(false)

  const filteredTasks = useMemo(() => {
    const list = activeTab === 'received' ? tasksReceived : tasksSent
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const filtered = list.filter(t => {
      // Search filter
      const matchesSearch = !searchQuery || 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      
      if (!matchesSearch) return false

      // Deadline filter (if specifically requested to not show past days)
      if (!showPastDeadlines && t.deadline_at) {
        const deadline = new Date(t.deadline_at)
        deadline.setHours(23, 59, 59, 999) // End of the deadline day
        if (deadline < today) return false
      }

      return true
    })

    return filtered
  }, [activeTab, tasksReceived, tasksSent, searchQuery, showPastDeadlines])

  if (errorMsg) {
    return (
      <div className="page-container center-content">
        <div className="error-card glass-panel">
          <AlertCircle size={48} className="error-icon" />
          <h2>Connection Interrupted</h2>
          <p>{errorMsg}</p>
          <button onClick={() => fetchData()} className="retry-btn">Re-establish Sync</button>
        </div>
      </div>
    )
  }

  return (
    <motion.div className="page-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* HEADER SECTION */}
      <div className="top-banner">
        <div className="banner-left">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="system-status">
            <div className="status-dot pulsed" />
            <span>Operational Heartbeat: {lastSync.toLocaleTimeString()}</span>
          </motion.div>
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="brand-h1">Command Center</motion.h1>
          <p className="brand-p">Direct peer-to-peer tasking & real-time team audit.</p>
        </div>
        
        <div className="banner-right">
          <div className="search-pill">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Filter tasks..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <motion.button 
            whileHover={{ scale: 1.05, boxShadow: '0 20px 40px var(--brand-glow)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreateModal(true)}
            className="action-trigger-btn"
          >
            <Plus size={20} /> Raise Ticket
          </motion.button>
        </div>
      </div>

      {/* TABS */}
      <nav className="task-tabs">
        <div className="tab-group">
          <button onClick={() => setActiveTab('received')} className={activeTab === 'received' ? 'active' : ''}>
            <Inbox size={18} /> My Queue <span>{tasksReceived.length}</span>
          </button>
          <button onClick={() => setActiveTab('sent')} className={activeTab === 'sent' ? 'active' : ''}>
            <Send size={18} /> Raised by Me <span>{tasksSent.length}</span>
          </button>
        </div>
        
        <div className="filter-options">
          <label className="checkbox-pill">
            <input type="checkbox" checked={!showPastDeadlines} onChange={() => setShowPastDeadlines(!showPastDeadlines)} />
            <span>Hide Past Deadlines</span>
          </label>
        </div>
      </nav>

      {/* GRID AREA */}
      <div className="grid-container">
        {loading ? (
          <div className="loading-stage">
            <div className="loading-orbit" />
            <p>Stabilizing data stream...</p>
          </div>
        ) : (
          <motion.div layout className="task-grid">
            <AnimatePresence mode="popLayout">
              {filteredTasks.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="void-state">
                  <Target size={60} opacity={0.2} />
                  <h3>Operational Silence</h3>
                  <p>No tickets currently active in this sector.</p>
                </motion.div>
              ) : filteredTasks.map(task => (
                <motion.div 
                  key={task.id} 
                  layout
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ y: -8 }}
                  className={`ticket-card ${task.priority.toLowerCase()}`}
                >
                  <div className="ticket-top">
                    <div className="priority-label">{task.priority} Priority</div>
                    <div className="status-pill">{task.status}</div>
                  </div>
                  
                  <h3 className="ticket-name">{task.title}</h3>
                  <p className="ticket-brief">{task.description}</p>

                  <div className="ticket-bottom">
                    <div className="personnel">
                      <div className="p-avatar">{(activeTab === 'received' ? task.sender?.full_name : task.receiver?.full_name)?.[0] || '?'}</div>
                      <div className="p-info">
                        <span className="p-name">{activeTab === 'received' ? task.sender?.full_name : task.receiver?.full_name}</span>
                        <span className="p-role">{activeTab === 'received' ? 'Assigner' : 'Assignee'}</span>
                      </div>
                    </div>
                    
                    {activeTab === 'received' && task.status !== 'Completed' && (
                      <button onClick={() => updateTaskStatus(task.id, 'Completed')} className="complete-btn">
                        <CheckCircle2 size={16} /> Mark Done
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* --- CREATE MODAL --- */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="modal-backdrop">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="ticket-modal glass-morph"
            >
              <div className="modal-glow-line" />
              
              <div className="modal-top">
                <div className="m-text">
                  <h2>Raise Operational Ticket</h2>
                  <p>Assign critical tasks with direct delivery.</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="m-close"><X /></button>
              </div>

              <form onSubmit={handleCreateTicket} className="m-form">
                <div className="form-row">
                  <div className="f-group">
                    <label>Personnel Assignment</label>
                    <div className="select-wrapper">
                      <User size={16} />
                      <select required value={newTicket.receiver_id} onChange={e => setNewTicket({...newTicket, receiver_id: e.target.value})}>
                        <option value="">Select individual...</option>
                        {profiles.filter(p => p.id !== user.id).map(p => (
                          <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="f-group">
                    <label>Urgency Level</label>
                    <div className="select-wrapper">
                      <Zap size={16} />
                      <select value={newTicket.priority} onChange={e => setNewTicket({...newTicket, priority: e.target.value})}>
                        <option value="Low">Low Priority</option>
                        <option value="Medium">Medium Priority</option>
                        <option value="High">High Priority</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="f-group">
                  <label>Ticket Objective</label>
                  <div className="input-field">
                    <Sparkles size={16} />
                    <input required type="text" placeholder="What needs to be done?" value={newTicket.title} onChange={e => setNewTicket({...newTicket, title: e.target.value})} />
                  </div>
                </div>

                <div className="f-group">
                  <label>Additional Context</label>
                  <textarea rows={3} placeholder="Provide details, links or instructions..." value={newTicket.description} onChange={e => setNewTicket({...newTicket, description: e.target.value})} />
                </div>

                <div className="form-row">
                  <div className="f-group">
                    <label>Hard Deadline</label>
                    <div className="input-field">
                      <Calendar size={16} />
                      <input 
                        type="date" 
                        min={new Date().toISOString().split('T')[0]}
                        value={newTicket.deadline_at} 
                        onChange={e => setNewTicket({...newTicket, deadline_at: e.target.value})} 
                      />
                    </div>
                  </div>
                  <div className="f-group flex-end">
                    <button type="submit" disabled={isSubmitting} className="submit-ticket-btn">
                      {isSubmitting ? 'Publishing...' : 'Publish Ticket'} <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .page-container { padding: 50px 80px; min-height: 100vh; background: var(--bg-surface-2); }
        
        .top-banner { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 50px; }
        
        .system-status { display: flex; align-items: center; gap: 10px; color: var(--brand-primary); font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 15px; }
        .status-dot { width: 8px; height: 8px; background: var(--brand-primary); border-radius: 50%; }
        .pulsed { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.5); } 100% { opacity: 1; transform: scale(1); } }
        
        .brand-h1 { font-size: 52px; font-weight: 900; letter-spacing: -0.04em; color: var(--text-primary); margin: 0 0 5px; }
        .brand-p { color: var(--text-muted); font-size: 16px; margin: 0; }
        
        .banner-right { display: flex; align-items: center; gap: 20px; }
        .search-pill { position: relative; display: flex; align-items: center; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 100px; padding: 0 20px; min-width: 320px; }
        .search-pill input { border: none; background: none; padding: 14px 10px; width: 100%; color: var(--text-primary); outline: none; font-weight: 600; }
        .search-pill svg { opacity: 0.4; }
        
        .action-trigger-btn { background: var(--brand-gradient); color: #fff; border: none; border-radius: 100px; padding: 15px 35px; font-weight: 800; font-size: 15px; cursor: pointer; display: flex; gap: 10px; align-items: center; box-shadow: 0 15px 40px var(--brand-glow); }
        
        .task-tabs { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); margin-bottom: 40px; }
        .tab-group { display: flex; gap: 40px; }
        .task-tabs button { background: none; border: none; padding: 20px 0; color: var(--text-muted); font-weight: 800; font-size: 16px; cursor: pointer; position: relative; display: flex; align-items: center; gap: 12px; }
        .task-tabs button span { background: var(--bg-surface); padding: 2px 10px; border-radius: 6px; font-size: 11px; }
        .task-tabs button.active { color: var(--brand-primary); }
        .task-tabs button.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--brand-primary); border-radius: 2px; }
        
        .filter-options { display: flex; align-items: center; gap: 20px; }
        .checkbox-pill { display: flex; align-items: center; gap: 10px; cursor: pointer; background: var(--bg-surface); padding: 8px 16px; border-radius: 100px; border: 1px solid var(--border); transition: all 0.2s; user-select: none; }
        .checkbox-pill:hover { border-color: var(--brand-primary); }
        .checkbox-pill input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--brand-primary); }
        .checkbox-pill span { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        
        .task-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 30px; }
        
        .ticket-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 32px; padding: 32px; position: relative; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.03); border-top: 6px solid #4f46e5; }
        .ticket-card.high { border-top-color: #ef4444; }
        .ticket-card.low { border-top-color: #10b981; }
        
        .ticket-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
        .priority-label { font-size: 10px; font-weight: 900; text-transform: uppercase; background: rgba(79, 70, 229, 0.1); color: var(--brand-primary); padding: 5px 12px; border-radius: 50px; }
        .high .priority-label { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .low .priority-label { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .status-pill { font-size: 12px; font-weight: 800; color: #f59e0b; display: flex; align-items: center; gap: 6px; }
        
        .ticket-name { font-size: 22px; font-weight: 900; color: var(--text-primary); margin: 0 0 10px; letter-spacing: -0.02em; }
        .ticket-brief { color: var(--text-secondary); line-height: 1.6; font-size: 14px; margin-bottom: 30px; opacity: 0.8; }
        
        .ticket-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 25px; border-top: 1px solid var(--border-subtle); }
        .personnel { display: flex; align-items: center; gap: 15px; }
        .p-avatar { width: 32px; height: 32px; background: var(--brand-gradient); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 12px; }
        .p-name { display: block; font-size: 14px; font-weight: 800; color: var(--text-primary); }
        .p-role { font-size: 11px; color: var(--text-muted); }
        
        .complete-btn { background: #10b981; color: #fff; border: none; border-radius: 12px; padding: 10px 18px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; gap: 8px; align-items: center; }
        
        /* --- MODAL --- */
        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; }
        .ticket-modal { background: var(--bg-surface); width: 100%; max-width: 850px; border-radius: 40px; position: relative; overflow: hidden; box-shadow: 0 50px 150px rgba(0,0,0,0.6); border: 1px solid var(--border); }
        .modal-glow-line { position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--brand-primary), transparent); opacity: 0.6; }
        
        .modal-top { padding: 40px 60px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); background: var(--bg-surface-2); }
        .m-text h2 { margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -0.04em; color: var(--text-primary); }
        .m-text p { margin: 6px 0 0; color: var(--text-secondary); font-size: 15px; }
        .m-close { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; cursor: pointer; color: var(--text-muted); padding: 12px; display: flex; transition: all 0.2s; }
        .m-close:hover { background: var(--danger-bg); color: var(--danger); border-color: var(--danger); transform: rotate(90deg); }
        
        .m-form { padding: 50px 60px; display: flex; flex-direction: column; gap: 32px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .flex-end { display: flex; align-items: flex-end; }
        
        .f-group label { display: block; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 12px; }
        
        .select-wrapper, .input-field { position: relative; display: flex; align-items: center; background: var(--bg-surface-2); border: 1px solid var(--border); border-radius: 20px; padding: 0 20px; transition: all 0.2s; }
        .select-wrapper:focus-within, .input-field:focus-within { border-color: var(--brand-primary); background: var(--bg-surface); box-shadow: 0 0 0 6px var(--brand-glow); }
        
        .select-wrapper select, .input-field input, .m-form textarea { width: 100%; border: none; background: none; padding: 20px 10px; color: var(--text-primary); font-size: 16px; font-weight: 600; outline: none; font-family: inherit; }
        .select-wrapper svg, .input-field svg { color: var(--brand-primary); opacity: 0.8; flex-shrink: 0; width: 20px; height: 20px; }
        
        .m-form textarea { background: var(--bg-surface-2); border: 1px solid var(--border); border-radius: 24px; padding: 20px 24px; width: 100%; resize: none; transition: all 0.2s; }
        .m-form textarea:focus { border-color: var(--brand-primary); background: var(--bg-surface); box-shadow: 0 0 0 6px var(--brand-glow); }

        .submit-ticket-btn { 
          width: 100%;
          background: var(--brand-gradient); 
          color: #fff; 
          border: none; 
          border-radius: 20px; 
          padding: 22px 35px; 
          font-weight: 900; 
          font-size: 18px; 
          cursor: pointer; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          gap: 12px; 
          box-shadow: 0 20px 40px var(--brand-glow); 
          transition: all 0.3s; 
        }
        .submit-ticket-btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 30px 60px var(--brand-glow); }
        .submit-ticket-btn:active { transform: translateY(0) scale(1); }
        .submit-ticket-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .void-state { grid-column: 1/-1; padding: 100px; text-align: center; opacity: 0.5; }
        .loading-stage { height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
        .loading-orbit { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin 1s infinite linear; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 1024px) {
          .page-container { padding: 30px; }
          .top-banner { flex-direction: column; align-items: flex-start; gap: 30px; }
          .task-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 768px) {
          .page-container { padding: 20px 15px; }
          .brand-h1 { font-size: 32px; }
          .top-banner { margin-bottom: 30px; }
          .banner-right { width: 100%; flex-direction: column; align-items: stretch; gap: 15px; }
          .search-pill { min-width: 100%; width: 100%; }
          .action-trigger-btn { justify-content: center; width: 100%; }
          
          .task-tabs { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 25px; }
          .tab-group { flex-direction: column; gap: 8px; width: 100%; }
          .task-tabs button { justify-content: space-between; padding: 16px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; margin: 0; }
          .task-tabs button.active { border-color: var(--brand-primary); background: var(--brand-glow); }
          .task-tabs button.active::after { display: none; }
          .filter-options { width: 100%; justify-content: center; }
          
          .ticket-card { padding: 24px; width: 100%; }
          
          /* Modal Mobile */
          .modal-backdrop { padding: 10px; align-items: center; }
          .ticket-modal { border-radius: 24px; max-height: 95vh; display: flex; flex-direction: column; }
          .modal-top { padding: 20px 24px; }
          .m-text h2 { font-size: 18px; }
          .m-form { padding: 20px 24px; gap: 16px; overflow-y: auto; }
          .form-row { grid-template-columns: 1fr; gap: 16px; }
          .submit-ticket-btn { margin-top: 10px; }
        }
      `}</style>
    </motion.div>
  )
}

export default JobAllocation
