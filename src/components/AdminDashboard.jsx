import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { 
  Users, MapPin, Calendar, Clock, Download, Plus, Shield, ShieldCheck, 
  Trash2, Upload, AlertCircle, CheckCircle, Search, Settings, 
  FileSpreadsheet, Edit3, X, Play, AlertTriangle, BarChart2
} from 'lucide-react';

export default function AdminDashboard({ onBack }) {
  const navigate = useNavigate();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [adminProfile, setAdminProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance', 'employees', 'config', 'holidays'

  // DB Data States
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [officeConfig, setOfficeConfig] = useState({
    lat: 28.5355,
    lng: 77.3910,
    radius_meters: 100,
    start_time: '09:00:00',
    end_time: '18:00:00',
    grace_period_minutes: 15
  });

  // UI Helpers
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success'|'error', text: '' }
  
  // Date Range CSV Exporter State
  const [csvDateRange, setCsvDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Employee Enrollment Form State
  const [enrollForm, setEnrollForm] = useState({
    name: '',
    email: '',
    role: 'office'
  });
  const [enrollPhotos, setEnrollPhotos] = useState([]);
  const [enrollProgress, setEnrollProgress] = useState(0); // 0 to 100
  const [enrollLoading, setEnrollLoading] = useState(false);

  // Office Config Form State (Super Admin Only)
  const [configForm, setConfigForm] = useState({ ...officeConfig });
  const [configLoading, setConfigLoading] = useState(false);

  // Holidays Form State (Super Admin Only)
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '' });
  const [holidayLoading, setHolidayLoading] = useState(false);

  // Absent Cycling Popup Notification State
  const [absentEmployees, setAbsentEmployees] = useState([]);
  const [currentAbsentIndex, setCurrentAbsentIndex] = useState(0);
  const [popupProgress, setPopupProgress] = useState(100);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedOverrideEmp, setSelectedOverrideEmp] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);

  const cyclingTimerRef = useRef(null);
  const progressTimerRef = useRef(null);

  // 1. Authenticate and check Admin rights
  useEffect(() => {
    const checkAdminRights = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setIsAdminUser(false);
        setLoading(false);
        return;
      }

      const email = session.user.email.trim().toLowerCase();
      
      // Fetch from admins table
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error || !data) {
        setIsAdminUser(false);
        setLoading(false);
        return;
      }

      setIsAdminUser(true);
      setAdminProfile(data);
      setIsSuperAdminUser(data.is_super_admin);
      setLoading(false);
    };

    checkAdminRights();
  }, []);

  // 2. Fetch Database Data
  const fetchData = async () => {
    try {
      // Fetch Employees
      const { data: empData } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true });
      setEmployees(empData || []);

      // Fetch Today's Attendance logs
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: attData } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', todayStr);
      setAttendance(attData || []);

      // Fetch Office Configurations
      const { data: configData } = await supabase
        .from('office_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (configData) {
        setOfficeConfig(configData);
        setConfigForm(configData);
      }

      // Fetch Holidays
      const { data: holData } = await supabase
        .from('holidays')
        .select('*')
        .order('holiday_date', { ascending: true });
      setHolidays(holData || []);

    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
    }
  };

  useEffect(() => {
    if (isAdminUser) {
      fetchData();
    }
  }, [isAdminUser]);

  // 3. Set up Supabase Realtime Subscription for live updates
  useEffect(() => {
    if (!isAdminUser) return;

    console.log('🔌 Subscribing to live Realtime updates...');
    const attendanceChannel = supabase
      .channel('live-admin-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, (payload) => {
        console.log('🔄 Live attendance table change detected:', payload);
        fetchData(); // Trigger full refresh to update counters and grids
      })
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
    };
  }, [isAdminUser]);

  // 4. Calculate Absent Employees list for the cycling popup
  useEffect(() => {
    if (employees.length === 0) return;

    // Filter employees who are active and do not have an attendance entry today
    const checkedInEmpIds = new Set(attendance.map((att) => att.employee_id));
    const absentList = employees.filter((emp) => emp.is_active && !checkedInEmpIds.has(emp.id));
    
    setAbsentEmployees(absentList);
    // Reset index if list length shrinks below index bounds
    if (currentAbsentIndex >= absentList.length) {
      setCurrentAbsentIndex(0);
    }
  }, [employees, attendance]);

  // 5. Cycling Absentee Alerts timer loops (5 second countdowns)
  useEffect(() => {
    if (absentEmployees.length === 0 || showOverrideModal) {
      clearInterval(cyclingTimerRef.current);
      clearInterval(progressTimerRef.current);
      return;
    }

    // Set progress bar timer (updates every 50ms for smooth fluid animation)
    const cycleTime = 5000; // 5 seconds
    const intervalTime = 50;
    let elapsed = 0;

    clearInterval(cyclingTimerRef.current);
    clearInterval(progressTimerRef.current);

    progressTimerRef.current = setInterval(() => {
      elapsed += intervalTime;
      const rem = 100 - (elapsed / cycleTime) * 100;
      setPopupProgress(Math.max(0, rem));
    }, intervalTime);

    cyclingTimerRef.current = setInterval(() => {
      elapsed = 0;
      setCurrentAbsentIndex((prevIndex) => {
        if (prevIndex >= absentEmployees.length - 1) {
          return 0;
        }
        return prevIndex + 1;
      });
    }, cycleTime);

    return () => {
      clearInterval(cyclingTimerRef.current);
      clearInterval(progressTimerRef.current);
    };
  }, [absentEmployees, showOverrideModal]);

  // Handle Photo selection for Biometric Enrollment
  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 3 || files.length > 5) {
      showStatus('error', 'Please select exactly 3 to 5 images.');
      return;
    }
    setEnrollPhotos(files);
  };

  // Dispatch Employee enrollment to FastAPI Backend
  const handleEnrollEmployee = async (e) => {
    e.preventDefault();
    if (enrollPhotos.length < 3 || enrollPhotos.length > 5) {
      showStatus('error', 'Biometric enrollment requires 3 to 5 face photographs.');
      return;
    }

    setEnrollLoading(true);
    setEnrollProgress(10);
    showStatus(null, '');

    const { data: { session } } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append('name', enrollForm.name);
    formData.append('email', enrollForm.email.trim().toLowerCase());
    formData.append('role', enrollForm.role);
    
    enrollPhotos.forEach((file) => {
      formData.append('images', file);
    });

    try {
      setEnrollProgress(30);
      const response = await fetch(`${import.meta.env.VITE_BIOMETRIC_API_URL}/api/enroll-employee`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });

      setEnrollProgress(70);
      const result = await response.json();

      if (response.ok && result.success) {
        setEnrollProgress(100);
        showStatus('success', `Employee successfully enrolled. ID: ${result.employee_id}`);
        setEnrollForm({ name: '', email: '', role: 'office' });
        setEnrollPhotos([]);
        fetchData();
      } else {
        throw new Error(result.detail || 'Failed to enroll employee.');
      }
    } catch (err) {
      showStatus('error', err.message || 'Error communicating with biometric backend.');
    } finally {
      setEnrollLoading(false);
      setTimeout(() => setEnrollProgress(0), 3000);
    }
  };

  // Manage Active/Inactive State
  const toggleEmployeeStatus = async (empId, currentActive) => {
    try {
      const { error } = await supabase
        .from('employees')
        .update({ is_active: !currentActive })
        .eq('id', empId);
      
      if (error) throw error;
      showStatus('success', `Employee status successfully updated.`);
      fetchData();
    } catch (err) {
      showStatus('error', `Failed to toggle status: ${err.message}`);
    }
  };

  // Manage timing settings (Super Admin Only)
  const handleConfigUpdate = async (e) => {
    e.preventDefault();
    if (!isSuperAdminUser) return;

    setConfigLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    
    const formData = new FormData();
    formData.append('lat', configForm.lat);
    formData.append('lng', configForm.lng);
    formData.append('radius_meters', configForm.radius_meters);
    formData.append('start_time', configForm.start_time);
    formData.append('end_time', configForm.end_time);
    formData.append('grace_period_minutes', configForm.grace_period_minutes);

    try {
      const response = await fetch(`${import.meta.env.VITE_BIOMETRIC_API_URL}/api/office-config`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });

      const result = await response.json();
      if (response.ok && result.success) {
        showStatus('success', 'Office settings successfully updated.');
        setOfficeConfig(result.config);
        fetchData();
      } else {
        throw new Error(result.detail || 'Configuration update failed.');
      }
    } catch (err) {
      showStatus('error', err.message || 'Error updating configuration.');
    } finally {
      setConfigLoading(false);
    }
  };

  // Manage Holidays creation (Super Admin Only)
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!isSuperAdminUser) return;

    setHolidayLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append('name', holidayForm.name);
    formData.append('holiday_date', holidayForm.date);

    try {
      const response = await fetch(`${import.meta.env.VITE_BIOMETRIC_API_URL}/api/holidays`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });

      const result = await response.json();
      if (response.ok && result.success) {
        showStatus('success', `Holiday '${holidayForm.name}' successfully added.`);
        setHolidayForm({ name: '', date: '' });
        fetchData();
      } else {
        throw new Error(result.detail || 'Holiday registration failed.');
      }
    } catch (err) {
      showStatus('error', err.message || 'Error registering holiday.');
    } finally {
      setHolidayLoading(false);
    }
  };

  // Manage Holidays deletion (Super Admin Only)
  const handleDeleteHoliday = async (holidayId) => {
    if (!isSuperAdminUser) return;
    if (!confirm('Are you sure you want to delete this holiday?')) return;

    const { data: { session } } = await supabase.auth.getSession();
    try {
      const response = await fetch(`${import.meta.env.VITE_BIOMETRIC_API_URL}/api/holidays/${holidayId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const result = await response.json();
      if (response.ok && result.success) {
        showStatus('success', 'Holiday deleted successfully.');
        fetchData();
      } else {
        throw new Error(result.detail || 'Failed to delete holiday.');
      }
    } catch (err) {
      showStatus('error', err.message || 'Error deleting holiday.');
    }
  };

  // Trigger Manual Present Override dialog
  const triggerOverride = (emp) => {
    setSelectedOverrideEmp(emp);
    setOverrideReason('');
    setShowOverrideModal(true);
  };

  // Write manual logs override to database
  const handleManualOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      alert('Please provide an override reason.');
      return;
    }

    setOverrideLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const overrideData = {
        employee_id: selectedOverrideEmp.id,
        name: selectedOverrideEmp.name,
        role: selectedOverrideEmp.role,
        face_matched: false,
        direction_used: 'ADMIN_OVERRIDE',
        status: 'Excused',
        override_reason: overrideReason.trim(),
        marked_at: new Date().toISOString(),
        date: todayStr
      };

      const { error } = await supabase
        .from('attendance')
        .insert(overrideData);

      if (error) throw error;

      showStatus('success', `Marked ${selectedOverrideEmp.name} as Present (Excused).`);
      setShowOverrideModal(false);
      setSelectedOverrideEmp(null);
      setOverrideReason('');
      fetchData();
    } catch (err) {
      showStatus('error', `Override failed: ${err.message}`);
    } finally {
      setOverrideLoading(false);
    }
  };

  // CSV Report Exporter
  const handleExportCSV = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', csvDateRange.startDate)
        .lte('date', csvDateRange.endDate)
        .order('marked_at', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) {
        alert('No attendance entries found for the selected date range.');
        return;
      }

      // Construct CSV content
      const headers = ['ID', 'Date', 'Time', 'Employee Name', 'Role', 'Status', 'Geofenced', 'Distance (m)', 'Liveness Challenged', 'Verification Mode', 'Override Reason'];
      const csvRows = [headers.join(',')];

      data.forEach((row) => {
        const time = new Date(row.marked_at).toLocaleTimeString();
        const distance = row.distance_m ? row.distance_m.toFixed(1) : 'N/A';
        const geofenced = row.role === 'office' ? (row.inside_geofence ? 'YES' : 'NO') : 'Bypassed';
        const method = row.direction_used === 'ADMIN_OVERRIDE' ? 'Manual Override' : 'Face Biometrics';
        
        const line = [
          row.id,
          row.date,
          time,
          `"${row.name}"`,
          row.role.toUpperCase(),
          row.status,
          geofenced,
          distance,
          row.direction_used,
          method,
          `"${row.override_reason || ''}"`
        ];
        csvRows.push(line.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Attendance_Report_${csvDateRange.startDate}_to_${csvDateRange.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // Helper status logs toaster
  const showStatus = (type, text) => {
    if (!type) {
      setStatusMessage(null);
      return;
    }
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // UI calculations
  const totalEmployeesCount = employees.filter(e => e.is_active).length;
  const presentCount = attendance.length;
  const lateCount = attendance.filter((a) => a.status === 'Late').length;
  const excusedCount = attendance.filter((a) => a.status === 'Excused').length;
  const absentCount = totalEmployeesCount - presentCount;

  // Filter main lists based on Search Query
  const filteredEmployeesList = employees.filter((emp) => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    emp.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAttendanceStatusBadge = (empId, role) => {
    const record = attendance.find((a) => a.employee_id === empId);
    
    // Check if today is registered as a holiday
    const todayStr = new Date().toISOString().split('T')[0];
    const isHoliday = holidays.some((h) => h.holiday_date === todayStr);

    if (record) {
      if (record.status === 'Late') {
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Late ({new Date(record.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>;
      }
      if (record.status === 'Excused') {
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Excused ({record.override_reason})</span>;
      }
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Present ({new Date(record.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>;
    }

    if (isHoliday) {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Holiday</span>;
    }

    return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Absent</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Validating security credentials...</p>
      </div>
    );
  }

  // --- ACCESS DENIED UI ---
  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-rose-950/20 rounded-full blur-[120px]" />
        <div className="rounded-3xl border border-rose-950/40 bg-slate-900/30 p-8 max-w-md text-center backdrop-blur-xl z-10 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          </div>
          <h2 className="text-2xl font-black mb-2">Access Denied</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Your email is not authorized to access this administration panel. Please log in with a whitelisted Admin email address.
          </p>
          <button
            onClick={onBack}
            className="w-full py-3 bg-slate-800 hover:bg-slate-750 font-bold rounded-xl border border-slate-700 transition"
          >
            Back to Application
          </button>
        </div>
      </div>
    );
  }

  const currentAbsentEmp = absentEmployees[currentAbsentIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col relative overflow-x-hidden">
      {/* Background glowing decorations */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-900/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-emerald-950/10 rounded-full blur-[140px] pointer-events-none" />

      {/* HEADER NAVBAR */}
      <header className="border-b border-slate-900 bg-slate-900/30 backdrop-blur-xl sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Smart Attendance Console</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              {isSuperAdminUser ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Super Admin Mode
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-indigo-400" /> Regular Admin Mode
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/stats')}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 transition duration-300 flex items-center gap-2"
          >
            <BarChart2 className="w-4 h-4" /> Analytics
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 transition duration-300"
          >
            Leave Admin
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        
        {/* STATS COUNT OVERVIEW */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-4 backdrop-blur-md">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Active</span>
            <div className="text-2xl font-black mt-1 flex items-baseline gap-1 text-white">
              {totalEmployeesCount} <span className="text-xs text-slate-500 font-medium">staff</span>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-950/20 bg-emerald-500/5 p-4 backdrop-blur-md">
            <span className="text-emerald-500/70 text-xs font-semibold uppercase tracking-wider">Today Present</span>
            <div className="text-2xl font-black mt-1 flex items-baseline gap-1 text-emerald-400">
              {presentCount - lateCount - excusedCount} <span className="text-xs text-emerald-500/60 font-medium">on time</span>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-950/20 bg-amber-500/5 p-4 backdrop-blur-md">
            <span className="text-amber-500/70 text-xs font-semibold uppercase tracking-wider">Today Late</span>
            <div className="text-2xl font-black mt-1 flex items-baseline gap-1 text-amber-400">
              {lateCount} <span className="text-xs text-amber-500/60 font-medium">delayed</span>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-950/20 bg-indigo-500/5 p-4 backdrop-blur-md">
            <span className="text-indigo-500/70 text-xs font-semibold uppercase tracking-wider">Today Excused</span>
            <div className="text-2xl font-black mt-1 flex items-baseline gap-1 text-indigo-400">
              {excusedCount} <span className="text-xs text-indigo-500/60 font-medium">overrides</span>
            </div>
          </div>
          <div className="rounded-2xl border border-rose-950/20 bg-rose-500/5 p-4 backdrop-blur-md col-span-2 md:col-span-1">
            <span className="text-rose-500/70 text-xs font-semibold uppercase tracking-wider">Today Absent</span>
            <div className="text-2xl font-black mt-1 flex items-baseline gap-1 text-rose-400">
              {absentCount} <span className="text-xs text-rose-500/60 font-medium">missing</span>
            </div>
          </div>
        </div>

        {/* STATUS BAR MESSAGE */}
        {statusMessage && (
          <div className={`rounded-xl p-4 border flex items-center gap-3 animate-fade-in ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-medium">{statusMessage.text}</span>
          </div>
        )}

        {/* TABS CONTROLLER */}
        <div className="flex border-b border-slate-900 gap-1 overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'attendance' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" /> Live Tracking
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'employees' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Employee Directory & Enrollment
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'config' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" /> Geofencing & Timings
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'holidays' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" /> Holiday Settings
          </button>
        </div>

        {/* --- TAB CONTENT 1: LIVE ATTENDANCE TRACKING --- */}
        {activeTab === 'attendance' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Grid listings */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              
              {/* Toolbar controls */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search checked-in or absent employee..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-900 bg-slate-900/40 text-sm focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Main Attendance List Card */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/20 overflow-hidden backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 bg-slate-900/30 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                        <th className="p-4">Name</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Today Status</th>
                        <th className="p-4">Geofence Distance</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 text-sm">
                      {filteredEmployeesList.map((emp) => {
                        const record = attendance.find((a) => a.employee_id === emp.id);
                        return (
                          <tr key={emp.id} className="hover:bg-slate-900/10 transition">
                            <td className="p-4 font-bold text-slate-200">
                              {emp.name}
                              <div className="text-xs text-slate-500 font-medium">{emp.email}</div>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                emp.role === 'office' 
                                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' 
                                  : 'bg-teal-500/10 text-teal-400 border border-teal-500/15'
                              }`}>
                                {emp.role}
                              </span>
                            </td>
                            <td className="p-4">
                              {getAttendanceStatusBadge(emp.id, emp.role)}
                            </td>
                            <td className="p-4 text-slate-400 font-mono text-xs">
                              {record?.role === 'office' 
                                ? (record.distance_m ? `${record.distance_m.toFixed(1)}m` : 'Error')
                                : 'Bypassed (Field)'}
                            </td>
                            <td className="p-4 text-right">
                              {!record && emp.is_active && (
                                <button
                                  onClick={() => triggerOverride(emp)}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 transition duration-300"
                                >
                                  Manual Present
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredEmployeesList.length === 0 && (
                        <tr>
                          <td colSpan="5" className="p-8 text-center text-slate-500 font-medium">
                            No employees match your search query.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* CSV Exporter Column */}
            <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md h-fit flex flex-col gap-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-900">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-slate-200">Export Reports</h3>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Download verified attendance logs formatted for spreadsheet analysis. Select dates below to download standard CSV files.
              </p>
              
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={csvDateRange.startDate}
                    onChange={(e) => setCsvDateRange({ ...csvDateRange, startDate: e.target.value })}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={csvDateRange.endDate}
                    onChange={(e) => setCsvDateRange({ ...csvDateRange, endDate: e.target.value })}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>

                <button
                  onClick={handleExportCSV}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 font-bold transition duration-300 flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20"
                >
                  <Download className="w-4 h-4" /> Download Report (CSV)
                </button>
              </div>
            </div>

          </div>
        )}

        {/* --- TAB CONTENT 2: DIRECTORY & ENROLLMENT PANEL --- */}
        {activeTab === 'employees' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Enrollment wizard */}
            <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md h-fit">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-900 mb-5">
                <Plus className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-slate-200">Register Employee</h3>
              </div>

              <form onSubmit={handleEnrollEmployee} className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={enrollForm.name}
                    onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })}
                    placeholder="Enter full name"
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Corporate Email</label>
                  <input
                    type="email"
                    required
                    value={enrollForm.email}
                    onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })}
                    placeholder="name@company.com"
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Workplace Role</label>
                  <select
                    value={enrollForm.role}
                    onChange={(e) => setEnrollForm({ ...enrollForm, role: e.target.value })}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  >
                    <option value="office">Office Staff (Requires Geofencing GPS)</option>
                    <option value="field">Field Staff (GPS Bypassed)</option>
                  </select>
                </div>

                {/* Face photos selection box */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Biometric Enroll Photos (3-5 required)</label>
                  <div className="border border-dashed border-slate-800 bg-slate-900/10 rounded-xl p-4 flex flex-col items-center justify-center text-center relative hover:bg-slate-900/20 transition cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      required
                      onChange={handlePhotoUpload}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-slate-500 mb-2" />
                    <span className="text-xs font-semibold text-slate-300">Click to upload photos</span>
                    <span className="text-[10px] text-slate-500 mt-1">Accepts jpg, jpeg, png files</span>
                  </div>
                  
                  {enrollPhotos.length > 0 && (
                    <div className="mt-3 flex items-center justify-between text-xs font-medium text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">
                      <span>Selected {enrollPhotos.length} face photographs</span>
                      <button 
                        type="button" 
                        onClick={() => setEnrollPhotos([])}
                        className="text-slate-400 hover:text-white"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {/* Enroll Progress Bar */}
                {enrollProgress > 0 && (
                  <div className="w-full mt-2">
                    <div className="flex justify-between text-[10px] font-semibold text-indigo-400 mb-1">
                      <span>Processing biometric patterns...</span>
                      <span>{enrollProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-850">
                      <div 
                        className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${enrollProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={enrollLoading}
                  className="w-full mt-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/20"
                >
                  {enrollLoading ? 'Registering face encodings...' : 'Enroll Employee'}
                </button>
              </form>
            </div>

            {/* List panel */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md h-fit flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-900">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-slate-200">Registered Employees</h3>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-900 bg-slate-900/30">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-4">Employee</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Registered Face</th>
                      <th className="p-4 text-right">Status Toggle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-sm">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-900/10 transition">
                        <td className="p-4 font-bold text-slate-200">{emp.name}</td>
                        <td className="p-4 text-slate-400 font-mono text-xs">{emp.email}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                            emp.role === 'office' 
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' 
                              : 'bg-teal-500/10 text-teal-400 border border-teal-500/15'
                          }`}>
                            {emp.role}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-semibold text-slate-400">
                          {emp.face_encoding ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Enrolled
                            </span>
                          ) : (
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> Missing Encoding
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => toggleEmployeeStatus(emp.id, emp.is_active)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition duration-300 ${
                              emp.is_active 
                                ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/15' 
                                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/15'
                            }`}
                          >
                            {emp.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {employees.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-500 font-medium">
                          No employees enrolled in the database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* --- TAB CONTENT 3: TIMINGS & GEOFENCING CONFIG --- */}
        {activeTab === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* TIMINGS SETTINGS Form */}
            <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md h-fit">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-900 mb-5">
                <Clock className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-slate-200">Shift Parameters</h3>
              </div>

              {!isSuperAdminUser ? (
                <div className="rounded-xl bg-slate-900/60 p-4 border border-slate-850 flex flex-col items-center text-center">
                  <Shield className="w-6 h-6 text-slate-500 mb-2" />
                  <span className="text-xs font-bold text-slate-300">Super Admin Override Only</span>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    TIMINGS and GEOFENCES are restricted configurations. Only Vikas, Sushil, and Kushagra are authorized to edit parameters.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleConfigUpdate} className="flex flex-col gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Shift Start Time</label>
                    <input
                      type="text"
                      required
                      placeholder="09:00:00"
                      value={configForm.start_time}
                      onChange={(e) => setConfigForm({ ...configForm, start_time: e.target.value })}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Grace Period (Minutes)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={configForm.grace_period_minutes}
                      onChange={(e) => setConfigForm({ ...configForm, grace_period_minutes: parseInt(e.target.value) })}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Shift Closing Time</label>
                    <input
                      type="text"
                      required
                      placeholder="18:00:00"
                      value={configForm.end_time}
                      onChange={(e) => setConfigForm({ ...configForm, end_time: e.target.value })}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500 text-white"
                    />
                  </div>

                  <div className="border-t border-slate-900 pt-4 flex flex-col gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Office Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={configForm.lat}
                        onChange={(e) => setConfigForm({ ...configForm, lat: parseFloat(e.target.value) })}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Office Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={configForm.lng}
                        onChange={(e) => setConfigForm({ ...configForm, lng: parseFloat(e.target.value) })}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Geofence Radius (Meters)</label>
                      <input
                        type="number"
                        required
                        value={configForm.radius_meters}
                        onChange={(e) => setConfigForm({ ...configForm, radius_meters: parseInt(e.target.value) })}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={configLoading}
                    className="w-full mt-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/20"
                  >
                    {configLoading ? 'Saving Timings...' : 'Save Office Timings'}
                  </button>
                </form>
              )}
            </div>

            {/* Google Maps view */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md h-fit flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-900">
                <MapPin className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-slate-200">Office Geofencing Coordinate Map</h3>
              </div>
              
              {/* Premium Google Maps Iframe center visualizer */}
              <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden border border-slate-900 bg-slate-950">
                <iframe
                  title="Office GPS Geofence Area"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight="0"
                  marginWidth="0"
                  src={`https://maps.google.com/maps?q=${officeConfig.lat},${officeConfig.lng}&t=&z=17&ie=UTF8&iwloc=B&output=embed`}
                  className="filter invert grayscale contrast-125 opacity-70"
                />
                
                {/* Visual Glassmorphic coordinates box */}
                <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md border border-slate-800 p-4 rounded-xl text-xs font-medium max-w-sm">
                  <h4 className="font-black text-slate-200 flex items-center gap-1.5 mb-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400" /> Geofence Configuration Locked
                  </h4>
                  <div className="font-mono text-slate-400 flex flex-col gap-1">
                    <span>Coordinates: {officeConfig.lat.toFixed(6)}, {officeConfig.lng.toFixed(6)}</span>
                    <span>Active perimeter radius: {officeConfig.radius_meters} meters</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* --- TAB CONTENT 4: HOLIDAYS REGISTER --- */}
        {activeTab === 'holidays' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Holiday Adder Form */}
            <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md h-fit">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-900 mb-5">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-slate-200">Add Holiday</h3>
              </div>

              {!isSuperAdminUser ? (
                <div className="rounded-xl bg-slate-900/60 p-4 border border-slate-850 flex flex-col items-center text-center">
                  <Shield className="w-6 h-6 text-slate-500 mb-2" />
                  <span className="text-xs font-bold text-slate-300">Super Admin Override Only</span>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Only Super Admins can add or delete whitelisted holidays dates.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleAddHoliday} className="flex flex-col gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Holiday Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Independence Day"
                      value={holidayForm.name}
                      onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Holiday Date</label>
                    <input
                      type="date"
                      required
                      value={holidayForm.date}
                      onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={holidayLoading}
                    className="w-full mt-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/20"
                  >
                    {holidayLoading ? 'Registering Date...' : 'Add Holiday Date'}
                  </button>
                </form>
              )}
            </div>

            {/* Whitelisted holidays listings */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-md h-fit flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-900">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-slate-200">Registered Corporate Holidays</h3>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-900 bg-slate-900/30">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-4">Holiday Name</th>
                      <th className="p-4">Date</th>
                      {isSuperAdminUser && <th className="p-4 text-right">Delete Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-sm">
                    {holidays.map((hol) => (
                      <tr key={hol.id} className="hover:bg-slate-900/10 transition">
                        <td className="p-4 font-bold text-slate-200">{hol.name}</td>
                        <td className="p-4 text-slate-400 font-mono text-xs">
                          {new Date(hol.holiday_date).toLocaleDateString([], {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}
                        </td>
                        {isSuperAdminUser && (
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteHoliday(hol.id)}
                              className="text-rose-500 hover:text-rose-400 p-2 rounded-xl hover:bg-rose-500/10 transition duration-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {holidays.length === 0 && (
                      <tr>
                        <td colSpan={isSuperAdminUser ? 3 : 2} className="p-8 text-center text-slate-500 font-medium">
                          No company holidays registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* --- OVERLAY POPUP: COUNTDOWN CYCLING ABSENTEE ALERTS (BOTTOM-RIGHT) --- */}
      {absentEmployees.length > 0 && currentAbsentEmp && !showOverrideModal && (
        <div className="fixed bottom-6 right-6 w-96 rounded-2xl border border-rose-900/40 bg-slate-900/80 backdrop-blur-xl p-5 shadow-2xl z-40 animate-slide-up flex flex-col gap-4 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Absent Employee Alert</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {currentAbsentIndex + 1} of {absentEmployees.length} missing
            </span>
          </div>

          <div>
            <h4 className="text-base font-black text-slate-200">{currentAbsentEmp.name}</h4>
            <p className="text-xs text-slate-400 mt-0.5">{currentAbsentEmp.email}</p>
            <span className={`inline-block mt-2 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
              currentAbsentEmp.role === 'office' 
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' 
                : 'bg-teal-500/10 text-teal-400 border border-teal-500/15'
            }`}>
              {currentAbsentEmp.role}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => triggerOverride(currentAbsentEmp)}
              className="flex-1 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 transition duration-300"
            >
              Manual Present Override
            </button>
          </div>

          {/* Animated 5-second countdown bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950 overflow-hidden rounded-b-2xl">
            <div 
              className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-r-full"
              style={{ width: `${popupProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* --- FLOATING OVERLAY: MANUAL OVERRIDE MODAL DIALOG --- */}
      {showOverrideModal && selectedOverrideEmp && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-2xl animate-scale-in text-white relative">
            <button 
              onClick={() => setShowOverrideModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-2">Manual Attendance Override</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              You are manually marking <strong className="text-white">{selectedOverrideEmp.name}</strong> (Role: {selectedOverrideEmp.role.toUpperCase()}) as Present today. A valid excuse reason is mandatory for audit records.
            </p>

            <form onSubmit={handleManualOverrideSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Override Reason / Excuse Notes</label>
                <textarea
                  required
                  rows="3"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Doctor's Appointment, Official Client Visit, Working from Home"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
                />
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-750 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideLoading}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 transition shadow-lg shadow-indigo-950/20"
                >
                  {overrideLoading ? 'Submitting Override...' : 'Confirm Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
