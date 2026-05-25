import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './AdminDashboard.css';
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
      const userEmail = session?.user?.email?.trim()?.toLowerCase();

      if (!userEmail) {
        setIsAdminUser(false);
        setLoading(false);
        return;
      }

      // Bypass for known admin emails
      if (userEmail === 'kushagratiwari252@gmail.com' || userEmail === 'kushagratiwari7261@gmail.com') {
        setIsAdminUser(true);
        setIsSuperAdminUser(true);
        setAdminProfile({
          id: 'admin-bypass',
          email: userEmail,
          is_super_admin: true,
          created_at: new Date().toISOString()
        });
        setLoading(false);
        return;
      }

      // Fetch from admins table
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('email', userEmail)
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
    
    // Face photos are now optional, but if provided, should be 1-5
    if (enrollPhotos.length > 5) {
      showStatus('error', 'Maximum 5 face photographs allowed.');
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
        return <span className="admin-status-badge late">Late ({new Date(record.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>;
      }
      if (record.status === 'Excused') {
        return <span className="admin-status-badge excused">Excused ({record.override_reason})</span>;
      }
      return <span className="admin-status-badge present">Present ({new Date(record.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>;
    }

    if (isHoliday) {
      return <span className="admin-status-badge holiday">Holiday</span>;
    }

    return <span className="admin-status-badge absent">Absent</span>;
  };

  if (loading) {
    return (
      <div className="admin-loading-screen">
        <div className="admin-spinner" />
        <p className="admin-loading-text">Validating security credentials...</p>
      </div>
    );
  }

  // --- ACCESS DENIED UI ---
  if (!isAdminUser) {
    return (
      <div className="admin-access-denied">
        <div className="admin-glow-red" />
        <div className="admin-modal-card">
          <div className="admin-icon-circle">
            <AlertTriangle  />
          </div>
          <h2 className="admin-title-lg">Access Denied</h2>
          <p className="admin-text-muted">
            Your email is not authorized to access this administration panel. Please log in with a whitelisted Admin email address.
          </p>
          <button
            onClick={onBack}
            className="admin-btn-secondary"
          >
            Back to Application
          </button>
        </div>
      </div>
    );
  }

  const currentAbsentEmp = absentEmployees[currentAbsentIndex];

  return (
    <div className="admin-dashboard-container">
      {/* Background glowing decorations */}
      <div className="admin-glow-indigo" />
      <div className="admin-glow-emerald" />

      {/* HEADER NAVBAR */}
      <header className="admin-header">
        <div className="admin-header-left">
          <div className="admin-header-icon">
            <Shield  />
          </div>
          <div>
            <h1 className="admin-header-title">Smart Attendance Console</h1>
            <p className="admin-header-subtitle">
              {isSuperAdminUser ? (
                <>
                  <ShieldCheck  /> Super Admin Mode
                </>
              ) : (
                <>
                  <Shield  /> Regular Admin Mode
                </>
              )}
            </p>
          </div>
        </div>

        <div className="admin-header-left">
          <button
            onClick={() => navigate('/admin/stats')}
            className="admin-btn-outline"
          >
            <BarChart2  /> Analytics
          </button>
          <button
            onClick={onBack}
            className="admin-btn-ghost"
          >
            Leave Admin
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="admin-main">
        
        {/* STATS COUNT OVERVIEW */}
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <span className="admin-stat-label">Total Active</span>
            <div className="admin-stat-value">
              {totalEmployeesCount} <span className="admin-stat-unit">staff</span>
            </div>
          </div>
          <div className="admin-stat-card present">
            <span className="admin-stat-label">Today Present</span>
            <div className="admin-stat-value">
              {presentCount - lateCount - excusedCount} <span className="admin-stat-unit">on time</span>
            </div>
          </div>
          <div className="admin-stat-card late">
            <span className="admin-stat-label">Today Late</span>
            <div className="admin-stat-value">
              {lateCount} <span className="admin-stat-unit">delayed</span>
            </div>
          </div>
          <div className="admin-stat-card excused">
            <span className="admin-stat-label">Today Excused</span>
            <div className="admin-stat-value">
              {excusedCount} <span className="admin-stat-unit">overrides</span>
            </div>
          </div>
          <div className="admin-stat-card absent">
            <span className="admin-stat-label">Today Absent</span>
            <div className="admin-stat-value">
              {absentCount} <span className="admin-stat-unit">missing</span>
            </div>
          </div>
        </div>

        {/* STATUS BAR MESSAGE */}
        {statusMessage && (
          <div className={`admin-status-toast ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle  /> : <AlertCircle  />}
            <span >{statusMessage.text}</span>
          </div>
        )}

        {/* TABS CONTROLLER */}
        <div className="admin-tabs-list">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'attendance' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Clock  /> Live Tracking
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'employees' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users  /> Employee Directory & Enrollment
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'config' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Settings  /> Geofencing & Timings
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition duration-300 whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'holidays' 
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Calendar  /> Holiday Settings
          </button>
        </div>

        {/* --- TAB CONTENT 1: LIVE ATTENDANCE TRACKING --- */}
        {activeTab === 'attendance' && (
          <div className="admin-tab-content-grid">
            
            {/* Grid listings */}
            <div className="admin-col-span-2">
              
              {/* Toolbar controls */}
              <div className="admin-toolbar">
                <div className="admin-search-wrapper">
                  <Search className="admin-search-icon" />
                  <input
                    type="text"
                    placeholder="Search checked-in or absent employee..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="admin-search-input"
                  />
                </div>
              </div>

              {/* Main Attendance List Card */}
              <div className="admin-panel">
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr >
                        <th >Name</th>
                        <th >Role</th>
                        <th >Today Status</th>
                        <th >Geofence Distance</th>
                        <th style={{textAlign: "right"}}>Action</th>
                      </tr>
                    </thead>
                    <tbody >
                      {filteredEmployeesList.map((emp) => {
                        const record = attendance.find((a) => a.employee_id === emp.id);
                        return (
                          <tr key={emp.id} >
                            <td className="admin-emp-name">
                              {emp.name}
                              <div className="admin-stat-unit">{emp.email}</div>
                            </td>
                            <td >
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                emp.role === 'office' 
                                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' 
                                  : 'bg-teal-500/10 text-teal-400 border border-teal-500/15'
                              }`}>
                                {emp.role}
                              </span>
                            </td>
                            <td >
                              {getAttendanceStatusBadge(emp.id, emp.role)}
                            </td>
                            <td className="admin-font-mono">
                              {!record ? '-' : (record.role === 'office' 
                                ? (record.distance_m ? `${record.distance_m.toFixed(1)}m` : 'Error')
                                : 'Bypassed (Field)')}
                            </td>
                            <td style={{textAlign: "right"}}>
                              {!record && emp.is_active && (
                                <button
                                  onClick={() => triggerOverride(emp)}
                                  className="admin-btn-action"
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
                          <td colSpan="5" className="admin-text-center-muted">
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
            <div className="admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <FileSpreadsheet className="emerald" />
                <h3 className="admin-panel-title">Export Reports</h3>
              </div>
              <p className="admin-panel-desc">
                Download verified attendance logs formatted for spreadsheet analysis. Select dates below to download standard CSV files.
              </p>
              
              <div className="admin-form-group">
                <div>
                  <label className="admin-label">Start Date</label>
                  <input
                    type="date"
                    value={csvDateRange.startDate}
                    onChange={(e) => setCsvDateRange({ ...csvDateRange, startDate: e.target.value })}
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label">End Date</label>
                  <input
                    type="date"
                    value={csvDateRange.endDate}
                    onChange={(e) => setCsvDateRange({ ...csvDateRange, endDate: e.target.value })}
                    className="admin-input"
                  />
                </div>

                <button
                  onClick={handleExportCSV}
                  className="admin-btn-primary emerald"
                >
                  <Download  /> Download Report (CSV)
                </button>
              </div>
            </div>

          </div>
        )}

        {/* --- TAB CONTENT 2: DIRECTORY & ENROLLMENT PANEL --- */}
        {activeTab === 'employees' && (
          <div className="admin-tab-content-grid">
            
            {/* Enrollment wizard */}
            <div className="admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <Plus  />
                <h3 className="admin-panel-title">Register Employee</h3>
              </div>

              <form onSubmit={handleEnrollEmployee} className="admin-form-group">
                <div>
                  <label className="admin-label">Full Name</label>
                  <input
                    type="text"
                    required
                    value={enrollForm.name}
                    onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })}
                    placeholder="Enter full name"
                    className="admin-input"
                  />
                </div>
                
                <div>
                  <label className="admin-label">Corporate Email</label>
                  <input
                    type="email"
                    required
                    value={enrollForm.email}
                    onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })}
                    placeholder="name@company.com"
                    className="admin-input"
                  />
                </div>

                <div>
                  <label className="admin-label">Workplace Role</label>
                  <select
                    value={enrollForm.role}
                    onChange={(e) => setEnrollForm({ ...enrollForm, role: e.target.value })}
                    className="admin-input"
                  >
                    <option value="office">Office Staff (Requires Geofencing GPS)</option>
                    <option value="field">Field Staff (GPS Bypassed)</option>
                  </select>
                </div>

                {/* Face photos selection box */}
                <div>
                  <label className="admin-label">Biometric Enroll Photos (Optional, 1-5 photos)</label>
                  <div className="admin-file-drop">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="admin-file-input"
                    />
                    <Upload className="admin-file-icon" />
                    <span className="admin-file-text">Click to upload photos</span>
                    <span className="admin-file-hint">Accepts jpg, jpeg, png files</span>
                  </div>
                  
                  {enrollPhotos.length > 0 && (
                    <div className="admin-photo-count">
                      <span>Selected {enrollPhotos.length} face photographs</span>
                      <button 
                        type="button" 
                        onClick={() => setEnrollPhotos([])}
                        className="admin-clear-btn"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {/* Enroll Progress Bar */}
                {enrollProgress > 0 && (
                  <div className="admin-progress-container">
                    <div className="admin-progress-header">
                      <span>Processing biometric patterns...</span>
                      <span>{enrollProgress}%</span>
                    </div>
                    <div className="admin-progress-track">
                      <div 
                        className="admin-progress-bar"
                        style={{ width: `${enrollProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={enrollLoading}
                  className="admin-btn-primary"
                >
                  {enrollLoading ? 'Registering face encodings...' : 'Enroll Employee'}
                </button>
              </form>
            </div>

            {/* List panel */}
            <div className="admin-col-span-2 admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <Users  />
                <h3 className="admin-panel-title">Registered Employees</h3>
              </div>

              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th >Employee</th>
                      <th >Email</th>
                      <th >Role</th>
                      <th >Registered Face</th>
                      <th style={{textAlign: "right"}}>Status Toggle</th>
                    </tr>
                  </thead>
                  <tbody >
                    {employees.map((emp) => (
                      <tr key={emp.id} >
                        <td className="admin-emp-name">{emp.name}</td>
                        <td className="admin-font-mono">{emp.email}</td>
                        <td >
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
                            <span className="admin-face-enrolled">
                              <CheckCircle  /> Enrolled
                            </span>
                          ) : (
                            <span className="admin-face-missing">
                              <AlertCircle  /> Missing Encoding
                            </span>
                          )}
                        </td>
                        <td style={{textAlign: "right"}}>
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
                        <td colSpan="5" className="admin-text-center-muted">
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
          <div className="admin-tab-content-grid">
            
            {/* TIMINGS SETTINGS Form */}
            <div className="admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <Clock  />
                <h3 className="admin-panel-title">Shift Parameters</h3>
              </div>

              {!isSuperAdminUser ? (
                <div className="admin-restricted-box">
                  <Shield className="admin-restricted-icon" />
                  <span className="admin-restricted-title">Super Admin Override Only</span>
                  <p className="admin-restricted-desc">
                    TIMINGS and GEOFENCES are restricted configurations. Only Vikas, Sushil, and Kushagra are authorized to edit parameters.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleConfigUpdate} className="admin-form-group">
                  <div>
                    <label className="admin-label">Shift Start Time</label>
                    <input
                      type="text"
                      required
                      placeholder="09:00:00"
                      value={configForm.start_time}
                      onChange={(e) => setConfigForm({ ...configForm, start_time: e.target.value })}
                      className="admin-input font-mono"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Grace Period (Minutes)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={configForm.grace_period_minutes}
                      onChange={(e) => setConfigForm({ ...configForm, grace_period_minutes: parseInt(e.target.value) })}
                      className="admin-input"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Shift Closing Time</label>
                    <input
                      type="text"
                      required
                      placeholder="18:00:00"
                      value={configForm.end_time}
                      onChange={(e) => setConfigForm({ ...configForm, end_time: e.target.value })}
                      className="admin-input font-mono"
                    />
                  </div>

                  <div className="admin-border-t">
                    <div>
                      <label className="admin-label">Office Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={configForm.lat}
                        onChange={(e) => setConfigForm({ ...configForm, lat: parseFloat(e.target.value) })}
                        className="admin-input font-mono"
                      />
                    </div>

                    <div>
                      <label className="admin-label">Office Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={configForm.lng}
                        onChange={(e) => setConfigForm({ ...configForm, lng: parseFloat(e.target.value) })}
                        className="admin-input font-mono"
                      />
                    </div>

                    <div>
                      <label className="admin-label">Geofence Radius (Meters)</label>
                      <input
                        type="number"
                        required
                        value={configForm.radius_meters}
                        onChange={(e) => setConfigForm({ ...configForm, radius_meters: parseInt(e.target.value) })}
                        className="admin-input"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={configLoading}
                    className="admin-btn-primary"
                  >
                    {configLoading ? 'Saving Timings...' : 'Save Office Timings'}
                  </button>
                </form>
              )}
            </div>

            {/* Google Maps view */}
            <div className="admin-col-span-2 admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <MapPin  />
                <h3 className="admin-panel-title">Office Geofencing Coordinate Map</h3>
              </div>
              
              {/* Premium Google Maps Iframe center visualizer */}
              <div className="admin-map-container">
                <iframe
                  title="Office GPS Geofence Area"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight="0"
                  marginWidth="0"
                  src={`https://maps.google.com/maps?q=${officeConfig.lat},${officeConfig.lng}&t=&z=17&ie=UTF8&iwloc=B&output=embed`}
                  className="admin-map-iframe"
                />
                
                {/* Visual Glassmorphic coordinates box */}
                <div className="admin-map-overlay">
                  <h4 className="admin-map-overlay-title">
                    <MapPin className="w-4 h-4 text-emerald-400" /> Geofence Configuration Locked
                  </h4>
                  <div className="admin-map-overlay-coords">
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
          <div className="admin-tab-content-grid">
            
            {/* Holiday Adder Form */}
            <div className="admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <Calendar  />
                <h3 className="admin-panel-title">Add Holiday</h3>
              </div>

              {!isSuperAdminUser ? (
                <div className="admin-restricted-box">
                  <Shield className="admin-restricted-icon" />
                  <span className="admin-restricted-title">Super Admin Override Only</span>
                  <p className="admin-restricted-desc">
                    Only Super Admins can add or delete whitelisted holidays dates.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleAddHoliday} className="admin-form-group">
                  <div>
                    <label className="admin-label">Holiday Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Independence Day"
                      value={holidayForm.name}
                      onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                      className="admin-input"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Holiday Date</label>
                    <input
                      type="date"
                      required
                      value={holidayForm.date}
                      onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                      className="admin-input"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={holidayLoading}
                    className="admin-btn-primary"
                  >
                    {holidayLoading ? 'Registering Date...' : 'Add Holiday Date'}
                  </button>
                </form>
              )}
            </div>

            {/* Whitelisted holidays listings */}
            <div className="admin-col-span-2 admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <Calendar  />
                <h3 className="admin-panel-title">Registered Corporate Holidays</h3>
              </div>

              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th >Holiday Name</th>
                      <th >Date</th>
                      {isSuperAdminUser && <th style={{textAlign: "right"}}>Delete Action</th>}
                    </tr>
                  </thead>
                  <tbody >
                    {holidays.map((hol) => (
                      <tr key={hol.id} >
                        <td className="admin-emp-name">{hol.name}</td>
                        <td className="admin-font-mono">
                          {new Date(hol.holiday_date).toLocaleDateString([], {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}
                        </td>
                        {isSuperAdminUser && (
                          <td style={{textAlign: "right"}}>
                            <button
                              onClick={() => handleDeleteHoliday(hol.id)}
                              className="admin-btn-delete"
                            >
                              <Trash2  />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {holidays.length === 0 && (
                      <tr>
                        <td colSpan={isSuperAdminUser ? 3 : 2} className="admin-text-center-muted">
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
        <div className="admin-popup-alert">
          <div className="admin-popup-header">
            <div className="admin-popup-header-left">
              <div className="admin-ping-dot" />
              <span className="admin-popup-title">Absent Employee Alert</span>
            </div>
            <span className="admin-popup-count">
              {currentAbsentIndex + 1} of {absentEmployees.length} missing
            </span>
          </div>

          <div>
            <h4 className="admin-popup-emp-name">{currentAbsentEmp.name}</h4>
            <p className="admin-popup-emp-email">{currentAbsentEmp.email}</p>
            <span className={`inline-block mt-2 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
              currentAbsentEmp.role === 'office' 
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15' 
                : 'bg-teal-500/10 text-teal-400 border border-teal-500/15'
            }`}>
              {currentAbsentEmp.role}
            </span>
          </div>

          <div className="admin-header-left">
            <button
              onClick={() => triggerOverride(currentAbsentEmp)}
              className="admin-btn-override"
            >
              Manual Present Override
            </button>
          </div>

          {/* Animated 5-second countdown bar */}
          <div className="admin-popup-progress-container">
            <div 
              className="admin-popup-progress-bar"
              style={{ width: `${popupProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* --- FLOATING OVERLAY: MANUAL OVERRIDE MODAL DIALOG --- */}
      {showOverrideModal && selectedOverrideEmp && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card">
            <button 
              onClick={() => setShowOverrideModal(false)}
              className="admin-modal-close"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="admin-modal-title">Manual Attendance Override</h3>
            <p className="admin-modal-desc">
              You are manually marking <strong >{selectedOverrideEmp.name}</strong> (Role: {selectedOverrideEmp.role.toUpperCase()}) as Present today. A valid excuse reason is mandatory for audit records.
            </p>

            <form onSubmit={handleManualOverrideSubmit} className="admin-form-group">
              <div>
                <label className="admin-label">Override Reason / Excuse Notes</label>
                <textarea
                  required
                  rows="3"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Doctor's Appointment, Official Client Visit, Working from Home"
                  className="admin-textarea"
                />
              </div>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="admin-btn-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideLoading}
                  className="admin-btn-confirm"
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
