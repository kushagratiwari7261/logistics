import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { Calendar, TrendingUp, Users, Clock, AlertTriangle, ArrowLeft } from 'lucide-react';

const COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#6366F1'];

export default function AttendanceStats({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('daily'); // 'daily', 'monthly', 'yearly'
  
  // Data aggregates
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [statCounts, setStatCounts] = useState({ present: 0, late: 0, excused: 0, absent: 0 });
  const [dailyChartData, setDailyChartData] = useState([]);
  const [monthlyChartData, setMonthlyChartData] = useState([]);
  const [yearlyChartData, setYearlyChartData] = useState([]);
  const [roleBreakdownData, setRoleBreakdownData] = useState([]);

  useEffect(() => {
    const fetchStatsData = async () => {
      setLoading(true);
      try {
        // 1. Fetch total employees count
        const { count: empCount } = await supabase
          .from('employees')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true);
        
        const totalEmp = empCount || 0;
        setTotalEmployees(totalEmp);

        // 2. Fetch all attendance logs
        const { data: logs } = await supabase
          .from('attendance')
          .select('*')
          .order('date', { ascending: true });

        const attendanceLogs = logs || [];

        // 3. Today's counters
        const todayStr = new Date().toISOString().split('T')[0];
        const todayLogs = attendanceLogs.filter(log => log.date === todayStr);
        const todayPresent = todayLogs.length;
        const todayLate = todayLogs.filter(l => l.status === 'Late').length;
        const todayExcused = todayLogs.filter(l => l.status === 'Excused').length;
        const todayAbsent = Math.max(0, totalEmp - todayPresent);

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

        // 5. Daily bar chart data (last 7 days)
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          
          const dayLogs = attendanceLogs.filter(log => log.date === dateStr);
          const present = dayLogs.length;
          const late = dayLogs.filter(l => l.status === 'Late').length;
          const excused = dayLogs.filter(l => l.status === 'Excused').length;
          
          last7Days.push({
            name: new Date(dateStr).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' }),
            'On Time': present - late - excused,
            'Late': late,
            'Excused': excused,
            'Absent': Math.max(0, totalEmp - present)
          });
        }
        setDailyChartData(last7Days);

        // 6. Monthly trend line data (grouped by date)
        const dateGroups = {};
        attendanceLogs.forEach(log => {
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
            'Rate %': Math.round((stats.present / totalEmp) * 100),
            'Late Logs': stats.late,
            'Excuses': stats.excused
          };
        });
        setMonthlyChartData(monthlyData);

        // 7. Yearly aggregate data (grouped by month)
        const monthGroups = {};
        attendanceLogs.forEach(log => {
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

      } catch (err) {
        console.error('Error fetching analytics reports:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatsData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Compiling historical charts...</p>
      </div>
    );
  }

  const overallPresentToday = statCounts.present + statCounts.late + statCounts.excused;
  const attendanceRateToday = totalEmployees > 0 ? Math.round((overallPresentToday / totalEmployees) * 100) : 0;
  const lateRateToday = overallPresentToday > 0 ? Math.round((statCounts.late / overallPresentToday) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col relative overflow-x-hidden p-6">
      {/* Background glowing decorations */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-900/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-emerald-950/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl w-full mx-auto flex flex-col gap-6 z-10">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-900">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 transition duration-300 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Console
          </button>
          
          <div className="text-right">
            <h1 className="text-xl font-black bg-gradient-to-r from-white via-slate-300 to-slate-400 bg-clip-text text-transparent">Biometric Analytics Hub</h1>
            <p className="text-xs text-slate-500">Corporate attendance insights and trends</p>
          </div>
        </div>

        {/* Stats Grid row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-md">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Attendance Rate Today</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-black mt-2 text-emerald-400">{attendanceRateToday}%</div>
            <p className="text-[10px] text-slate-500 mt-1">Target benchmark: &gt; 92% daily</p>
          </div>

          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-md">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Active Employees</span>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-black mt-2 text-white">{totalEmployees}</div>
            <p className="text-[10px] text-slate-500 mt-1">Excludes deactivated profile assets</p>
          </div>

          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-md">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Delay Rate (Late logs)</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-3xl font-black mt-2 text-amber-400">{lateRateToday}%</div>
            <p className="text-[10px] text-slate-500 mt-1">Proportion of delayed shift sign-ins</p>
          </div>

          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-md">
            <div className="flex justify-between items-start text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Manual Overrides</span>
              <AlertTriangle className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-black mt-2 text-indigo-400">{statCounts.excused}</div>
            <p className="text-[10px] text-slate-500 mt-1">Admin override checks processed today</p>
          </div>
        </div>

        {/* Timeframe selector toolbar */}
        <div className="flex bg-slate-900/40 border border-slate-900 rounded-xl p-1 w-fit self-start">
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
        </div>

        {/* MAIN CHART CONTAINER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Visualizer Column */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md">
            <h3 className="text-base font-bold mb-6 text-slate-200 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" /> 
              {timeframe === 'daily' && 'Daily Attendance Split (Last 7 Days)'}
              {timeframe === 'monthly' && 'Monthly Performance Ratio Trend'}
              {timeframe === 'yearly' && 'Yearly Aggregate Check-in Volumes'}
            </h3>

            <div className="h-[360px] w-full">
              {timeframe === 'daily' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px' }}
                      labelStyle={{ fontWeight: 'bold', color: '#F1F5F9' }}
                    />
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
          <div className="rounded-3xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md flex flex-col gap-6">
            <h3 className="text-base font-bold text-slate-200 pb-3 border-b border-slate-900">
              Role Attendance Ratios (Today)
            </h3>

            <div className="h-[220px] w-full flex items-center justify-center">
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
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-col gap-3.5">
              {roleBreakdownData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-md" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-slate-400">{item.name}</span>
                  </div>
                  <span className="font-mono text-slate-200">{item.value} staff</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
