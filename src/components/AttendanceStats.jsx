import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import './AttendanceStats.css';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { Calendar, TrendingUp, Users, Clock, AlertTriangle, ArrowLeft } from 'lucide-react';

const COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#6366F1'];

const CustomDailyTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderStyle: 'solid', borderWidth: '1px', borderRadius: '12px', padding: '12px', color: '#F1F5F9' }}>
        <p style={{ fontWeight: 'bold', margin: '0 0 8px 0' }}>{label}</p>
        <p style={{ margin: '4px 0', color: '#10B981' }}>On Time: {data['On Time']}</p>
        <p style={{ margin: '4px 0', color: '#F59E0B' }}>Late: {data['Late']}</p>
        <p style={{ margin: '4px 0', color: '#6366F1' }}>Excused: {data['Excused']}</p>
        <p style={{ margin: '4px 0', color: '#EF4444' }}>Absent: {data['Absent']}</p>
        <hr style={{ borderColor: '#1E293B', margin: '8px 0' }} />
        <p style={{ margin: '4px 0', fontWeight: 'bold' }}>Total Present: {data['Present (Total)']}</p>
        <p style={{ margin: '4px 0', fontWeight: 'bold' }}>Attendance Rate: {data['Rate %']}%</p>
      </div>
    );
  }
  return null;
};

export default function AttendanceStats({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('daily'); // 'daily', 'monthly', 'yearly'
  
  // Data aggregates
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [allLogs, setAllLogs] = useState([]);
  const [statCounts, setStatCounts] = useState({ present: 0, late: 0, excused: 0, absent: 0 });
  const [dailyChartData, setDailyChartData] = useState([]);
  const [monthlyChartData, setMonthlyChartData] = useState([]);
  const [yearlyChartData, setYearlyChartData] = useState([]);
  const [roleBreakdownData, setRoleBreakdownData] = useState([]);
  const [presentTodayList, setPresentTodayList] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [employeeMonthlyData, setEmployeeMonthlyData] = useState([]);
  const [selectedEmployeeForModal, setSelectedEmployeeForModal] = useState(null);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    if (d.getDay() === 0) d.setDate(d.getDate() - 1); // fallback from Sunday
    return d.toLocaleDateString('en-CA');
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const { data: empData } = await supabase
          .from('employees')
          .select('id, name, created_at, is_active')
          .eq('is_active', true);
        
        setEmployeesList(empData || []);
        setTotalEmployees(empData ? empData.length : 0);

        const { data: logs } = await supabase
          .from('attendance')
          .select('*')
          .order('date', { ascending: true });

        setAllLogs(logs || []);
      } catch (err) {
        console.error('Error fetching analytics reports:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (loading) return;

    // 3. Selected Date's counters
    const todayLogs = allLogs.filter(log => log.date === selectedDate);
    const todayPresent = todayLogs.length;
    const todayLate = todayLogs.filter(l => l.status === 'Late').length;
    const todayExcused = todayLogs.filter(l => l.status === 'Excused').length;
    const todayAbsent = Math.max(0, totalEmployees - todayPresent);

    setStatCounts({
      present: todayPresent - todayLate - todayExcused,
      late: todayLate,
      excused: todayExcused,
      absent: todayAbsent
    });

    // 4. Role Breakdown pie chart
    const officePresent = todayLogs.filter(l => l.role === 'office').length;
    const fieldPresent = todayLogs.filter(l => l.role === 'field').length;
    setRoleBreakdownData([
      { name: 'Office Staff Present', value: officePresent },
      { name: 'Field Staff Present', value: fieldPresent },
      { name: 'Absent Staff', value: todayAbsent }
    ]);

    // 4b. Save selected date's present list
    setPresentTodayList(todayLogs);

    // 5. Daily bar chart data (last 7 working days ending on selectedDate)
    const last7Days = [];
    let offset = 0;
    
    while(last7Days.length < 7) {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - offset);
      offset++;
      
      if (d.getDay() === 0) continue; // Skip Sunday
      
      const dateStr = d.toLocaleDateString('en-CA');
      
      const dayLogs = allLogs.filter(log => log.date === dateStr);
      const present = dayLogs.length;
      const late = dayLogs.filter(l => l.status === 'Late').length;
      const excused = dayLogs.filter(l => l.status === 'Excused').length;
      const absent = Math.max(0, totalEmployees - present);
      
      last7Days.unshift({
        name: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        'On Time': present - late - excused,
        'Late': late,
        'Excused': excused,
        'Absent': absent,
        'Present (Total)': present,
        'Rate %': totalEmployees > 0 ? Math.round((present / totalEmployees) * 100) : 0
      });
    }
    setDailyChartData(last7Days);

    // 6. Monthly trend line data
    const dateGroups = {};
    allLogs.forEach(log => {
      if (!dateGroups[log.date]) {
        dateGroups[log.date] = { present: 0, late: 0, excused: 0 };
      }
      dateGroups[log.date].present += 1;
      if (log.status === 'Late') dateGroups[log.date].late += 1;
      if (log.status === 'Excused') dateGroups[log.date].excused += 1;
    });

    const sortedDates = Object.keys(dateGroups).sort();
    const monthlyData = sortedDates.map(date => {
      const stats = dateGroups[date];
      return {
        name: new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        'Rate %': totalEmployees > 0 ? Math.round((stats.present / totalEmployees) * 100) : 0,
        'Late Logs': stats.late,
        'Excuses': stats.excused
      };
    });
    setMonthlyChartData(monthlyData);

    // 7. Yearly aggregate data
    const monthGroups = {};
    allLogs.forEach(log => {
      const monthStr = log.date.substring(0, 7); // 'YYYY-MM'
      if (!monthGroups[monthStr]) {
        monthGroups[monthStr] = { present: 0, count: 0 };
      }
      monthGroups[monthStr].present += 1;
    });

    const sortedMonths = Object.keys(monthGroups).sort();
    const yearlyData = sortedMonths.map(month => {
      return {
        name: new Date(month + '-02').toLocaleDateString([], { month: 'short', year: '2-digit' }),
        'Total check-ins': monthGroups[month].present
      };
    });
    setYearlyChartData(yearlyData);

    // 8. Monthly Employee Report
    const targetMonthStr = selectedDate.substring(0, 7); // 'YYYY-MM'
    const [y, m] = targetMonthStr.split('-');
    const monthStart = new Date(y, parseInt(m) - 1, 1);
    
    const now = new Date();
    const isCurrentMonth = (now.getFullYear() === parseInt(y) && now.getMonth() === parseInt(m) - 1);
    const monthEnd = isCurrentMonth ? new Date(now.toLocaleDateString('en-CA')) : new Date(y, parseInt(m), 0);
    
    const empMonthly = employeesList.map(emp => {
      let empStart = new Date(monthStart);
      if (emp.created_at) {
        const joinDate = new Date(emp.created_at);
        if (joinDate > monthStart) {
          empStart = new Date(joinDate.toLocaleDateString('en-CA'));
        }
      }
      
      let workingDays = 0;
      for (let d = new Date(empStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0) workingDays++;
      }
      
      const presentLogs = allLogs.filter(log => 
        log.employee_id === emp.id && 
        log.date.startsWith(targetMonthStr)
      );
      
      const present = presentLogs.length;
      const absent = Math.max(0, workingDays - present);
      
      return {
        id: emp.id,
        name: emp.name || 'Unknown',
        workingDays,
        present,
        absent,
        rate: workingDays > 0 ? Math.round((present / workingDays) * 100) : 0
      };
    });
    
    setEmployeeMonthlyData(empMonthly.sort((a, b) => String(a.id).localeCompare(String(b.id))));

  }, [selectedDate, allLogs, totalEmployees, employeesList, loading]);

  const handleDateChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const d = new Date(val);
    if (d.getDay() === 0) {
      alert("Sundays are non-working days. Please select another date.");
      e.target.value = selectedDate; // Reset visually
      return;
    }
    setSelectedDate(val);
  };

  if (loading) {
    return (
      <div className="admin-loading-screen">
        <div className="admin-spinner" />
        <p className="admin-loading-text">Compiling historical charts...</p>
      </div>
    );
  }

  const overallPresentToday = statCounts.present + statCounts.late + statCounts.excused;
  const attendanceRateToday = totalEmployees > 0 ? Math.round((overallPresentToday / totalEmployees) * 100) : 0;
  const lateRateToday = overallPresentToday > 0 ? Math.round((statCounts.late / overallPresentToday) * 100) : 0;

  return (
    <div className="stats-container">
      {/* Background glowing decorations */}
      <div className="stats-glow-indigo" />
      <div className="stats-glow-emerald" />

      <div className="stats-main">
        
        {/* Top Header */}
        <div className="stats-header">
          <button 
            onClick={onBack}
            className="stats-btn-back"
          >
            <ArrowLeft  /> Back to Console
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-surface)', padding: '0.5rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
              <Calendar size={18} style={{ color: 'var(--brand-primary)' }} />
              <input 
                type="date" 
                value={selectedDate}
                onChange={handleDateChange}
                style={{ 
                  background: 'transparent', border: 'none', outline: 'none', 
                  color: 'var(--text-primary)', fontWeight: 'bold', fontFamily: 'inherit',
                  cursor: 'pointer'
                }}
              />
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1 className="stats-title">Biometric Analytics Hub</h1>
              <p className="stats-subtitle">Corporate attendance insights and trends</p>
            </div>
          </div>
        </div>

        {/* PROMINENT MONTHLY PRESENT COUNT */}
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={20} style={{ color: "var(--brand-primary)" }} /> Monthly Present Count (ID Wise)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }} className="custom-scrollbar">
            {employeeMonthlyData.length > 0 ? (
              employeeMonthlyData.map((emp) => (
                <div 
                  key={emp.id} 
                  onClick={() => setSelectedEmployeeForModal(emp)}
                  style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '1rem', backgroundColor: 'var(--bg-base)', borderRadius: '0.75rem', 
                    border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--brand-primary)', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.id}</span>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</span>
                  </div>
                  <span style={{ fontSize: '0.9rem', padding: '0.3rem 0.6rem', borderRadius: '0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {emp.present} days
                  </span>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-secondary)', padding: '1rem' }}>No monthly data</div>
            )}
          </div>
        </div>

        {/* Stats Grid row */}
        <div className="stats-grid">
          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Attendance Rate Today</span>
              <TrendingUp style={{ color: "var(--success)" }} />
            </div>
            <div className="stats-card-value" style={{ color: "var(--success)" }}>{attendanceRateToday}%</div>
            <p className="stats-card-hint">Target benchmark: &gt; 92% daily</p>
          </div>

          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Total Active Employees</span>
              <Users style={{ color: "var(--brand-primary)" }} />
            </div>
            <div className="stats-card-value">{totalEmployees}</div>
            <p className="stats-card-hint">Excludes deactivated profile assets</p>
          </div>

          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Delay Rate (Late logs)</span>
              <Clock style={{ color: "var(--warning)" }} />
            </div>
            <div className="stats-card-value" style={{ color: "var(--warning)" }}>{lateRateToday}%</div>
            <p className="stats-card-hint">Proportion of delayed shift sign-ins</p>
          </div>

          <div className="stats-card">
            <div className="stats-card-header">
              <span className="stats-card-label">Manual Overrides</span>
              <AlertTriangle style={{ color: "var(--brand-primary)" }} />
            </div>
            <div className="stats-card-value" style={{ color: "var(--brand-primary)" }}>{statCounts.excused}</div>
            <p className="stats-card-hint">Admin override checks processed today</p>
          </div>
        </div>

        {/* Timeframe selector toolbar */}
        <div className="stats-toolbar">
          <button
            onClick={() => setTimeframe('daily')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-300 ${
              timeframe === 'daily' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Daily Tracker
          </button>
          <button
            onClick={() => setTimeframe('monthly')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-300 ${
              timeframe === 'monthly' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly Trend
          </button>
          <button
            onClick={() => setTimeframe('yearly')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-300 ${
              timeframe === 'yearly' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Yearly Volume
          </button>
          <button
            onClick={() => setTimeframe('employee_monthly')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-300 ${
              timeframe === 'employee_monthly' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Staff Monthly Report
          </button>
        </div>

        {/* MAIN CHART CONTAINER */}
        <div className="stats-chart-grid">
          
          {/* Main Visualizer Column */}
          <div className="stats-chart-main">
            <h3 className="stats-chart-title">
              <Calendar style={{ color: "var(--brand-primary)" }} /> 
              {timeframe === 'daily' && 'Daily Attendance Split (Last 7 Days)'}
              {timeframe === 'monthly' && 'Monthly Performance Ratio Trend'}
              {timeframe === 'yearly' && 'Yearly Aggregate Check-in Volumes'}
              {timeframe === 'employee_monthly' && `Staff Monthly Report (${new Date(selectedDate).toLocaleString('default', { month: 'long', year: 'numeric' })}) - Total: ${employeeMonthlyData.length}`}
            </h3>

            <div className="stats-chart-container">
              {timeframe === 'employee_monthly' && (
                <div style={{ width: '100%', height: '100%', overflowY: 'auto' }} className="custom-scrollbar">
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface-2)', zIndex: 1 }}>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem', whiteSpace: 'nowrap' }}>Employee ID</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>Name</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Working Days</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Present</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Absent</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeMonthlyData.length > 0 ? (
                        employeeMonthlyData.map(emp => (
                          <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{emp.id}</td>
                            <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{emp.name}</td>
                            <td style={{ textAlign: 'center', padding: '0.75rem', fontWeight: 'bold' }}>{emp.workingDays}</td>
                            <td style={{ textAlign: 'center', padding: '0.75rem', color: '#10B981', fontWeight: 'bold' }}>{emp.present}</td>
                            <td style={{ textAlign: 'center', padding: '0.75rem', color: '#EF4444', fontWeight: 'bold' }}>{emp.absent}</td>
                            <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                              <span style={{ 
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '1rem',
                                backgroundColor: emp.rate >= 90 ? 'rgba(16, 185, 129, 0.1)' : emp.rate >= 75 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: emp.rate >= 90 ? '#10B981' : emp.rate >= 75 ? '#F59E0B' : '#EF4444',
                                fontWeight: 'bold'
                              }}>
                                {emp.rate}%
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            No staff data available for this month.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {timeframe === 'daily' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomDailyTooltip />} />
                    <Legend />
                    <Bar dataKey="On Time" stackId="a" fill="#10B981" />
                    <Bar dataKey="Late" stackId="a" fill="#F59E0B" />
                    <Bar dataKey="Excused" stackId="a" fill="#6366F1" />
                    <Bar dataKey="Absent" stackId="a" fill="#EF4444" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {timeframe === 'monthly' && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyChartData}>
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px' }}
                      labelStyle={{ fontWeight: 'bold', color: '#F1F5F9' }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="Rate %" stroke="#6366F1" fillOpacity={1} fill="url(#colorRate)" strokeWidth={2} />
                    <Line type="monotone" dataKey="Late Logs" stroke="#F59E0B" strokeWidth={1.5} dot={true} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {timeframe === 'yearly' && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={yearlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px' }}
                      labelStyle={{ fontWeight: 'bold', color: '#F1F5F9' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Total check-ins" stroke="#10B981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Breakdown Pie Chart Column */}
          <div className="stats-chart-side">
            <h3 className="stats-chart-title" style={{ marginBottom: 0 }}>
              Role Attendance Ratios (Today)
            </h3>

            <div className="stats-pie-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={roleBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {roleBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', borderRadius: '12px', color: 'var(--text-primary)' }}
                    itemStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="stats-pie-legend">
              {roleBreakdownData.map((item, idx) => (
                <div key={idx} className="stats-legend-item">
                  <div className="stats-legend-left">
                    <div className="stats-legend-dot" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="stats-legend-name">{item.name}</span>
                  </div>
                  <span className="stats-legend-value">{item.value} staff</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={16} /> Present Today ({presentTodayList.length})
              </h4>
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }} className="custom-scrollbar">
                {presentTodayList.length > 0 ? (
                  presentTodayList.map((log) => (
                    <div key={log.id} style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem', backgroundColor: 'var(--bg-base)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>{log.name || 'Unknown'}</span>
                        <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '1rem', backgroundColor: log.status === 'Late' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: log.status === 'Late' ? '#F59E0B' : '#10B981', fontWeight: 'bold' }}>
                          {log.status || 'Present'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        {log.marked_at && <span>In: {new Date(log.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                        {log.out_time && <span>Out: {new Date(log.out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>No staff present today</div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Employee Details Modal */}
      {selectedEmployeeForModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, 
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' 
        }}>
          <div style={{ 
            backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '2rem', borderRadius: '1rem', 
            width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{selectedEmployeeForModal.name}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>ID: {selectedEmployeeForModal.id}</p>
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Working Days: <strong style={{ color: 'var(--text-primary)' }}>{selectedEmployeeForModal.workingDays}</strong></span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Present: <strong style={{ color: '#10B981' }}>{selectedEmployeeForModal.present}</strong></span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Absent: <strong style={{ color: '#EF4444' }}>{selectedEmployeeForModal.absent}</strong></span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEmployeeForModal(null)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 'bold' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-base)'}
              >
                Close
              </button>
            </div>

            <div style={{ overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '0.5rem' }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface-2)' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '1rem', borderBottom: '1px solid var(--border)' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '1rem', borderBottom: '1px solid var(--border)' }}>Login Time</th>
                    <th style={{ textAlign: 'left', padding: '1rem', borderBottom: '1px solid var(--border)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const logs = allLogs
                      .filter(log => log.employee_id === selectedEmployeeForModal.id && log.date.startsWith(selectedDate.substring(0, 7)))
                      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first
                      
                    if (logs.length === 0) {
                      return (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No attendance logs found for this month.</td>
                        </tr>
                      );
                    }
                    
                    return logs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '1rem' }}>{new Date(log.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                        <td style={{ padding: '1rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          {log.marked_at ? new Date(log.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00 AM'}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{ 
                            padding: '0.25rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold',
                            backgroundColor: log.status === 'Late' ? 'rgba(245, 158, 11, 0.1)' : log.status === 'Excused' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: log.status === 'Late' ? '#F59E0B' : log.status === 'Excused' ? '#6366F1' : '#10B981'
                          }}>
                            {log.status || 'Present'}
                          </span>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
