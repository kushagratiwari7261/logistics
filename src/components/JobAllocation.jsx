import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { 
  Briefcase, 
  User, 
  Calendar, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Filter
} from 'lucide-react'
import Header from './Header'

const JobAllocation = ({ user }) => {
  const [jobs, setJobs] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch unassigned or all active jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })

      // Fetch potential assignees (profiles)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')

      if (jobsError) throw jobsError
      if (profilesError) throw profilesError

      setJobs(jobsData || [])
      setProfiles(profilesData || [])
    } catch (err) {
      console.error('Fetch error:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async (jobId, userId) => {
    setUpdatingId(jobId)
    try {
      const deadline = new Date()
      deadline.setDate(deadline.getDate() + 7) // Default 7 day deadline

      const { error } = await supabase
        .from('jobs')
        .update({ 
          assigned_to: userId,
          deadline_at: deadline.toISOString(),
          status: 'Assigned'
        })
        .eq('id', jobId)

      if (error) throw error
      
      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { ...job, assigned_to: userId, status: 'Assigned', deadline_at: deadline.toISOString() } 
          : job
      ))
    } catch (err) {
      alert('Error assigning job: ' + err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = (job.job_no?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (job.customer?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'unassigned' && !job.assigned_to) ||
                         (filterStatus === 'assigned' && job.assigned_to)
    return matchesSearch && matchesFilter
  })

  return (
    <div className="page-container">
      <div className="page-header-section" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Job Allocation</h1>
        <p style={{ color: 'var(--text-muted)' }}>Assign team members to active tracking jobs and set deadlines.</p>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: 16, 
        marginBottom: 24,
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search by Job ID or Customer..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px 12px 48px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: 14
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'unassigned', 'assigned'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: filterStatus === status ? 'var(--brand-primary)' : 'var(--bg-surface)',
                color: filterStatus === status ? '#fff' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 100, textAlign: 'center' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading jobs for allocation...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {filteredJobs.length === 0 ? (
            <div style={{ gridColumn: '1/-1', padding: 80, textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 20, border: '1px dashed var(--border)' }}>
              <AlertCircle size={40} style={{ color: 'var(--text-muted)', marginBottom: 16, opacity: 0.5 }} />
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>No matching jobs found</h3>
              <p style={{ color: 'var(--text-muted)' }}>Try adjusting your filters or search term.</p>
            </div>
          ) : filteredJobs.map(job => (
            <div key={job.id} style={{
              background: 'var(--bg-surface)',
              borderRadius: 20,
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'default'
            }} onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.08)'
            }} onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.03)'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ padding: '4px 10px', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--brand-primary)', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                    JOB #{job.job_no || job.id.slice(0, 8)}
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6, 
                    fontSize: 12, 
                    fontWeight: 600, 
                    color: job.assigned_to ? 'var(--success)' : '#f59e0b'
                  }}>
                    {job.assigned_to ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    {job.assigned_to ? 'Assigned' : 'Awaiting Allocation'}
                  </div>
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{job.customer || 'Unknown Customer'}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{job.por || 'N/A'} → {job.pod || 'N/A'}</p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
                  Assign To
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <select
                    value={job.assigned_to || ''}
                    onChange={(e) => handleAssign(job.id, e.target.value)}
                    disabled={updatingId === job.id}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface-2)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      cursor: updatingId === job.id ? 'wait' : 'pointer'
                    }}
                  >
                    <option value="">Unassigned</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              {job.deadline_at && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface-2)', padding: '10px 16px', borderRadius: 12 }}>
                  <Calendar size={14} color="var(--brand-primary)" />
                  <span>Deadline: <strong>{new Date(job.deadline_at).toLocaleDateString()}</strong></span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default JobAllocation
