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
  const [isDispatching, setIsDispatching] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
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
    if (e) e.preventDefault()
    if (!newTicket.receiver_id || !newTicket.title || isSubmitting || isDispatching) return

    // 1. TRIGGER PAPER PLANE ANIMATION
    setIsDispatching(true)
    
    // 2. Perform optimistic update after a small delay (mid-flight)
    setTimeout(() => {
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
      setActiveTab('sent')
    }, 400)

    try {
      setIsSubmitting(true)
      const { data, error } = await supabase.from('tasks').insert([{
        ...newTicket,
        sender_id: user.id,
        status: 'Pending'
      }]).select().single()

      if (error) throw error
      
      // Update tasks locally
      setTasksSent(prev => prev.map(t => t.id.toString().startsWith('temp-') ? { ...data, receiver: prev.find(i=>i.id===t.id).receiver } : t))
      
      // 3. SHOW SUCCESS STATE
      setTimeout(() => {
        setIsDispatching(false)
        setIsSuccess(true)
        setTimeout(() => {
          setIsSuccess(false)
          setShowCreateModal(false)
          setNewTicket({ receiver_id: '', title: '', description: '', priority: 'Medium', deadline_at: '' })
        }, 2200)
      }, 600)

    } catch (err) {
      console.error(err)
      setIsDispatching(false)
      setIsSubmitting(false)
      alert('Dispatch Failed: ' + err.message)
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
              className={`ticket-modal ${isDispatching ? 'dispatching' : ''}`}
            >
              <div className="ticket-top-border" />
              
              <div className="modal-top">
                <div className="m-text">
                  <div className="ticket-icon-badge">
                    <Briefcase size={18} />
                    <span>OPERATIONAL TICKET</span>
                  </div>
                  <h2>{isSuccess ? 'Ticket Dispatched' : 'New Directive'}</h2>
                  <p>{isSuccess ? 'Successfully synced with global ledger.' : 'Assign critical operational duties to team members.'}</p>
                </div>
                {!isSuccess && !isDispatching && (
                  <button onClick={() => setShowCreateModal(false)} className="m-close"><X /></button>
                )}
              </div>

              <div className="modal-body-wrapper">
                <AnimatePresence mode="wait">
                  {isSuccess ? (
                    <motion.div 
                      key="success"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="success-state"
                    >
                      <div className="success-lottie-mock">
                        <motion.div 
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={{ duration: 0.8, ease: "easeInOut" }}
                          className="success-ring-outer"
                        >
                          <div className="success-ring-inner">
                            <CheckCircle2 size={60} color="#10b981" />
                          </div>
                        </motion.div>
                      </div>
                      <div className="success-info">
                        <h3>Sync Successful</h3>
                        <p>The personnel has been notified via Pulse and Email.</p>
                      </div>
                    </motion.div>
                  ) : isDispatching ? (
                    <motion.div 
                      key="dispatching"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="dispatch-animation-overlay"
                    >
                      <motion.div 
                        animate={{ 
                          x: [0, 50, 400], 
                          y: [0, -50, -400],
                          rotate: [0, -10, -45],
                          opacity: [0, 1, 0]
                        }}
                        transition={{ duration: 1, cubicBezier: [0.4, 0, 1, 1] }}
                        className="paper-plane"
                      >
                        <Send size={60} color="var(--brand-primary)" />
                      </motion.div>
                      <div className="dispatch-text">Encrypting & Sending Directive...</div>
                    </motion.div>
                  ) : (
                    <motion.form 
                      key="form"
                      exit={{ opacity: 0, x: -20 }}
                      onSubmit={handleCreateTicket} 
                      className="m-form"
                    >
                      <div className="form-split">
                        <div className="f-group">
                          <label>Assigned Personnel</label>
                          <div className="select-pill">
                            <User size={18} />
                            <select required value={newTicket.receiver_id} onChange={e => setNewTicket({...newTicket, receiver_id: e.target.value})}>
                              <option value="">Choose team member...</option>
                              {profiles.filter(p => p.id !== user.id).map(p => (
                                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="f-group">
                          <label>Priority Classification</label>
                          <div className="select-pill">
                            <AlertCircle size={18} />
                            <select value={newTicket.priority} onChange={e => setNewTicket({...newTicket, priority: e.target.value})}>
                              <option value="Low">Low (Strategic)</option>
                              <option value="Medium">Medium (Standard)</option>
                              <option value="High">High (Tactical / Urgent)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="f-group">
                        <label>Objective Title</label>
                        <div className="input-pill">
                          <Sparkles size={18} />
                          <input required type="text" placeholder="e.g. Clearance at Port Trust..." value={newTicket.title} onChange={e => setNewTicket({...newTicket, title: e.target.value})} />
                        </div>
                      </div>

                      <div className="f-group">
                        <label>Operational Context</label>
                        <textarea rows={3} placeholder="Describe the mission details and expectations..." value={newTicket.description} onChange={e => setNewTicket({...newTicket, description: e.target.value})} />
                      </div>

                      <div className="form-split">
                        <div className="f-group">
                          <label>Strict Deadline</label>
                          <div className="input-pill">
                            <Calendar size={18} />
                            <input 
                              type="date" 
                              min={new Date().toISOString().split('T')[0]}
                              value={newTicket.deadline_at} 
                              onChange={e => setNewTicket({...newTicket, deadline_at: e.target.value})} 
                            />
                          </div>
                        </div>
                        <button type="submit" disabled={isSubmitting} className="dispatch-action-btn">
                          <span>Dispatch Ticket</span> <ArrowRight size={20} />
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .page-container { padding: 50px 80px; min-height: 100vh; background: var(--bg-surface-2); transition: all 0.3s; }
        
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
        
        .action-trigger-btn { background: var(--brand-gradient); color: #fff; border: none; border-radius: 100px; padding: 15px 35px; font-weight: 800; font-size: 15px; cursor: pointer; display: flex; gap: 10px; align-items: center; box-shadow: 0 15px 40px var(--brand-glow); transition: all 0.2s; }
        .action-trigger-btn:hover { transform: translateY(-3px); box-shadow: 0 20px 50px var(--brand-glow); }
        
        .task-tabs { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); margin-bottom: 40px; overflow-x: auto; padding-bottom: 2px; }
        .tab-group { display: flex; gap: 40px; }
        .task-tabs button { background: none; border: none; padding: 20px 0; color: var(--text-muted); font-weight: 800; font-size: 16px; cursor: pointer; position: relative; display: flex; align-items: center; gap: 12px; white-space: nowrap; }
        .task-tabs button span { background: var(--bg-surface); padding: 2px 10px; border-radius: 6px; font-size: 11px; }
        .task-tabs button.active { color: var(--brand-primary); }
        .task-tabs button.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--brand-primary); border-radius: 2px; }
        
        .filter-options { display: flex; align-items: center; gap: 20px; }
        .checkbox-pill { display: flex; align-items: center; gap: 10px; cursor: pointer; background: var(--bg-surface); padding: 8px 16px; border-radius: 100px; border: 1px solid var(--border); transition: all 0.2s; user-select: none; }
        .checkbox-pill:hover { border-color: var(--brand-primary); }
        .checkbox-pill input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--brand-primary); }
        .checkbox-pill span { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        
        .task-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 30px; }
        
        .ticket-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 32px; padding: 32px; position: relative; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.03); border-top: 6px solid #4f46e5; transition: all 0.3s; }
        .ticket-card:hover { transform: translateY(-10px); box-shadow: 0 30px 60px rgba(0,0,0,0.08); }
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
        
        .complete-btn { background: #10b981; color: #fff; border: none; border-radius: 12px; padding: 10px 18px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; gap: 8px; align-items: center; transition: all 0.2s; }
        .complete-btn:hover { background: #059669; }
        
        /* --- MODAL --- */
        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(20px); display: flex; align-items: center; justifyContent: center; z-index: 10000; padding: 20px; }
        .ticket-modal { background: var(--bg-surface); width: 100%; maxWidth: 650px; border-radius: 40px; position: relative; overflow: hidden; box-shadow: 0 50px 100px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .ticket-modal.dispatching { transform: scale(0.98); opacity: 0.9; }

        .ticket-top-border { position: absolute; top: 0; left: 0; right: 0; height: 6px; background: var(--brand-gradient); z-index: 10; }
        
        .ticket-icon-badge { display: flex; align-items: center; gap: 8px; background: rgba(79, 70, 229, 0.1); color: var(--brand-primary); padding: 6px 14px; border-radius: 50px; width: fit-content; margin-bottom: 20px; font-size: 10px; font-weight: 900; letter-spacing: 1px; }

        .success-state { padding: 60px 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .success-lottie-mock { margin-bottom: 30px; position: relative; }
        .success-ring-outer { padding: 20px; border-radius: 50%; border: 2px dashed #10b981; animation: orbit 10s linear infinite; }
        .success-ring-inner { background: rgba(16, 185, 129, 0.1); padding: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        @keyframes orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .success-info h3 { font-size: 32px; font-weight: 900; color: var(--text-primary); margin: 0 0 10px; letter-spacing: -1px; }
        .success-info p { color: var(--text-muted); font-size: 16px; margin: 0; }

        /* Animation Layer */
        .dispatch-animation-overlay { height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; position: relative; overflow: hidden; }
        .paper-plane { position: absolute; filter: drop-shadow(0 10px 20px rgba(79, 70, 229, 0.4)); }
        .dispatch-text { font-size: 18px; font-weight: 700; color: var(--brand-primary); letter-spacing: -0.5px; animation: textPulse 1s ease-in-out infinite alternate; }
        @keyframes textPulse { from { opacity: 0.6; } to { opacity: 1; transform: translateY(-2px); } }

        .modal-top { padding: 45px 50px 30px; display: flex; justify-content: space-between; align-items: flex-start; }
        .m-text h2 { margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -0.05em; color: var(--text-primary); }
        .m-text p { margin: 8px 0 0; color: var(--text-muted); font-size: 15px; line-height: 1.5; }
        .m-close { background: rgba(0,0,0,0.05); border: none; cursor: pointer; color: var(--text-muted); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .m-close:hover { background: #fee2e2; color: #ef4444; transform: rotate(90deg); }
        
        .m-form { padding: 0 50px 45px; display: flex; flexDirection: column; gap: 24px; }
        .form-split { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        
        .f-group label { display: block; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); margin-bottom: 12px; }
        .select-pill, .input-pill { position: relative; display: flex; align-items: center; background: var(--bg-surface-2); border: 2px solid var(--border); border-radius: 20px; padding: 0 18px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .select-pill:focus-within, .input-pill:focus-within { border-color: var(--brand-primary); background: var(--bg-surface); box-shadow: 0 0 0 6px var(--brand-glow); transform: translateY(-2px); }
        
        .select-pill select, .input-pill input, .m-form textarea { width: 100%; border: none; background: none; padding: 18px 10px; color: var(--text-primary); font-size: 16px; font-weight: 600; outline: none; }
        .select-pill svg, .input-pill svg { opacity: 0.6; color: var(--brand-primary); }
        
        .m-form textarea { background: var(--bg-surface-2); border: 2px solid var(--border); border-radius: 20px; padding: 20px; width: 100%; resize: none; margin-bottom: 0; transition: all 0.3s; font-family: inherit; font-size: 16px; font-weight: 600; }
        .m-form textarea:focus { border-color: var(--brand-primary); background: var(--bg-surface); box-shadow: 0 0 0 6px var(--brand-glow); transform: translateY(-2px); }

        .dispatch-action-btn { background: var(--brand-gradient); color: #fff; border: none; border-radius: 24px; padding: 18px 30px; font-weight: 900; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; box-shadow: 0 20px 40px var(--brand-glow); transition: all 0.3s; overflow: hidden; position: relative; width: 100%; }
        .dispatch-action-btn::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transform: translateX(-100%); transition: transform 0.6s; }
        .dispatch-action-btn:hover::after { transform: translateX(100%); }
        .dispatch-action-btn:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 25px 50px var(--brand-glow); }
        .dispatch-action-btn:active { transform: scale(0.96); }
        .dispatch-action-btn:disabled { opacity: 0.7; pointer-events: none; grayscale: 100%; }

        @media (max-width: 768px) {
          .modal-top { padding: 30px 25px 20px; }
          .m-form { padding: 0 25px 30px; gap: 20px; }
          .form-split { grid-template-columns: 1fr; }
          .m-text h2 { font-size: 26px; }
        }
      `}</style>
    </motion.div>
  )
}

export default JobAllocation
