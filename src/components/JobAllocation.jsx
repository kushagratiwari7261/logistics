import { useState, useEffect, useCallback } from 'react'
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
  Filter,
  Sparkles
} from 'lucide-react'

const JobAllocation = ({ user }) => {
  const [tasksReceived, setTasksReceived] = useState([])
  const [tasksSent, setTasksSent] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('received') // 'received' or 'sent'
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  
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
      // 1. Fetch profiles for assignment
      const { data: profilesData, error: pError } = await supabase.from('profiles').select('id, full_name, email')
      if (pError) throw pError
      setProfiles(profilesData || [])

      // 2. Fetch Tasks received
      const { data: received, error: rError } = await supabase
        .from('tasks')
        .select('*, sender:profiles!sender_id(full_name, email)')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
      if (rError) throw rError

      // 3. Fetch Tasks sent
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
        setErrorMsg('The tasks table hasn\'t been created yet. Please run the provided SQL script in the Supabase editor.')
      } else {
        setErrorMsg(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()
    
    // Subscribe to tasks changes
    const channel = supabase
      .channel('tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData()
      })
      .subscribe()
      
    return () => supabase.removeChannel(channel)
  }, [fetchData])

  const handleCreateTicket = async (e) => {
    e.preventDefault()
    if (!newTicket.receiver_id || !newTicket.title) return

    try {
      const { error } = await supabase.from('tasks').insert([{
        ...newTicket,
        sender_id: user.id,
        status: 'Pending'
      }])

      if (error) throw error
      
      setShowCreateModal(false)
      setNewTicket({ receiver_id: '', title: '', description: '', priority: 'Medium', deadline_at: '' })
      // fetchData() will be called by the channel subscription
    } catch (err) {
      alert('Error raising ticket: ' + err.message)
    }
  }

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)
      
      if (error) throw error
    } catch (err) {
      alert('Error updating task: ' + err.message)
    }
  }

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  }

  const modalVariants = {
    hidden: { scale: 0.9, opacity: 0 },
    visible: { scale: 1, opacity: 1, transition: { type: 'spring', damping: 20, stiffness: 300 } }
  }

  if (errorMsg) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: 32, borderRadius: 20, maxWidth: 450, textAlign: 'center' }}>
          <AlertCircle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
          <h2 style={{ color: '#ef4444', marginBottom: 12 }}>System Error</h2>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>{errorMsg}</p>
          <button onClick={fetchData} style={{ marginTop: 24, padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Retry Connection</button>
        </div>
      </div>
    )
  }

  return (
    <motion.div 
      className="page-container"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40 }}>
        <div>
          <motion.div variants={itemVariants} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--brand-primary)', marginBottom: 8 }}>
            <Sparkles size={18} />
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Premium Portal</span>
          </motion.div>
          <motion.h1 variants={itemVariants} style={{ fontSize: 42, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.03em' }}>
            Task Manager
          </motion.h1>
          <motion.p variants={itemVariants} style={{ color: 'var(--text-muted)', fontSize: 16 }}>
            Raise and track tickets for your team members with real-time feedback.
          </motion.p>
        </div>
        
        <motion.button 
          variants={itemVariants}
          whileHover={{ scale: 1.05, boxShadow: '0 15px 30px var(--brand-glow)' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreateModal(true)}
          style={{ 
            background: 'var(--brand-gradient)', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 16, 
            padding: '16px 28px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 10, 
            fontWeight: 800, 
            fontSize: 16,
            cursor: 'pointer',
            boxShadow: '0 10px 20px var(--brand-glow)'
          }}
        >
          <Plus size={22} /> Raise Ticket
        </motion.button>
      </header>

      <motion.div variants={itemVariants} style={{ display: 'flex', gap: 32, borderBottom: '1px solid var(--border)', marginBottom: 32 }}>
        <button 
          onClick={() => setActiveTab('received')}
          style={{ 
            padding: '16px 20px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'received' ? '3px solid var(--brand-primary)' : '3px solid transparent',
            color: activeTab === 'received' ? 'var(--brand-primary)' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'all 0.3s ease'
          }}
        >
          <Inbox size={20} /> My Tasks
          <span style={{ background: activeTab === 'received' ? 'var(--brand-primary)' : 'var(--bg-surface-2)', color: activeTab === 'received' ? '#fff' : 'var(--text-muted)', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>
            {tasksReceived.length}
          </span>
        </button>
        <button 
          onClick={() => setActiveTab('sent')}
          style={{ 
            padding: '16px 20px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'sent' ? '3px solid var(--brand-primary)' : '3px solid transparent',
            color: activeTab === 'sent' ? 'var(--brand-primary)' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'all 0.3s ease'
          }}
        >
          <Send size={20} /> Raised by Me
          <span style={{ background: activeTab === 'sent' ? 'var(--brand-primary)' : 'var(--bg-surface-2)', color: activeTab === 'sent' ? '#fff' : 'var(--text-muted)', padding: '2px 10px', borderRadius: 20, fontSize: 12 }}>
            {tasksSent.length}
          </span>
        </button>
      </motion.div>

      <div style={{ minHeight: 400 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 20 }}>
            <div className="loader-spiral" />
            <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Syncing your digital workplace...</p>
          </div>
        ) : (
          <motion.div 
            layout
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 28 }}
          >
            <AnimatePresence mode="popLayout">
              {(activeTab === 'received' ? tasksReceived : tasksSent).length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ gridColumn: '1/-1', textAlign: 'center', padding: 80, background: 'var(--bg-surface)', borderRadius: 24, border: '2px dashed var(--border)' }}
                >
                  <Target size={64} style={{ marginBottom: 20, color: 'var(--text-muted)', opacity: 0.3 }} />
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>All clear here!</h3>
                  <p style={{ color: 'var(--text-muted)' }}>No tickets found in this section. Ready for a new challenge?</p>
                </motion.div>
              ) : (activeTab === 'received' ? tasksReceived : tasksSent).map(task => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                  whileHover={{ y: -5 }}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 24,
                    border: '1px solid var(--border)',
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  {/* Status Indicator Bar */}
                  <div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    bottom: 0, 
                    width: 6, 
                    background: task.status === 'Completed' ? 'var(--success)' : (task.priority === 'High' ? '#ef4444' : 'var(--brand-primary)')
                  }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ 
                      padding: '6px 12px', 
                      borderRadius: 8, 
                      fontSize: 10, 
                      fontWeight: 800, 
                      textTransform: 'uppercase', 
                      letterSpacing: 0.5,
                      background: task.priority === 'High' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                      color: task.priority === 'High' ? '#ef4444' : 'var(--brand-primary)'
                    }}>
                      {task.priority} Priority
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      fontSize: 12, 
                      fontWeight: 700, 
                      color: task.status === 'Completed' ? 'var(--success)' : '#f59e0b'
                    }}>
                      {task.status === 'Completed' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                      {task.status}
                    </div>
                  </div>

                  <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.4 }}>{task.title}</h3>
                  <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {task.description}
                  </p>

                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>
                      {(activeTab === 'received' ? task.sender?.full_name : task.receiver?.full_name)?.slice(0, 1).toUpperCase() || 'S'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {activeTab === 'received' ? (task.sender?.full_name || task.sender?.email) : (task.receiver?.full_name || task.receiver?.email)}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{activeTab === 'received' ? 'Sender' : 'Receiver'}</p>
                    </div>

                    <AnimatePresence>
                      {activeTab === 'received' && task.status !== 'Completed' && (
                        <motion.button 
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => updateTaskStatus(task.id, 'Completed')}
                          style={{ 
                            background: 'var(--success)', 
                            color: '#fff', 
                            border: 'none', 
                            borderRadius: 10, 
                            padding: '8px 14px', 
                            fontSize: 12, 
                            fontWeight: 800, 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <CheckCircle2 size={14} /> Done
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {task.deadline_at && (
                    <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={12} />
                      Due by {new Date(task.deadline_at).toLocaleDateString()}
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
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}
          >
            <motion.div 
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              style={{ background: 'var(--bg-surface)', width: '100%', maxWidth: 540, borderRadius: 32, boxShadow: '0 40px 100px rgba(0,0,0,0.3)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div style={{ padding: '32px 40px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-2)' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Raise New Ticket</h2>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Create a new task for your team member.</p>
                </div>
                <button 
                  onClick={() => setShowCreateModal(false)} 
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, cursor: 'pointer', color: 'var(--text-muted)' }}
                ><X size={20} /></button>
              </div>
              
              <form onSubmit={handleCreateTicket} style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div className="form-group">
                  <label className="premium-label">Assign To Team Member</label>
                  <div style={{ position: 'relative' }}>
                    <User size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-primary)', opacity: 0.6 }} />
                    <select 
                      required
                      value={newTicket.receiver_id}
                      onChange={e => setNewTicket({...newTicket, receiver_id: e.target.value})}
                      className="premium-input select-input"
                    >
                      <option value="">Select a receiver...</option>
                      {profiles.filter(p => p.id !== user.id).map(p => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="premium-label">Task Summary / Title</label>
                  <div style={{ position: 'relative' }}>
                    <Target size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-primary)', opacity: 0.6 }} />
                    <input 
                      required
                      type="text"
                      placeholder="e.g., Verify POD for Shipment #889"
                      value={newTicket.title}
                      onChange={e => setNewTicket({...newTicket, title: e.target.value})}
                      className="premium-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="premium-label">Detailed Instructions</label>
                  <div style={{ position: 'relative' }}>
                    <MessageSquare size={18} style={{ position: 'absolute', left: 16, top: 16, color: 'var(--brand-primary)', opacity: 0.6 }} />
                    <textarea 
                      rows={4}
                      placeholder="Describe exactly what needs to be done..."
                      value={newTicket.description}
                      onChange={e => setNewTicket({...newTicket, description: e.target.value})}
                      className="premium-input text-area"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div className="form-group">
                    <label className="premium-label">Priority</label>
                    <select 
                      value={newTicket.priority}
                      onChange={e => setNewTicket({...newTicket, priority: e.target.value})}
                      className="premium-input-small"
                    >
                      <option value="Low">Low Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="High">High Urgency</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="premium-label">Due Date</label>
                    <input 
                      type="date"
                      value={newTicket.deadline_at}
                      onChange={e => setNewTicket({...newTicket, deadline_at: e.target.value})}
                      className="premium-input-small"
                    />
                  </div>
                </div>

                <motion.button 
                  type="submit"
                  whileHover={{ scale: 1.02, boxShadow: '0 15px 35px var(--brand-glow)' }}
                  whileTap={{ scale: 0.98 }}
                  style={{ 
                    marginTop: 10, 
                    background: 'var(--brand-gradient)', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: 16, 
                    padding: '18px', 
                    fontWeight: 900, 
                    fontSize: 16, 
                    cursor: 'pointer', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    boxShadow: '0 10px 25px var(--brand-glow)'
                  }}
                >
                  Confirm and Send Ticket <ChevronRight size={20} />
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .page-container {
          padding: 50px;
          min-height: 100vh;
        }

        .loader-spiral {
          width: 50px;
          height: 50px;
          border: 3px solid var(--border);
          border-top-color: var(--brand-primary);
          border-radius: 50%;
          animation: spin 1s infinite linear;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .premium-label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          margin-bottom: 8px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .premium-input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--bg-surface-2);
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
          outline: none;
        }

        .premium-input:focus {
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
          background: var(--bg-surface);
        }

        .select-input {
          appearance: none;
        }

        .text-area {
          padding-top: 16px;
          resize: none;
        }

        .premium-input-small {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--bg-surface-2);
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 600;
          outline: none;
        }

        .premium-input-small:focus {
          border-color: var(--brand-primary);
          background: var(--bg-surface);
        }

        /* Responsive fixes */
        @media screen and (max-width: 768px) {
          .page-container { padding: 24px; }
          header { flex-direction: column; align-items: flex-start !important; gap: 24px; }
        }
      `}</style>
    </motion.div>
  )
}

export default JobAllocation
