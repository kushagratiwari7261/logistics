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
  ArrowRight,
  Pencil
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
  const [editingTask, setEditingTask] = useState(null)

  const [showPersonalModal, setShowPersonalModal] = useState(false)
  const [newPersonalTask, setNewPersonalTask] = useState({
    title: '',
    date: '',
    time: '',
    allDay: false,
    recurrence: 'Does not repeat',
    description: '',
    list: 'My Tasks'
  })

  // Restart Task State
  const [showRestartModal, setShowRestartModal] = useState(false)
  const [restartTask, setRestartTask] = useState(null)
  const [restartFormData, setRestartFormData] = useState({
    title: '',
    description: '',
    priority: '',
    date: '',
    time: '',
    allDay: false
  })

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
      if (editingTask) {
        const { error } = await supabase.from('tasks').update({
          ...newTicket,
          updated_at: new Date().toISOString()
        }).eq('id', editingTask.id)
        if (error) throw error
        await fetchData(true)
      } else {
        const { data, error } = await supabase.from('tasks').insert([{
          ...newTicket,
          sender_id: user.id,
          status: 'Pending'
        }]).select().single()
        if (error) throw error
        // Update the optimistic item with real data
        setTasksSent(prev => prev.map(t => t.id === tempId ? { ...data, receiver: optimisticTask.receiver } : t))
      }
      setNewTicket({ receiver_id: '', title: '', description: '', priority: 'Medium', deadline_at: '' })
      setEditingTask(null)
    } catch (err) {
      setTasksSent(prev => prev.filter(t => t.id !== tempId))
      alert('Sync Fail: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreatePersonalTask = async (e) => {
    e.preventDefault()
    if (!newPersonalTask.title || isSubmitting) return

    setIsSubmitting(true)

    let deadlineStr = null;
    if (newPersonalTask.date) {
      try {
        if (newPersonalTask.allDay) {
          deadlineStr = new Date(`${newPersonalTask.date}T23:59:59`).toISOString()
        } else if (newPersonalTask.time) {
          deadlineStr = new Date(`${newPersonalTask.date}T${newPersonalTask.time}`).toISOString()
        } else {
          deadlineStr = new Date(`${newPersonalTask.date}T23:59:59`).toISOString()
        }
      } catch (err) {
        // Fallback if parsing fails
        deadlineStr = null
      }
    }
    
    let finalDesc = newPersonalTask.description;
    if (newPersonalTask.recurrence !== 'Does not repeat') {
       finalDesc += finalDesc ? `\n\n[Recurrence: ${newPersonalTask.recurrence}]` : `[Recurrence: ${newPersonalTask.recurrence}]`;
    }
    if (newPersonalTask.list !== 'My Tasks') {
       finalDesc += finalDesc ? `\n[List: ${newPersonalTask.list}]` : `[List: ${newPersonalTask.list}]`;
    }

    const taskToInsert = {
      title: newPersonalTask.title,
      description: finalDesc,
      priority: 'Low', // Personal tasks
      deadline_at: deadlineStr,
      sender_id: user.id,
      receiver_id: user.id,
      status: 'Pending'
    }

    const tempId = `temp-p-${Date.now()}`
    const selfProfile = profiles.find(p => p.id === user.id) || { full_name: 'Me' }
    const optimisticTask = {
      ...taskToInsert,
      id: tempId,
      created_at: new Date().toISOString(),
      sender: selfProfile,
      receiver: selfProfile
    }

    setTasksReceived(prev => [optimisticTask, ...prev])
    setShowPersonalModal(false)
    setActiveTab('received')

    try {
      if (editingTask) {
        const { error } = await supabase.from('tasks').update({
          title: newPersonalTask.title,
          description: finalDesc,
          deadline_at: deadlineStr,
          updated_at: new Date().toISOString()
        }).eq('id', editingTask.id)
        if (error) throw error
        await fetchData(true)
      } else {
        const { data, error } = await supabase.from('tasks').insert([taskToInsert]).select().single()
        if (error) throw error
        setTasksReceived(prev => prev.map(t => t.id === tempId ? { ...data, sender: optimisticTask.sender, receiver: optimisticTask.receiver } : t))
      }
      setNewPersonalTask({ title: '', date: '', time: '', allDay: false, recurrence: 'Does not repeat', description: '', list: 'My Tasks' })
      setEditingTask(null)
    } catch (err) {
      setTasksReceived(prev => prev.filter(t => t.id !== tempId))
      alert('Sync Fail: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      setTasksReceived(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
      setTasksSent(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
      if (error) throw error
    } catch (err) {
      fetchData(true)
    }
  }

  const initiateRestart = (task) => {
    setRestartTask(task)
    const deadline = task.deadline_at ? new Date(task.deadline_at) : null
    setRestartFormData({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'Medium',
      date: deadline ? deadline.toISOString().split('T')[0] : '',
      time: deadline ? deadline.toTimeString().split(' ')[0].substring(0, 5) : '',
      allDay: false
    })
    setShowRestartModal(true)
  }

  const handleRestartSubmit = async (e) => {
    e.preventDefault()
    if (!restartTask || isSubmitting) return

    setIsSubmitting(true)
    let deadlineStr = null
    if (restartFormData.date) {
      if (restartFormData.allDay) {
        deadlineStr = new Date(`${restartFormData.date}T23:59:59`).toISOString()
      } else if (restartFormData.time) {
        deadlineStr = new Date(`${restartFormData.date}T${restartFormData.time}`).toISOString()
      } else {
        deadlineStr = new Date(`${restartFormData.date}T23:59:59`).toISOString()
      }
    }

    try {
      const updatePayload = {
        title: restartFormData.title,
        description: restartFormData.description,
        priority: restartFormData.priority,
        status: 'Pending',
        deadline_at: deadlineStr,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', restartTask.id)

      if (error) throw error

      // Update local state
      const updateList = (list) => list.map(t => t.id === restartTask.id ? { ...t, ...updatePayload } : t)
      setTasksReceived(prev => updateList(prev))
      setTasksSent(prev => updateList(prev))
      
      setShowRestartModal(false)
      setRestartTask(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const initiateEdit = (task) => {
    setEditingTask(task)
    if (task.sender_id === task.receiver_id) {
      // Personal task
      const deadline = task.deadline_at ? new Date(task.deadline_at) : null
      
      // Try to parse recurrence and list from description
      let recurrence = 'Does not repeat'
      let list = 'My Tasks'
      let cleanDesc = task.description || ''
      
      if (cleanDesc.includes('[Recurrence:')) {
        recurrence = cleanDesc.match(/\[Recurrence: (.*?)\]/)?.[1] || 'Does not repeat'
        cleanDesc = cleanDesc.replace(/\[Recurrence: .*?\]/g, '').trim()
      }
      if (cleanDesc.includes('[List:')) {
        list = cleanDesc.match(/\[List: (.*?)\]/)?.[1] || 'My Tasks'
        cleanDesc = cleanDesc.replace(/\[List: .*?\]/g, '').trim()
      }

      setNewPersonalTask({
        title: task.title,
        date: deadline ? deadline.toISOString().split('T')[0] : '',
        time: deadline ? deadline.toTimeString().split(' ')[0].substring(0, 5) : '',
        allDay: false,
        recurrence,
        description: cleanDesc,
        list
      })
      setShowPersonalModal(true)
    } else {
      // Assigned task
      setNewTicket({
        receiver_id: task.receiver_id,
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'Medium',
        deadline_at: task.deadline_at ? task.deadline_at.split('T')[0] : ''
      })
      setShowCreateModal(true)
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
            <div className="status-dot" />
            <span>Sync Status: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </motion.div>
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="brand-h1">Task Management</motion.h1>
          <p className="brand-p">Streamline peer-to-peer assignments and team productivity.</p>
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
          <div className="action-buttons">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowPersonalModal(true)}
              className="action-trigger-btn secondary"
            >
              <User size={18} /> Add Personal
            </motion.button>
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreateModal(true)}
              className="action-trigger-btn primary"
            >
              <Plus size={18} /> Assign Task
            </motion.button>
          </div>
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
                    <div className="top-right-actions">
                      <div className="status-pill">{task.status}</div>
                      {task.status !== 'Completed' && (task.sender_id === user.id) && (
                        <button className="edit-mini-btn" onClick={() => initiateEdit(task)}>
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="ticket-name">{task.title}</h3>
                  <p className="ticket-brief">{task.description}</p>

                  <div className="ticket-bottom">
                    <div className="personnel">
                      <div className="p-avatar">{(activeTab === 'received' ? task.sender?.full_name : task.receiver?.full_name)?.[0] || '?'}</div>
                      <div className="p-info">
                        <span className="p-role">{activeTab === 'received' ? 'Assigned by' : 'Assigned to'}</span>
                        <span className="p-name">{activeTab === 'received' ? task.sender?.full_name : task.receiver?.full_name}</span>
                      </div>
                    </div>

                    {task.deadline_at && (
                      <div className="task-deadline-info">
                        <Clock size={12} />
                        <span>{new Date(task.deadline_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      </div>
                    )}
                  </div>

                  <div className="card-actions-row">

                    {activeTab === 'received' && task.status !== 'Completed' && (
                      <button onClick={() => updateTaskStatus(task.id, 'Completed')} className="complete-btn">
                        <CheckCircle2 size={16} /> Mark as Done
                      </button>
                    )}

                    {task.status === 'Completed' && (
                      <button onClick={() => initiateRestart(task)} className="restart-btn">
                        <Clock size={16} /> Re-open Task
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
              className="ticket-modal"
            >

              <div className="modal-top">
                <div className="m-text">
                  <h2>{editingTask ? 'Update Operational Ticket' : 'Raise Operational Ticket'}</h2>
                  <p>{editingTask ? 'Modify the details of this assignment.' : 'Assign critical tasks with direct delivery.'}</p>
                </div>
                <button onClick={() => { setShowCreateModal(false); setEditingTask(null); }} className="m-close"><X /></button>
              </div>

              <form onSubmit={handleCreateTicket} className="m-form compact-form">
                <div className="form-row">
                  <div className="f-group">
                    <label>Personnel Assignment</label>
                    <div className="select-wrapper">
                      <User size={16} />
                      <select required value={newTicket.receiver_id} onChange={e => setNewTicket({ ...newTicket, receiver_id: e.target.value })}>
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
                      <select value={newTicket.priority} onChange={e => setNewTicket({ ...newTicket, priority: e.target.value })}>
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
                    <input required type="text" placeholder="What needs to be done?" value={newTicket.title} onChange={e => setNewTicket({ ...newTicket, title: e.target.value })} />
                  </div>
                </div>

                <div className="f-group">
                  <label>Additional Context</label>
                  <textarea rows={3} placeholder="Provide details, links or instructions..." value={newTicket.description} onChange={e => setNewTicket({ ...newTicket, description: e.target.value })} />
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
                        onChange={e => setNewTicket({ ...newTicket, deadline_at: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="f-group flex-end">
                    <button type="submit" disabled={isSubmitting} className="submit-ticket-btn">
                      {isSubmitting ? 'Updating...' : (editingTask ? 'Update Task' : 'Publish Ticket')} <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- PERSONAL TASK MODAL --- */}
      <AnimatePresence>
        {showPersonalModal && (
          <div className="modal-backdrop">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="ticket-modal"
            >

              <div className="modal-top">
                <div className="m-text">
                  <h2>{editingTask ? 'Update Personal Task' : 'Add Personal Task'}</h2>
                  <p>{editingTask ? 'Modify your workflow item.' : 'Create a task for your own workflow.'}</p>
                </div>
                <button onClick={() => { setShowPersonalModal(false); setEditingTask(null); }} className="m-close"><X /></button>
              </div>

              <form onSubmit={handleCreatePersonalTask} className="m-form compact-form">
                
                <div className="f-group">
                  <label>Task Title</label>
                  <div className="input-field">
                    <CheckCircle2 size={16} />
                    <input required type="text" placeholder="Add title" value={newPersonalTask.title} onChange={e => setNewPersonalTask({ ...newPersonalTask, title: e.target.value })} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="f-group">
                    <label>Schedule</label>
                    <div className="datetime-row">
                      <div className="input-field date-field">
                        <Calendar size={16} />
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={newPersonalTask.date}
                          onChange={e => setNewPersonalTask({ ...newPersonalTask, date: e.target.value })}
                        />
                      </div>
                      {!newPersonalTask.allDay && (
                        <div className="input-field time-field">
                          <Clock size={16} />
                          <input
                            type="time"
                            value={newPersonalTask.time}
                            onChange={e => setNewPersonalTask({ ...newPersonalTask, time: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                    <div className="checkbox-wrap mt-3">
                      <label className="checkbox-pill personal-checkbox">
                        <input type="checkbox" checked={newPersonalTask.allDay} onChange={e => setNewPersonalTask({ ...newPersonalTask, allDay: e.target.checked })} />
                        <span>All day</span>
                      </label>
                    </div>
                  </div>

                  <div className="f-group">
                    <label>Recurrence</label>
                    <div className="select-wrapper">
                      <Target size={16} />
                      <select value={newPersonalTask.recurrence} onChange={e => setNewPersonalTask({ ...newPersonalTask, recurrence: e.target.value })}>
                        <option value="Does not repeat">Does not repeat</option>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Yearly">Yearly</option>
                        <option value="Custom...">Custom...</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="f-group">
                  <label>Description</label>
                  <textarea rows={3} placeholder="Add description" value={newPersonalTask.description} onChange={e => setNewPersonalTask({ ...newPersonalTask, description: e.target.value })} />
                </div>

                <div className="form-row">
                  <div className="f-group">
                    <label>List</label>
                    <div className="select-wrapper">
                      <Inbox size={16} />
                      <select value={newPersonalTask.list} onChange={e => setNewPersonalTask({ ...newPersonalTask, list: e.target.value })}>
                        <option value="My Tasks">My Tasks</option>
                        <option value="Work">Work</option>
                        <option value="Personal">Personal</option>
                      </select>
                    </div>
                  </div>
                  <div className="f-group flex-end">
                    <button type="submit" disabled={isSubmitting} className="submit-ticket-btn" style={{ background: '#10b981' }}>
                      {isSubmitting ? 'Saving...' : (editingTask ? 'Update Task' : 'Save Task')} <CheckCircle2 size={18} />
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- RESTART TASK MODAL --- */}
      <AnimatePresence>
        {showRestartModal && (
          <div className="modal-backdrop">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="ticket-modal"
            >

              <div className="modal-top">
                <div className="m-text">
                  <h2>Update Deadline & Restart</h2>
                  <p>Set a new deadline for "{restartTask?.title}"</p>
                </div>
                <button onClick={() => setShowRestartModal(false)} className="m-close"><X /></button>
              </div>

              <form onSubmit={handleRestartSubmit} className="m-form compact-form">
                <div className="f-group">
                  <label>Task Title</label>
                  <div className="input-field">
                    <Sparkles size={16} />
                    <input required type="text" value={restartFormData.title} onChange={e => setRestartFormData({ ...restartFormData, title: e.target.value })} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="f-group">
                    <label>Urgency Level</label>
                    <div className="select-wrapper">
                      <Zap size={16} />
                      <select value={restartFormData.priority} onChange={e => setRestartFormData({ ...restartFormData, priority: e.target.value })}>
                        <option value="Low">Low Priority</option>
                        <option value="Medium">Medium Priority</option>
                        <option value="High">High Priority</option>
                      </select>
                    </div>
                  </div>
                  <div className="f-group">
                    <label>Schedule Update</label>
                    <div className="datetime-row">
                      <div className="input-field date-field">
                        <Calendar size={16} />
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={restartFormData.date}
                          onChange={e => setRestartFormData({ ...restartFormData, date: e.target.value })}
                        />
                      </div>
                      {!restartFormData.allDay && (
                        <div className="input-field time-field">
                          <Clock size={16} />
                          <input
                            type="time"
                            value={restartFormData.time}
                            onChange={e => setRestartFormData({ ...restartFormData, time: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="f-group">
                  <label>Update Context/Description</label>
                  <textarea rows={3} value={restartFormData.description} onChange={e => setRestartFormData({ ...restartFormData, description: e.target.value })} />
                </div>

                <div className="checkbox-wrap mt-1">
                  <label className="checkbox-pill personal-checkbox">
                    <input type="checkbox" checked={restartFormData.allDay} onChange={e => setRestartFormData({ ...restartFormData, allDay: e.target.checked })} />
                    <span>All day task</span>
                  </label>
                </div>

                <div className="f-group flex-end">
                  <button type="submit" disabled={isSubmitting} className="submit-ticket-btn" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 20px 40px rgba(245, 158, 11, 0.3)' }}>
                    {isSubmitting ? 'Updating...' : 'Restart Task'} <ArrowRight size={18} />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .page-container { padding: 40px 60px; min-height: 100vh; background: #f8fafc; color: #1e293b; }
        
        .top-banner { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px; }
        
        .system-status { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
        .status-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; }
        
        .brand-h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; margin: 0 0 4px; }
        .brand-p { color: #64748b; font-size: 15px; margin: 0; }
        
        .banner-right { display: flex; align-items: center; gap: 16px; }
        .search-pill { position: relative; display: flex; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0 16px; min-width: 280px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .search-pill input { border: none; background: none; padding: 10px 8px; width: 100%; color: #1e293b; outline: none; font-size: 14px; font-weight: 500; }
        .search-pill svg { color: #94a3b8; }
        
        .action-buttons { display: flex; gap: 12px; align-items: center; }
        .action-trigger-btn { border-radius: 10px; padding: 10px 20px; font-weight: 700; font-size: 14px; cursor: pointer; display: flex; gap: 8px; align-items: center; transition: all 0.2s; border: 1px solid transparent; }
        .action-trigger-btn.primary { background: #4f46e5; color: #fff; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
        .action-trigger-btn.primary:hover { background: #4338ca; transform: translateY(-1px); }
        .action-trigger-btn.secondary { background: #fff; color: #475569; border-color: #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .action-trigger-btn.secondary:hover { background: #f1f5f9; border-color: #cbd5e1; }
        
        .task-tabs { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; margin-bottom: 32px; }
        .tab-group { display: flex; gap: 32px; }
        .task-tabs button { background: none; border: none; padding: 16px 4px; color: #64748b; font-weight: 700; font-size: 15px; cursor: pointer; position: relative; display: flex; align-items: center; gap: 8px; transition: color 0.2s; }
        .task-tabs button span { background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 100px; font-size: 12px; }
        .task-tabs button:hover { color: #1e293b; }
        .task-tabs button.active { color: #4f46e5; }
        .task-tabs button.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: #4f46e5; }
        
        .filter-options { display: flex; align-items: center; }
        .checkbox-pill { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; transition: all 0.2s; }
        .checkbox-pill:hover { border-color: #cbd5e1; background: #f8fafc; }
        .checkbox-pill input { width: 14px; height: 14px; accent-color: #4f46e5; }
        .checkbox-pill span { font-size: 13px; font-weight: 600; color: #475569; }
        
        .task-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
        
        .ticket-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; position: relative; display: flex; flex-direction: column; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .ticket-card:hover { border-color: #cbd5e1; box-shadow: 0 10px 20px rgba(0,0,0,0.04); }
        
        .ticket-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .priority-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; padding: 4px 10px; border-radius: 6px; }
        .priority-label { background: #f1f5f9; color: #475569; }
        .high .priority-label { background: #fef2f2; color: #dc2626; }
        .low .priority-label { background: #f0fdf4; color: #16a34a; }
        .status-pill { font-size: 12px; font-weight: 700; color: #d97706; }
        
        .ticket-name { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 8px; line-height: 1.4; }
        .ticket-brief { color: #64748b; line-height: 1.5; font-size: 14px; margin-bottom: 24px; flex-grow: 1; }
        
        .ticket-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #f1f5f9; margin-bottom: 16px; }
        .personnel { display: flex; align-items: center; gap: 10px; }
        .p-avatar { width: 28px; height: 28px; background: #4f46e5; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 12px; }
        .p-info { display: flex; flex-direction: column; }
        .p-name { font-size: 13px; font-weight: 700; color: #1e293b; }
        .p-role { font-size: 11px; color: #94a3b8; margin-bottom: 1px; }
        
        .task-deadline-info { display: flex; align-items: center; gap: 4px; color: #64748b; font-size: 12px; font-weight: 600; }
        
        .card-actions-row { display: flex; gap: 8px; }
        .complete-btn, .restart-btn { flex: 1; border: none; border-radius: 10px; padding: 10px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; justify-content: center; gap: 6px; align-items: center; transition: all 0.2s; }
        .complete-btn { background: #10b981; color: #fff; }
        .complete-btn:hover { background: #059669; }
        .restart-btn { background: #f59e0b; color: #fff; }
        .restart-btn:hover { background: #d97706; }
        
        .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; }
        .ticket-modal { background: #fff; width: 100%; max-width: 600px; border-radius: 20px; position: relative; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); border: 1px solid #e2e8f0; }
        
        .modal-top { padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; background: #fff; }
        .m-text h2 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
        .m-text p { margin: 4px 0 0; color: #64748b; font-size: 14px; }
        .m-close { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; cursor: pointer; color: #64748b; padding: 8px; display: flex; transition: all 0.2s; }
        .m-close:hover { background: #fee2e2; color: #ef4444; border-color: #fecaca; }
        
        .m-form { padding: 32px; display: flex; flex-direction: column; gap: 24px; }
        .compact-form { padding: 24px 32px; gap: 20px; }
        
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .f-group label { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px; }
        
        .select-wrapper, .input-field { position: relative; display: flex; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0 14px; transition: all 0.2s; }
        .select-wrapper:focus-within, .input-field:focus-within { border-color: #4f46e5; background: #fff; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); }
        
        .select-wrapper select, .input-field input, .m-form textarea { width: 100%; border: none; background: none; padding: 12px 8px; color: #1e293b; font-size: 14px; font-weight: 600; outline: none; font-family: inherit; }
        .select-wrapper svg, .input-field svg { color: #64748b; flex-shrink: 0; width: 18px; height: 18px; }
        
        .m-form textarea { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; min-height: 100px; resize: vertical; transition: all 0.2s; }
        .m-form textarea:focus { border-color: #4f46e5; background: #fff; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); }

        .submit-ticket-btn { 
          width: 100%; background: #4f46e5; color: #fff; border: none; border-radius: 12px; padding: 14px; font-weight: 700; font-size: 15px; 
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
        }
        .submit-ticket-btn:hover { background: #4338ca; transform: translateY(-1px); }
        .submit-ticket-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .void-state { grid-column: 1/-1; padding: 80px; text-align: center; color: #94a3b8; }
        .loading-orbit { width: 32px; height: 32px; border: 2px solid #e2e8f0; border-top-color: #4f46e5; border-radius: 50%; animation: spin 1s infinite linear; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .top-right-actions { display: flex; align-items: center; gap: 10px; }
        .edit-mini-btn { background: #f1f5f9; color: #64748b; border: none; border-radius: 6px; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .edit-mini-btn:hover { background: #e2e8f0; color: #1e293b; }

        @media (max-width: 768px) {
          .page-container { padding: 20px; }
          .top-banner { flex-direction: column; align-items: stretch; gap: 24px; }
          .brand-h1 { font-size: 24px; }
          .banner-right { flex-direction: column; align-items: stretch; }
          .search-pill { min-width: 0; }
          .task-tabs { flex-direction: column; align-items: flex-start; }
          .form-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </motion.div>
  )
}

export default JobAllocation
