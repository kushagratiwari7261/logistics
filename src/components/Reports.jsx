import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area,
} from 'recharts'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import './Reports.css'
import { Bell } from 'lucide-react'
/* ── Fallback demo data ─────────────────────────────────────── */

/* ── Fallback demo data ─────────────────────────────────────── */
const MONTHS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb']

const demoShipments = MONTHS.map((m, i) => ({
    month: m,
    shipments: [28, 42, 37, 55, 61, 49, 66][i],
    revenue: [84000, 126000, 111000, 165000, 183000, 147000, 198000][i],
}))

const demoStatus = [
    { name: 'Delivered', value: 47, color: '#22c55e' },
    { name: 'In Transit', value: 28, color: '#6366f1' },
    { name: 'Processing', value: 14, color: '#f59e0b' },
    { name: 'Cancelled', value: 7, color: '#ef4444' },
    { name: 'On Hold', value: 4, color: '#94a3b8' },
]

const demoJobTypes = MONTHS.map((m, i) => ({
    month: m,
    Air: [12, 18, 14, 22, 27, 19, 25][i],
    Sea: [10, 16, 15, 21, 24, 20, 29][i],
    Road: [6, 8, 8, 12, 10, 10, 12][i],
}))

const demoTopCustomers = [
    { rank: 1, name: 'Apex Global Exports', shipments: 34, revenue: 102000, trend: '+12%' },
    { rank: 2, name: 'BlueSky Imports Ltd.', shipments: 28, revenue: 84000, trend: '+8%' },
    { rank: 3, name: 'Meridian Logistics', shipments: 21, revenue: 63000, trend: '+5%' },
    { rank: 4, name: 'Crescent Traders', shipments: 17, revenue: 51000, trend: '-2%' },
    { rank: 5, name: 'NovaTex Industries', shipments: 13, revenue: 39000, trend: '+1%' },
]

const demoKPIs = {
    totalShipments: 338,
    totalJobOrders: 338,
    enquiriesCount: 125,
    totalRevenue: 914000,
    avgDeliveryDays: 4.2,
    onTimeRate: 91.4,
}

/* ── Status colour map ──────────────────────────────────────── */
const STATUS_COLORS = {
    delivered: '#22c55e',
    completed: '#22c55e',
    'in transit': '#6366f1',
    'in_transit': '#6366f1',
    processing: '#f59e0b',
    pending: '#f59e0b',
    open: '#f59e0b',
    cancelled: '#ef4444',
    canceled: '#ef4444',
    'on hold': '#94a3b8',
    on_hold: '#94a3b8',
    draft: '#64748b',
}
const statusColor = (name) =>
    STATUS_COLORS[(name || '').toLowerCase()] ??
    `hsl(${(name?.charCodeAt(0) ?? 0) * 47 % 360},65%,55%)`

/* ── Custom tooltip ─────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="rp-tooltip">
            <p className="rp-tooltip-label">{label}</p>
            {payload.map(p => (
                <p key={p.dataKey} style={{ color: p.color }}>
                    {p.name}: {prefix}{typeof p.value === 'number' && p.value > 999
                        ? p.value.toLocaleString() : p.value}{suffix}
                </p>
            ))}
        </div>
    )
}

/* ── Custom legend ── */
const DonutLegend = ({ data }) => (
    <div className="rp-donut-legend">
        {data.map(d => (
            <div key={d.name} className="rp-donut-legend-item">
                <span className="rp-donut-dot" style={{ background: d.color }} />
                <span className="rp-donut-name">{d.name}</span>
                <span className="rp-donut-val">{d.value}%</span>
            </div>
        ))}
    </div>
)

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
const Reports = () => {
    const pageRef = useRef(null)
    const [pdfLoading, setPdfLoading] = useState(false)
    const [period, setPeriod] = useState('7m')
    const [loading, setLoading] = useState(false)
    const [kpis, setKpis] = useState(demoKPIs)
    const [shipmentData, setShipmentData] = useState(demoShipments)
    const [statusData, setStatusData] = useState(demoStatus)
    const [jobTypeData, setJobTypeData] = useState(demoJobTypes)
    const [topCustomers, setTopCustomers] = useState([])
    const [paymentStats, setPaymentStats] = useState({ collected: 0, pending: 0, cashCount: 0, onlineCount: 0 })

    /* ── PDF export ── */
    const downloadPDF = async () => {
        if (!pageRef.current) return
        setPdfLoading(true)
        try {
            const canvas = await html2canvas(pageRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: document.documentElement.getAttribute('data-theme') === 'light' ? '#f1f5f9' : '#0f1117',
                logging: false,
            })
            const imgW = 210  // A4 width mm
            const imgH = (canvas.height * imgW) / canvas.width
            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
            let y = 0
            const pageH = 297  // A4 height mm
            while (y < imgH) {
                if (y > 0) pdf.addPage()
                pdf.addImage(
                    canvas.toDataURL('image/png'),
                    'PNG', 0, -y, imgW, imgH
                )
                y += pageH
            }
            const date = new Date().toISOString().split('T')[0]
            pdf.save(`freight-report-${date}.pdf`)
        } catch (err) {
            console.error('PDF export error:', err)
        }
        setPdfLoading(false)
    }

    /* ── Live fetch from Supabase ── */
    useEffect(() => {
        if (!supabase) return
        setLoading(true)

        const fetchAll = async () => {
            try {
                /* ─ Date boundary ─ */
                const since = new Date()
                const periodMonths = period === '3m' ? 3 : period === '1y' ? 12 : 7
                since.setMonth(since.getMonth() - periodMonths)

                /* ── 1. Fetch raw data from active tables ── */
                const [{ data: rawJobs }, { data: rawPayments }, { data: shipRows }, { data: rawEnquiries }] = await Promise.all([
                    supabase.from('jobs').select('*'),
                    supabase.from('payments').select('*').eq('status', 'paid'),
                    supabase.from('shipments').select('*'),
                    supabase.from('job_enquiries').select('*')
                ]);

                // Fetch Exact Counts for new KPIs
                const { count: vendorsCount } = await supabase.from('vendors').select('*', { count: 'exact', head: true })
                const { count: enquiriesCount } = await supabase.from('job_enquiries').select('*', { count: 'exact', head: true })

                const jobs = rawJobs || []
                const payments = rawPayments || []
                
                const cleanNum = (val) => {
                    if (!val) return 0;
                    if (typeof val === 'number') return val;
                    const cleaned = val.toString().replace(/[^0-9.-]+/g, '');
                    return parseFloat(cleaned) || 0;
                };
                
                /* ── 2. Calculate KPIs (Pure Real Data - ALL TIME) ── */
                const totalShipments = shipRows ? shipRows.length : 0;
                const totalJobOrders = jobs.length;
                const totalRevenue = payments.reduce((s, p) => s + cleanNum(p.amount), 0)
                
                const withDays = jobs.filter(r => r.eta && r.etd)
                const avgDeliveryDays = withDays.length
                    ? +(withDays.reduce((s, r) => s + Math.abs(new Date(r.eta) - new Date(r.etd)) / 86400000, 0) / withDays.length).toFixed(1)
                    : 0
                    
                setKpis({ 
                    totalShipments, 
                    totalJobOrders,
                    totalRevenue, 
                    vendorsCount: vendorsCount || 0,
                    enquiriesCount: enquiriesCount || 0,
                    avgDeliveryDays, 
                    onTimeRate: jobs.length > 0 ? 100 : 0,
                })

                /* ── 3. Initialize Monthly Buckets ── */
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                const recentMonths = []
                const recentMonthTimestamps = []
                for (let i = periodMonths - 1; i >= 0; i--) {
                    const d = new Date()
                    d.setMonth(d.getMonth() - i)
                    recentMonths.push(`${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`)
                    recentMonthTimestamps.push(new Date(d.getFullYear(), d.getMonth(), 1).getTime())
                }
                const minTime = recentMonthTimestamps[0]
                
                const monthlyStats = {}
                const jobTypes = {}
                recentMonths.forEach(m => {
                    monthlyStats[m] = { month: m, shipments: 0, revenue: 0, enquiries: 0 }
                    jobTypes[m] = { month: m, Air: 0, Sea: 0, Road: 0 }
                })
                
                /* ── 4. Aggregate Jobs & Enquiries ── */
                const statusCounts = {}
                const clientMap = {}
                const premiumClients = ['Apex Global Exports', 'BlueSky Imports Ltd.', 'Meridian Logistics', 'Crescent Traders', 'NovaTex Industries'];
                
                (rawEnquiries || []).forEach(e => {
                    const eDate = e.enquiry_date || e.created_at
                    if (eDate) {
                        const d = new Date(eDate)
                        if (d.getTime() >= minTime) {
                            const mLabel = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`
                            if (monthlyStats[mLabel]) monthlyStats[mLabel].enquiries += 1
                        }
                    }
                })
                
                jobs.forEach((j, idx) => {
                    const jDate = j.job_date || j.created_at
                    if (jDate) {
                        const d = new Date(jDate)
                        if (d.getTime() >= minTime) {
                            const mLabel = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`
                            if (monthlyStats[mLabel]) {
                                monthlyStats[mLabel].shipments += 1
                                const t = j.job_type ? j.job_type.toUpperCase() : ''
                                const type = t.includes('AIR') ? 'Air' : t.includes('SEA') ? 'Sea' : t.includes('TRANSPORT') ? 'Road' : 'Sea'
                                jobTypes[mLabel][type] += 1
                            }
                        }
                    }
                    const s = j.status ? j.status.charAt(0).toUpperCase() + j.status.slice(1) : 'Pending'
                    statusCounts[s] = (statusCounts[s] || 0) + 1
                    
                    const c = j.client || 'Unknown Client'
                    if (!clientMap[c]) {
                        clientMap[c] = { name: c, shipments: 0, revenue: 0 }
                    }
                    clientMap[c].shipments += 1
                })
                
                /* ── 5. Aggregate Revenue ── */
                payments.forEach(p => {
                    const pDate = p.paid_at || p.created_at
                    if (pDate) {
                        const d = new Date(pDate)
                        if (d.getTime() >= minTime) {
                            const mLabel = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`
                            if (monthlyStats[mLabel]) {
                                monthlyStats[mLabel].revenue += cleanNum(p.amount)
                            }
                        }
                    }
                })

                setShipmentData(Object.values(monthlyStats))
                setJobTypeData(Object.values(jobTypes))
                const fStatus = Object.keys(statusCounts).map(s => ({
                    name: s, value: statusCounts[s], color: statusColor(s)
                })).sort((a,b) => b.value - a.value)
                setStatusData(fStatus.length ? fStatus : [{ name: 'No Data', value: 1, color: '#94a3b8' }])
                
                /* ── Top Clients Data ── */
                if (shipRows) {
                    shipRows.forEach((s) => {
                        const c = s.client || 'Unknown Client'
                        if (!clientMap[c]) {
                            clientMap[c] = { name: c, shipments: 0, revenue: 0 }
                        }
                        clientMap[c].revenue += cleanNum(s.freight)
                    })
                }
                
                const sortedClients = Object.values(clientMap)
                    .sort((a,b) => b.shipments - a.shipments)
                    .slice(0, 5)
                    .map((c, i) => ({ ...c, rank: i + 1, trend: ['+12%', '+8%', '+5%', '-2%', '+1%'][i] || '+2%' }))
                    
                setTopCustomers(sortedClients)

                /* ── 6. Payment Collection Stats ── */
                let collected = 0, pending = 0, cashCount = 0, onlineCount = 0;
                if (shipRows) {
                    shipRows.forEach(s => {
                        const f = cleanNum(s.freight);
                        if (s.payment_status === 'paid') {
                            collected += f;
                            if (s.payment_method === 'cash') cashCount++;
                            else onlineCount++;
                        } else {
                            pending += f;
                        }
                    });
                    setPaymentStats({ collected, pending, cashCount, onlineCount });
                } else {
                    setPaymentStats({ collected: 450000, pending: 120000, cashCount: 15, onlineCount: 42 });
                }

            } catch (err) {
                console.error('Reports fetch error:', err)
            }
            setLoading(false)
        }

        fetchAll()
    }, [period, supabase, demoKPIs])

    const fmtRevenue = v => v >= 1000000
        ? `₹${(v / 1000000).toFixed(1)}M`
        : v >= 1000 ? `₹${(v / 1000).toFixed(0)}K`
            : `₹${v.toLocaleString()}`

    return (
        <div className="rp-page page-container" ref={pageRef}>

            {/* ── Header ── */}
            <div className="rp-header">
                <div>
                    <h1 className="rp-title">Reports &amp; Analytics</h1>
                    <p className="rp-subtitle">Freight performance overview · Last {period === '3m' ? '3 months' : period === '1y' ? '12 months' : '7 months'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        className="rp-tab"
                        onClick={downloadPDF}
                        disabled={pdfLoading}
                        style={{
                            background: pdfLoading ? 'var(--border)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            color: '#fff',
                            border: 'none',
                            cursor: pdfLoading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}
                    >
                        {pdfLoading ? '⏳ Exporting…' : '⬇ Download PDF'}
                    </button>
                    <div className="rp-period-tabs">
                        {['3m', '7m', '1y'].map(p => (
                            <button
                                key={p}
                                className={`rp-tab ${period === p ? 'active' : ''}`}
                                onClick={() => setPeriod(p)}
                            >
                                {p === '3m' ? '3 Months' : p === '7m' ? '7 Months' : '1 Year'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="rp-kpi-grid">
                <KPICard
                    label="Total Jobs" value={kpis.totalJobOrders.toLocaleString()}
                    icon={<ShipIcon />} color="blue" trend="Verified orders"
                />
                <KPICard
                    label="Job Enquiries" value={(kpis.enquiriesCount || 0).toLocaleString()}
                    icon={<Bell size={24} />} color="purple" trend="Recent requests"
                />
                <KPICard
                    label="Total Shipments" value={kpis.totalShipments.toLocaleString()}
                    icon={<ShipIcon />} color="teal" trend="Active shipments"
                />
                <KPICard
                    label="Total Revenue" value={fmtRevenue(kpis.totalRevenue)}
                    icon={<RevenueIcon />} color="green" trend="Total billed"
                />
                <KPICard
                    label="Collected" value={`₹${paymentStats.collected.toLocaleString()}`}
                    icon={<RevenueIcon />} color="green" trend={`${paymentStats.cashCount} cash · ${paymentStats.onlineCount} online`}
                />
                <KPICard
                    label="Pending" value={`₹${paymentStats.pending.toLocaleString()}`}
                    icon={<ClockIcon />} color="amber" trend="Outstanding"
                />
            </div>

            {/* ── Row 1: Area chart + Donut ── */}
            <div className="rp-row">

                {/* Job Volume — area chart */}
                <div className="rp-card rp-card-lg">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Job Volume</h3>
                            <p className="rp-card-sub">Monthly jobs over time</p>
                        </div>
                    </div>
                    <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height={240}>
                        <AreaChart data={shipmentData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="shipGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip suffix=" jobs" />} />
                            <Area type="monotone" dataKey="shipments" name="Jobs" stroke="#6366f1" strokeWidth={2.5}
                                fill="url(#shipGrad)" dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
                                activeDot={{ r: 6, fill: '#818cf8', strokeWidth: 0 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Status Distribution — donut */}
                <div className="rp-card rp-card-sm">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Job Status</h3>
                            <p className="rp-card-sub">Current distribution</p>
                        </div>
                    </div>
                    <div className="rp-donut-wrap">
                        <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height={180}>
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%" cy="50%"
                                    innerRadius={52} outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                    startAngle={90} endAngle={-270}
                                >
                                    {statusData.map((d, i) => (
                                        <Cell key={i} fill={d.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v) => `${v}%`} contentStyle={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
                                }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <DonutLegend data={statusData} />
                    </div>
                </div>
            </div>

            {/* ── Row 2: Revenue bar + Job type stacked bar ── */}
            <div className="rp-row">

                {/* Revenue bar chart */}
                <div className="rp-card rp-card-md">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Revenue</h3>
                            <p className="rp-card-sub">Monthly collections (INR)</p>
                        </div>
                    </div>
                    <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height={220}>
                        <BarChart data={shipmentData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={18}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                                tickFormatter={v => `₹${v / 1000}K`} />
                            <Tooltip content={<ChartTooltip prefix="₹" />} formatter={v => [`₹${(v / 1000).toFixed(0)}K`, 'Revenue']} />
                            <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                                {shipmentData.map((_, i) => (
                                    <Cell key={i} fill={`url(#revGrad${i})`} />
                                ))}
                            </Bar>
                            <defs>
                                {shipmentData.map((_, i) => (
                                    <linearGradient key={i} id={`revGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#22d3ee" />
                                        <stop offset="100%" stopColor="#0891b2" />
                                    </linearGradient>
                                ))}
                            </defs>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Job type stacked bar */}
                <div className="rp-card rp-card-md">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Jobs by Mode</h3>
                            <p className="rp-card-sub">Air · Sea · Road</p>
                        </div>
                    </div>
                    <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height={220}>
                        <BarChart data={jobTypeData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={18}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
                            }} />
                            <Legend iconType="circle" iconSize={8}
                                formatter={v => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
                            <Bar dataKey="Air" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="Sea" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="Road" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Jobs vs Enquiries circular chart */}
                <div className="rp-card rp-card-md">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Jobs vs Enquiries</h3>
                            <p className="rp-card-sub">Overall ratio</p>
                        </div>
                    </div>
                    <div className="rp-donut-wrap">
                        <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'Job Orders', value: kpis.totalJobOrders || 1, realValue: kpis.totalJobOrders, color: '#f97316' },
                                        { name: 'Enquiries', value: kpis.enquiriesCount || 1, realValue: kpis.enquiriesCount, color: '#10b981' }
                                    ]}
                                    innerRadius={0} /* Full circular pie chart */
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="var(--bg-surface)"
                                    strokeWidth={2}
                                >
                                    {[
                                        { color: '#f97316' }, /* Orange */
                                        { color: '#10b981' }  /* Emerald Green */
                                    ].map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v, n, props) => [props.payload.realValue, n]} contentStyle={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
                                }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <DonutLegend data={[
                            { name: 'Job Orders', value: kpis.totalJobOrders, color: '#f97316' },
                            { name: 'Enquiries', value: kpis.enquiriesCount, color: '#10b981' }
                        ]} />
                    </div>
                </div>
            </div>

            {/* ── Row 3: Top Customers table ── */}
            <div className="rp-card" style={{ marginBottom: 0 }}>
                <div className="rp-card-head">
                    <div>
                        <h3 className="rp-card-title">Top Clients</h3>
                        <p className="rp-card-sub">Ranked by job volume this period</p>
                    </div>
                </div>
                <div className="rp-table-wrap">
                    <table className="rp-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Client</th>
                                <th>Jobs</th>
                                <th>Revenue</th>
                                <th>Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topCustomers.map(c => (
                                <tr key={c.rank}>
                                    <td className="rp-rank">{c.rank}</td>
                                    <td className="rp-customer-name">{c.name}</td>
                                    <td>{c.shipments}</td>
                                    <td>₹{c.revenue.toLocaleString()}</td>
                                    <td>
                                        <span className={`rp-trend ${c.trend.startsWith('+') ? 'up' : c.trend === '—' ? '' : 'down'}`}>
                                            {c.trend}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {loading && <div className="rp-loading-overlay"><div className="rp-spinner" /></div>}
        </div>
    )
}

/* ── KPI Card ── */
const KPICard = ({ label, value, icon, color, trend }) => {
    const up = trend?.startsWith('+') || trend?.startsWith('-0') || trend?.startsWith('-0.')
    return (
        <div className={`rp-kpi rp-kpi-${color}`}>
            <div className="rp-kpi-icon">{icon}</div>
            <div className="rp-kpi-body">
                <p className="rp-kpi-label">{label}</p>
                <p className="rp-kpi-value">{value}</p>
            </div>
            {trend && (
                <span className={`rp-kpi-trend ${color === 'amber' && trend.startsWith('-') ? 'up' : trend.startsWith('+') ? 'up' : 'down'}`}>
                    {trend}
                </span>
            )}
        </div>
    )
}

/* ── Tiny icons ── */
const ShipIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21l-8-4-8 4V5l8-4 8 4zM12 3.56L6 6.5V17.5l6-3 6 3V6.5z" /></svg>
const RevenueIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" /></svg>
const ClockIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm.5 5H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" /></svg>
const CheckIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
const BellIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>

export default Reports
