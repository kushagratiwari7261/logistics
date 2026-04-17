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
  Zap
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
  
  // Form State
  const [newTicket, setNewTicket] = useState({
    receiver_id: '',
    title: '',
    description: '',
    priority: 'Medium',
    deadline_at: ''
  })

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data: profilesData, error: pError } = await supabase.from('profiles').select('id, full_name, email')
      if (pError) throw pError
      setProfiles(profilesData || [])

      const { data: received, error: rError } = await supabase
        .from('tasks')
        .select('*, sender:profiles!sender_id(full_name, email)')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
      if (rError) throw rError

      const { data: sent, error: sError } = await supabase
        .from('tasks')
        .select('*, receiver:profiles!receiver_id(full_name, email)')
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false })
      if (sError) throw sError

      setTasksReceived(received || [])
      setTasksSent(sent || [])
    } catch (err) {
      console.error('Fetch error:', err.message)
      if (err.message.includes('tasks" does not exist')) {
        setErrorMsg('The tasks table hasn\'t been created yet. Please run the provided SQL script.')
      } else {
        setErrorMsg(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel('tasks-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        console.log('🔄 Real-time task update:', payload);
        fetchData()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchData])

  const handleCreateTicket = async (e) => {
    e.preventDefault()
    if (!newTicket.receiver_id || !newTicket.title || isSubmitting) return

    setIsSubmitting(true)
    
    // 1. Optimistic Update
    const tempTicket = {
      ...newTicket,
      id: `temp-${Date.now()}`,
      sender_id: user.id,
      status: 'Pending',
      created_at: new Date().toISOString(),
      receiver: profiles.find(p => p.id === newTicket.receiver_id) || { full_name: 'Team Member' }
    }
    
    setTasksSent(prev => [tempTicket, ...prev])
    setShowCreateModal(false)
    setActiveTab('sent')

    try {
      const { data, error } = await supabase.from('tasks').insert([{
        receiver_id: newTicket.receiver_id,
        title: newTicket.title,
        description: newTicket.description,
        priority: newTicket.priority,
        deadline_at: newTicket.deadline_at || null,
        sender_id: user.id,
        status: 'Pending'
      }]).select().single()

      if (error) throw error
      
      // Replace optimistic ticket with real one
      setTasksSent(prev => prev.map(t => t.id === tempTicket.id ? { ...data, receiver: tempTicket.receiver } : t))
      setNewTicket({ receiver_id: '', title: '', description: '', priority: 'Medium', deadline_at: '' })
    } catch (err) {
      console.error('Submit error:', err.message)
      // Rollback optimistic update on error
      setTasksSent(prev => prev.filter(t => t.id !== tempTicket.id))
      alert('Error raising ticket: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      // Optimistic update
      if (activeTab === 'received') {
        setTasksReceived(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
      } else {
        setTasksSent(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
      }

      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)
      
      if (error) throw error
    } catch (err) {
      alert('Error updating task: ' + err.message)
      fetchData() // Re-sync on error
    }
  }

  const filteredTasks = useMemo(() => {
    const pool = activeTab === 'received' ? tasksReceived : tasksSent
    return pool.filter(t => 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [activeTab, tasksReceived, tasksSent, searchQuery])

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', damping: 25, stiffness: 200 } }
  }

  if (errorMsg) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid #ef444455', padding: 40, borderRadius: 24, maxWidth: 450, textAlign: 'center', backdropFilter: 'blur(10px)' }}>
          <AlertCircle size={54} color="#ef4444" style={{ marginBottom: 20 }} />
          <h2 style={{ color: '#ef4444', marginBottom: 12, fontWeight: 800 }}>Database Sync Unsuccessful</h2>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 24 }}>{errorMsg}</p>
          <button onClick={fetchData} className="premium-btn-primary">Reconnect Services</button>
        </div>
      </div>
    )
  }

  return (
    <motion.div className="page-container" initial="hidden" animate="visible" variants={containerVariants}>
      <header className="page-header">
        <div className="header-left">
          <motion.div variants={itemVariants} className="badge-premium">
            <Zap size={14} fill="currentColor" />
            <span>Operational Management</span>
          </motion.div>
          <motion.h1 variants={itemVariants} className="main-title">Team Task Center</motion.h1>
          <motion.p variants={itemVariants} className="sub-title">Deploy instructions and monitor team performance in real-time.</motion.p>
        </div>
        
        <div className="header-right">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <motion.button 
            variants={itemVariants}
            whileHover={{ scale: 1.05, translateY: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreateModal(true)}
            className="premium-btn-action"
          >
            <Plus size={20} /> Raise New Ticket
          </motion.button>
        </div>
      </header>

      <motion.nav variants={itemVariants} className="tab-navigation">
        <button 
          onClick={() => setActiveTab('received')}
          className={`tab-btn ${activeTab === 'received' ? 'active' : ''}`}
        >
          <Inbox size={18} /> 
          <span>Inbox Tasks</span>
          <div className="tab-count">{tasksReceived.length}</div>
        </button>
        <button 
          onClick={() => setActiveTab('sent')}
          className={`tab-btn ${activeTab === 'sent' ? 'active' : ''}`}
        >
          <Send size={18} /> 
          <span>Sent Tickets</span>
          <div className="tab-count">{tasksSent.length}</div>
        </button>
      </motion.nav>

      <div className="content-grid-wrapper">
        {loading ? (
          <div className="loading-state">
            <div className="premium-spinner" />
            <p>Syncing encrypted task data...</p>
          </div>
        ) : (
          <motion.div layout className="tasks-grid">
            <AnimatePresence mode="popLayout">
              {filteredTasks.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="empty-state"
                >
                  <div className="empty-icon-wrapper">
                    <Sparkles size={40} />
                  </div>
                  <h3>No tasks found here</h3>
                  <p>Check your filters or raise a new ticket to get started.</p>
                </motion.div>
              ) : filteredTasks.map(task => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ y: -8, transition: { duration: 0.2 } }}
                  className={`task-card ${task.status === 'Completed' ? 'completed' : ''}`}
                >
                  <div className="card-accent" style={{ background: task.status === 'Completed' ? 'var(--success)' : (task.priority === 'High' ? '#ef4444' : 'var(--brand-primary)') }} />
                  
                  <div className="card-header">
                    <span className={`priority-badge ${task.priority.toLowerCase()}`}>
                      {task.priority} Priority
                    </span>
                    <span className={`status-text ${task.status.toLowerCase()}`}>
                      {task.status === 'Completed' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      {task.status}
                    </span>
                  </div>

                  <h3 className="task-title">{task.title}</h3>
                  <p className="task-desc">{task.description}</p>

                  <div className="card-footer">
                    <div className="user-info">
                      <div className="user-avatar">
                        {(activeTab === 'received' ? (task.sender?.full_name || 'S') : (task.receiver?.full_name || 'R'))[0]}
                      </div>
                      <div className="user-details">
                        <span className="user-name">{activeTab === 'received' ? (task.sender?.full_name || 'Sender') : (task.receiver?.full_name || 'Receiver')}</span>
                        <span className="task-date">{new Date(task.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {activeTab === 'received' && task.status !== 'Completed' && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => updateTaskStatus(task.id, 'Completed')}
                        className="complete-btn"
                      >
                        <CheckCircle2 size={16} /> Complete
                      </motion.button>
                    )}
                  </div>
                  
                  {task.deadline_at && (
                    <div className="deadline-tag">
                      <Calendar size={12} />
                      Due {new Date(task.deadline_at).toLocaleDateString()}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* --- CREATE MODAL --- */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="modal-overlay">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="premium-modal"
            >
              <div className="modal-inner-glow" />
              
              <div className="modal-header">
                <div className="header-text">
                  <h2>Raise Operational Ticket</h2>
                  <p>Internal task assignment and tracking</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="close-btn"><X size={24} /></button>
              </div>
              
              <form onSubmit={handleCreateTicket} className="modal-form">
                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>Assign To</label>
                    <div className="input-wrapper">
                      <User size={18} className="input-icon" />
                      <select 
                        required
                        value={newTicket.receiver_id}
                        onChange={e => setNewTicket({...newTicket, receiver_id: e.target.value})}
                      >
                        <option value="">Select teammate...</option>
                        {profiles.filter(p => p.id !== user.id).map(p => (
                          <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-group flex-1">
                    <label>Priority Level</label>
                    <select 
                      value={newTicket.priority}
                      onChange={e => setNewTicket({...newTicket, priority: e.target.value})}
                      className="priority-select"
                    >
                      <option value="Low">Low Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="High">High Urgency</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Task Summary</label>
                  <div className="input-wrapper">
                    <Sparkles size={18} className="input-icon" />
                    <input 
                      required
                      type="text"
                      placeholder="e.g., Update status for Booking #SF882"
                      value={newTicket.title}
                      onChange={e => setNewTicket({...newTicket, title: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Implementation Details</label>
                  <textarea 
                    rows={4}
                    placeholder="Provide full context for the team member..."
                    value={newTicket.description}
                    onChange={e => setNewTicket({...newTicket, description: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Completion Deadline</label>
                  <div className="input-wrapper">
                    <Calendar size={18} className="input-icon" />
                    <input 
                      type="date"
                      value={newTicket.deadline_at}
                      onChange={e => setNewTicket({...newTicket, deadline_at: e.target.value})}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="submit-btn-premium"
                >
                  {isSubmitting ? 'Syncing...' : 'Deploy Task Now'}
                  <ChevronRight size={20} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .page-container {
          padding: 40px 60px;
          min-height: 100vh;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 48px;
        }

        .badge-premium {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(79, 70, 229, 0.1);
          color: var(--brand-primary);
          border-radius: 100px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 16px;
        }

        .main-title {
          font-size: 48px;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .sub-title {
          font-size: 16px;
          color: var(--text-muted);
          max-width: 500px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .search-wrapper {
          position: relative;
          min-width: 300px;
        }

        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .search-input:focus {
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.08);
          outline: none;
        }

        .premium-btn-action {
          background: var(--brand-gradient);
          color: #fff;
          border: none;
          border-radius: 16px;
          padding: 15px 28px;
          font-weight: 800;
          font-size: 15px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 10px 25px var(--brand-glow);
        }

        .tab-navigation {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 40px;
        }

        .tab-btn {
          padding: 18px 32px;
          background: none;
          border: none;
          color: var(--text-muted);
          font-weight: 700;
          cursor: pointer;
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          color: var(--text-primary);
        }

        .tab-btn.active {
          color: var(--brand-primary);
        }

        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--brand-primary);
          border-radius: 3px 3px 0 0;
        }

        .tab-count {
          font-size: 11px;
          background: var(--bg-surface-2);
          color: var(--text-muted);
          padding: 2px 8px;
          border-radius: 8px;
          font-weight: 800;
        }

        .tab-btn.active .tab-count {
          background: var(--brand-primary);
          color: #fff;
        }

        .tasks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 30px;
        }

        .task-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 28px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
          display: flex;
          flex-direction: column;
        }

        .card-accent {
          position: absolute;
          top: 0;
          left: 0;
          width: 8px;
          bottom: 0;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .priority-badge {
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .priority-badge.high { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .priority-badge.medium { background: rgba(79, 70, 229, 0.1); color: var(--brand-primary); }
        .priority-badge.low { background: rgba(16, 185, 129, 0.1); color: #10b981; }

        .status-text {
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-text.pending { color: #f59e0b; }
        .status-text.completed { color: #10b981; }

        .task-title {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 12px;
          line-height: 1.4;
        }

        .task-desc {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-secondary);
          margin-bottom: 24px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-footer {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 20px;
          border-top: 1px solid var(--border-subtle);
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          background: var(--brand-gradient);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 14px;
        }

        .user-name {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .task-date {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
        }

        .complete-btn {
          background: var(--success);
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .deadline-tag {
          margin-top: 16px;
          font-size: 11px;
          color: #ef4444;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(239, 68, 68, 0.05);
          width: fit-content;
          padding: 4px 10px;
          border-radius: 6px;
        }

        /* --- MODAL STYLES --- */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(20px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 24px;
        }

        .premium-modal {
          background: var(--bg-surface);
          width: 100%;
          maxWidth: 600px;
          border-radius: 40px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 50px 100px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .modal-inner-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at top left, rgba(79, 70, 229, 0.05) 0%, transparent 60%);
        }

        .modal-header {
          padding: 40px 48px;
          background: var(--bg-surface-2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
        }

        .header-text h2 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.02em; }
        .header-text p { margin: 6px 0 0; color: var(--text-muted); font-size: 14px; }

        .close-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); }

        .modal-form { padding: 40px 48px; display: flex; flexDirection: column; gap: 28px; }

        .form-row { display: flex; gap: 24px; }
        .flex-1 { flex: 1; }

        .form-group label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin-bottom: 10px;
        }

        .input-wrapper { position: relative; }
        .input-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--brand-primary); opacity: 0.5; }

        .input-wrapper input, .input-wrapper select, .modal-form textarea {
          width: 100%;
          padding: 14px 16px 14px 48px;
          background: var(--bg-surface-2);
          border: 1px solid var(--border);
          border-radius: 16px;
          color: var(--text-primary);
          font-size: 15px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .modal-form textarea { padding-left: 16px; }

        .input-wrapper input:focus, .input-wrapper select:focus, .modal-form textarea:focus {
          border-color: var(--brand-primary);
          background: var(--bg-surface);
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.05);
          outline: none;
        }

        .submit-btn-premium {
          background: var(--brand-gradient);
          color: #fff;
          border: none;
          padding: 20px;
          border-radius: 20px;
          font-weight: 900;
          font-size: 17px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          box-shadow: 0 15px 30px var(--brand-glow);
          margin-top: 10px;
          transition: all 0.2s;
        }

        .submit-btn-premium:disabled { opacity: 0.7; cursor: wait; }

        .premium-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border);
          border-top-color: var(--brand-primary);
          border-radius: 50%;
          animation: spin 1s infinite linear;
          margin-bottom: 16px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 1024px) {
          .page-container { padding: 30px; }
          .main-title { font-size: 36px; }
          .tasks-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </motion.div>
  )
}

export default JobAllocation
