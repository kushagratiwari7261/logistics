import { useEffect, useRef } from 'react'
import { Ship, Briefcase, FileText, MessageSquare, TrendingUp } from 'lucide-react'

const iconMap = {
  blue: <Ship size={22} />,
  teal: <Briefcase size={22} />,
  yellow: <FileText size={22} />,
  red: <MessageSquare size={22} />,
}

const trendColor = { blue: '#818cf8', teal: '#22d3ee', yellow: '#fbbf24', red: '#f87171' }

function useCountUp(target, duration = 900) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const numericTarget = parseInt(String(target).replace(/\D/g, ''), 10)
    if (isNaN(numericTarget)) { el.textContent = target; return }
    const prefix = String(target).includes('$') ? '$' : ''
    const suffix = String(target).includes('%') ? '%' : ''
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3) // ease-out-cubic
      el.textContent = prefix + Math.floor(ease * numericTarget).toLocaleString() + suffix
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return ref
}

function StatCard({ label, value, iconType = 'blue', id, onClick, trend }) {
  const valueRef = useCountUp(value)

  return (
    <div
      className={`stat-card ${iconType}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      id={id}
    >
      <div className={`stat-icon ${iconType}`}>
        {iconMap[iconType] ?? iconMap.blue}
      </div>

      <div className="stat-info">
        <div className="stat-label">{label}</div>
        <div className="stat-value" ref={valueRef}>{value}</div>
        {trend !== undefined && (
          <div className="stat-trend" style={{ color: trendColor[iconType] }}>
            <TrendingUp size={12} style={{ marginRight: 4 }} />
            {trend}
          </div>
        )}
      </div>
    </div>
  )
}

export default StatCard
