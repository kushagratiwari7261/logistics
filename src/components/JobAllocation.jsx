import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
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
  MoreVertical,
  X,
  Target
} from 'lucide-react'

const JobAllocation = ({ user }) => {
  const [tasksReceived, setTasksReceived] = useState([])
  const [tasksSent, setTasksSent] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('received') // 'received' or 'sent'
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  // Form State
  const [newTicket, setNewTicket] = useState({
    receiver_id: '',
    title: '',
    description: '',
    priority: 'Medium',
    deadline_at: ''
  })

  useEffect(() => {
    if (!user?.id) return
    fetchData()
    subscribeToTasks()
  }, [user?.id])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch profiles for assignment
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name, email')
      setProfiles(profilesData || [])

      // 2. Fetch Tasks received
      const { data: received } = await supabase
        .from('tasks')
        .select('*, sender:profiles!sender_id(full_name, email)')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
      
      // 3. Fetch Tasks sent
      const { data: sent } = await supabase
        .from('tasks')
        .select('*, receiver:profiles!receiver_id(full_name, email)')
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false })

      setTasksReceived(received || [])
      setTasksSent(sent || [])
    } catch (err) {
      console.error('Fetch error:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const subscribeToTasks = () => {
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

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
      fetchData()
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
      fetchData()
    } catch (err) {
      alert('Error updating task: ' + err.message)
    }
  }

  const TaskCard = ({ task, isSent }) => (
    <div style={{
      background: 'var(--bg-surface)',
      borderRadius: 16,
      border: '1px solid var(--border)',
      padding: 20,
      position: 'relative',
      transition: 'all 0.2s',
      boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ 
          fontSize: 11, 
          fontWeight: 800, 
          textTransform: 'uppercase', 
          padding: '4px 8px', 
          borderRadius: 6,
          background: task.priority === 'High' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.1)',
          color: task.priority === 'High' ? '#ef4444' : 'var(--brand-primary)'
        }}>
          {task.priority} Priority
        </span>
        <span style={{ 
          fontSize: 12, 
          fontWeight: 600, 
          color: task.status === 'Completed' ? 'var(--success)' : '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          {task.status === 'Completed' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
          {task.status}
        </span>
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{task.title}</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {task.description}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 'auto' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
          {isSent ? (task.receiver?.full_name?.slice(0,2) || '??') : (task.sender?.full_name?.slice(0,2) || '??')}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {isSent ? `To: ${task.receiver?.full_name || 'User'}` : `From: ${task.sender?.full_name || 'User'}`}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
            Raised on {new Date(task.created_at).toLocaleDateString()}
          </p>
        </div>
        
        {!isSent && task.status !== 'Completed' && (
          <button 
            onClick={() => updateTaskStatus(task.id, 'Completed')}
            style={{ 
              background: 'var(--success)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: 8, 
              padding: '6px 12px', 
              fontSize: 11, 
              fontWeight: 700, 
              cursor: 'pointer' 
            }}
          >
            Mark Done
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Task Manager</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Raise and track tickets for your team members.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          style={{ 
            background: 'var(--brand-gradient)', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 12, 
            padding: '12px 20px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            fontWeight: 700, 
            cursor: 'pointer',
            boxShadow: '0 10px 20px var(--brand-glow)'
          }}
        >
          <Plus size={18} /> Raise Ticket
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button 
          onClick={() => setActiveTab('received')}
          style={{ 
            padding: '12px 16px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'received' ? '2px solid var(--brand-primary)' : '2px solid transparent',
            color: activeTab === 'received' ? 'var(--brand-primary)' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Inbox size={18} /> My Tasks ({tasksReceived.length})
        </button>
        <button 
          onClick={() => setActiveTab('sent')}
          style={{ 
            padding: '12px 16px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'sent' ? '2px solid var(--brand-primary)' : '2px solid transparent',
            color: activeTab === 'sent' ? 'var(--brand-primary)' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Send size={18} /> Raised by Me ({tasksSent.length})
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {loading ? (
          <p>Loading...</p>
        ) : (
          (activeTab === 'received' ? tasksReceived : tasksSent).length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, opacity: 0.5 }}>
              <Target size={48} style={{ marginBottom: 16 }} />
              <p>No tasks found in this section.</p>
            </div>
          ) : (activeTab === 'received' ? tasksReceived : tasksSent).map(task => (
            <TaskCard key={task.id} task={task} isSent={activeTab === 'sent'} />
          ))
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
          <div style={{ background: 'var(--bg-surface)', width: '100%', maxWidth: 500, borderRadius: 24, boxShadow: '0 25px 50px rgba(0,0,0,0.2), 0 0 0 1px var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Raise New Ticket</h2>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={24} /></button>
            </div>
            
            <form onSubmit={handleCreateTicket} style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>Assign To</label>
                <select 
                  required
                  value={newTicket.receiver_id}
                  onChange={e => setNewTicket({...newTicket, receiver_id: e.target.value})}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                >
                  <option value="">Select a team member</option>
                  {profiles.filter(p => p.id !== user.id).map(p => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>Task Title</label>
                <input 
                  required
                  type="text"
                  placeholder="e.g., Update shipment docs"
                  value={newTicket.title}
                  onChange={e => setNewTicket({...newTicket, title: e.target.value})}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>Instructions</label>
                <textarea 
                  rows={3}
                  placeholder="Describe what needs to be done..."
                  value={newTicket.description}
                  onChange={e => setNewTicket({...newTicket, description: e.target.value})}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>Priority</label>
                  <select 
                    value={newTicket.priority}
                    onChange={e => setNewTicket({...newTicket, priority: e.target.value})}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>Deadline</label>
                  <input 
                    type="date"
                    value={newTicket.deadline_at}
                    onChange={e => setNewTicket({...newTicket, deadline_at: e.target.value})}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <button 
                type="submit"
                style={{ marginTop: 12, background: 'var(--brand-gradient)', color: '#fff', border: 'none', borderRadius: 12, padding: '16px', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 10px 20px var(--brand-glow)' }}
              >
                Raise Ticket
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .page-container {
          padding: 40px;
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default JobAllocation
