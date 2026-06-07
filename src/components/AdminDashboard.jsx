import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './AdminDashboard.css';
import { 
  Users, MapPin, Calendar, Clock, Download, Plus, Shield, ShieldCheck, 
  Trash2, Upload, AlertCircle, CheckCircle, Search, Settings, 
  FileSpreadsheet, Edit3, X, Play, AlertTriangle, BarChart2
} from 'lucide-react';

const InteractiveMap = ({ lat, lng, onLocationChange }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);

  useEffect(() => {
    let timer = null;
    const initMap = () => {
      if (!window.maplibregl || !mapRef.current) {
        timer = setTimeout(initMap, 200);
        return;
      }
      if (mapInstance.current) return;

      const startLat = lat || 28.5355;
      const startLng = lng || 77.3910;

      const map = new window.maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [startLng, startLat],
        zoom: 17,
      });
      mapInstance.current = map;

      // Add draggable marker
      markerInstance.current = new window.maplibregl.Marker({
        draggable: true,
        color: "#10b981"
      })
        .setLngLat([startLng, startLat])
        .addTo(map);

      // Listen for marker drag
      markerInstance.current.on('dragend', () => {
        const lngLat = markerInstance.current.getLngLat();
        onLocationChange(lngLat.lat, lngLat.lng);
      });

      // Listen for map click
      map.on('click', (e) => {
        const lngLat = e.lngLat;
        markerInstance.current.setLngLat(lngLat);
        onLocationChange(lngLat.lat, lngLat.lng);
      });
    };
    initMap();

    return () => {
      if (timer) clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Update marker and center when lat/lng changes externally
  useEffect(() => {
    if (mapInstance.current && markerInstance.current && lat && lng) {
      markerInstance.current.setLngLat([lng, lat]);
      mapInstance.current.flyTo({ center: [lng, lat], zoom: 17, speed: 1.5 });
    }
  }, [lat, lng]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '10px' }} />;
};

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
  const [employeeConfigs, setEmployeeConfigs] = useState([]);
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
    startDate: new Date().toLocaleDateString('en-CA'),
    endDate: new Date().toLocaleDateString('en-CA')
  });

  // Employee Enrollment Form State
  const [enrollForm, setEnrollForm] = useState({
    name: '',
    email: '',
    role: 'office'
  });
  const [enrollLoading, setEnrollLoading] = useState(false);

  // Office Config Form State (Super Admin Only)
  const [configForm, setConfigForm] = useState({ 
    employee_id: 'global',
    address: '',
    lat: 28.5355, 
    lng: 77.391, 
    radius_meters: 100, 
    start_time: '09:00:00', 
    end_time: '18:00:00', 
    grace_period_minutes: 15 
  });
  const [configLoading, setConfigLoading] = useState(false);

  // Holidays Form State (Super Admin Only)
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '' });
  const [holidayLoading, setHolidayLoading] = useState(false);

  // Absent Cycling Popup Notification State
  const [absentEmployees, setAbsentEmployees] = useState([]);
  const [currentAbsentIndex, setCurrentAbsentIndex] = useState(0);
  const [popupProgress, setPopupProgress] = useState(100);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(true);
  const [selectedOverrideEmp, setSelectedOverrideEmp] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  
  // Suggestion State for Employees
  const [activeSuggestField, setActiveSuggestField] = useState(null); // 'name' | 'email' | null
  const [matchingEmployees, setMatchingEmployees] = useState([]);
  const [authProfiles, setAuthProfiles] = useState([]);

  // Suggestion State for OpenStreetMap Nominatim
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const searchTimeoutRef = useRef(null);

  const cyclingTimerRef = useRef(null);
  const progressTimerRef = useRef(null);

  // Smooth and Free autocomplete using Photon API (OpenStreetMap)
  const handleAddressSearch = (query) => {
    setConfigForm(prev => ({ ...prev, address: query }));
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`);
        const data = await res.json();
        
        const mapped = (data.features || []).map(f => {
          const props = f.properties;
          const displayDetails = [props.name, props.street, props.district, props.city, props.state, props.postcode, props.country].filter(Boolean);
          // deduplicate consecutive strings
          const uniqueDetails = displayDetails.filter((item, pos, arr) => pos === 0 || item !== arr[pos-1]);
          return {
            place_id: props.osm_id || Math.random(),
            display_name: uniqueDetails.join(', '),
            lat: parseFloat(f.geometry.coordinates[1]),
            lon: parseFloat(f.geometry.coordinates[0])
          };
        });
        
        setAddressSuggestions(mapped);
        setShowAddressSuggestions(true);
      } catch (err) {
        console.error("Photon search error:", err);
      }
    }, 400);
  };

  const selectAddress = (suggestion) => {
    setConfigForm(prev => ({
      ...prev,
      address: suggestion.display_name,
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon)
    }));
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  };

  const handleMapInteraction = async (lat, lng) => {
    setConfigForm(prev => ({ ...prev, lat, lng }));
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.display_name) {
        setConfigForm(prev => ({ ...prev, lat, lng, address: data.display_name }));
      }
    } catch(err) {
      console.error("Reverse geocode err", err);
    }
  };

  // Load MapLibre JS/CSS globally for the interactive map
  useEffect(() => {
    if (activeTab === 'config') {
      if (!document.getElementById('maplibre-css')) {
          const link = document.createElement('link');
          link.id = 'maplibre-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
          document.head.appendChild(link);
      }
      if (!window.maplibregl && !document.getElementById('maplibre-js')) {
          const script = document.createElement('script');
          script.id = 'maplibre-js';
          script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
          document.head.appendChild(script);
      }
    }
  }, [activeTab]);

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
      
      // Fetch Profiles (to see who has linked Auth)
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, email, full_name, updated_at');
      
      setAuthProfiles(profilesData || []);
      
      // Map profiles to employees by email
      const employeesWithProfile = (empData || []).map(emp => {
        const profile = (profilesData || []).find(p => p.email?.toLowerCase() === emp.email?.toLowerCase());
        return {
          ...emp,
          has_auth: !!profile,
          last_active: profile?.updated_at || null
        };
      });

      setEmployees(employeesWithProfile);

      // Fetch Today's Attendance logs
      const todayStr = new Date().toLocaleDateString('en-CA');
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
        setConfigForm(prev => ({ ...prev, ...configData, employee_id: 'global' }));
      }
      
      const { data: empConfData } = await supabase
        .from('employee_office_config')
        .select('*');
      setEmployeeConfigs(empConfData || []);

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
    if (absentEmployees.length === 0 || showOverrideModal || !showAlertModal) {
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
  }, [absentEmployees, showOverrideModal, showAlertModal]);

  // Handle Photo selection for Biometric Enrollment
  const handleNameChange = (e) => {
    const val = e.target.value;
    setEnrollForm({ ...enrollForm, name: val });
    
    if (val.trim()) {
      const matches = authProfiles.filter(emp => {
        const empName = emp.full_name || emp.name || '';
        if (!empName) return false;
        return empName.toLowerCase().includes(val.toLowerCase()) || 
               (emp.email && emp.email.toLowerCase().includes(val.toLowerCase()));
      }).slice(0, 5); // Show top 5 matches
      setMatchingEmployees(matches);
      setActiveSuggestField(matches.length > 0 ? 'name' : null);
    } else {
      setActiveSuggestField(null);
    }
  };

  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEnrollForm({ ...enrollForm, email: val });
    
    if (val.trim()) {
      const matches = authProfiles.filter(emp => {
        const empName = emp.full_name || emp.name || '';
        if (!emp.email) return false;
        return emp.email.toLowerCase().includes(val.toLowerCase()) ||
               (empName && empName.toLowerCase().includes(val.toLowerCase()));
      }).slice(0, 5);
      setMatchingEmployees(matches);
      setActiveSuggestField(matches.length > 0 ? 'email' : null);
    } else {
      setActiveSuggestField(null);
    }
  };

  const selectSuggestion = (emp) => {
    setEnrollForm({
      name: emp.full_name || emp.name || '',
      email: emp.email || '',
      role: 'office' // default to office
    });
    setActiveSuggestField(null);
  };

  // Register employee locally in DB - biometric face encoding will be automatically collected on first attendance scan
  const handleEnrollEmployee = async (e) => {
    e.preventDefault();
    setEnrollLoading(true);
    showStatus(null, '');

    try {
      // Check if email already exists
      const { data: existing } = await supabase
        .from('employees')
        .select('id')
        .eq('email', enrollForm.email.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        showStatus('error', 'An employee with this email is already registered.');
        return;
      }

      // Insert directly to Supabase
      const { data, error } = await supabase
        .from('employees')
        .insert([{
          name: enrollForm.name,
          email: enrollForm.email.trim().toLowerCase(),
          role: enrollForm.role,
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;

      showStatus('success', `Employee registered! Face signature will be auto-captured on first sign-in.`);
      setEnrollForm({ name: '', email: '', role: 'office' });
      fetchData();
    } catch (err) {
      showStatus('error', err.message || 'Error registering employee.');
    } finally {
      setEnrollLoading(false);
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

  const deleteEmployee = async (empId) => {
    if (!window.confirm('Are you sure you want to permanently delete this employee? This action cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', empId);
      if (error) throw error;
      showStatus('success', 'Employee deleted successfully.');
      fetchData();
    } catch (err) {
      showStatus('error', `Failed to delete employee: ${err.message}`);
    }
  };

  const removeFaceData = async (empId) => {
    if (!window.confirm('Are you sure you want to remove the face data for this employee? They will need to re-enroll on their next attendance.')) return;
    try {
      const { error } = await supabase
        .from('employees')
        .update({ face_encoding: null })
        .eq('id', empId);
      if (error) throw error;
      showStatus('success', 'Face data removed successfully.');
      fetchData();
    } catch (err) {
      showStatus('error', `Failed to remove face data: ${err.message}`);
    }
  };

  const handleEditCustomConfig = (conf) => {
    if (!isSuperAdminUser) return;
    setConfigForm({
      employee_id: conf.employee_id,
      address: conf.address || '',
      lat: conf.lat || 28.5355,
      lng: conf.lng || 77.391,
      radius_meters: conf.radius_meters || 100,
      start_time: conf.start_time || '09:00:00',
      end_time: conf.end_time || '18:00:00',
      grace_period_minutes: conf.grace_period_minutes || 15
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showStatus('success', 'Configuration loaded for editing.');
  };

  const handleDeleteCustomConfig = async (employee_id) => {
    if (!isSuperAdminUser) return;
    if (!window.confirm('Delete this custom configuration? The employee will revert to using the Global Office settings.')) return;
    try {
      const { error } = await supabase
        .from('employee_office_config')
        .delete()
        .eq('employee_id', employee_id);
      if (error) throw error;
      showStatus('success', 'Custom configuration deleted. Reverted to global.');
      fetchData();
    } catch (err) {
      showStatus('error', err.message || 'Delete failed.');
    }
  };

  // Manage office location settings (Super Admin Only) — saves directly via Supabase
  const handleConfigUpdate = async (e) => {
    e.preventDefault();
    if (!isSuperAdminUser) return;

    setConfigLoading(true);
    const adminIdentity = adminProfile?.name || adminProfile?.email || 'Admin';

    try {
      if (configForm.employee_id === 'global') {
        const payload = {
            id: 1,
            lat: parseFloat(configForm.lat),
            lng: parseFloat(configForm.lng),
            radius_meters: parseFloat(configForm.radius_meters),
            start_time: configForm.start_time || '09:00:00',
            end_time: configForm.end_time || '18:00:00',
            grace_period_minutes: parseInt(configForm.grace_period_minutes) || 15,
            updated_at: new Date().toISOString(),
            updated_by: adminIdentity
        };
        
        let { error } = await supabase.from('office_config').upsert(payload);
        
        if (error && error.code === 'PGRST204') {
            const fallback = { ...payload }; delete fallback.updated_by;
            let res = await supabase.from('office_config').upsert(fallback);
            error = res.error;
            if (!error) showStatus('success', 'Global config saved! (To show edits, add "updated_by" text column to office_config table in DB)');
        } else if (!error) {
            showStatus('success', 'Global office configuration saved successfully!');
        }
        if (error) throw error;
      } else {
        const payload = {
            employee_id: configForm.employee_id,
            lat: parseFloat(configForm.lat),
            lng: parseFloat(configForm.lng),
            radius_meters: parseFloat(configForm.radius_meters),
            start_time: configForm.start_time || '09:00:00',
            end_time: configForm.end_time || '18:00:00',
            grace_period_minutes: parseInt(configForm.grace_period_minutes) || 15,
            address: configForm.address || null,
            updated_at: new Date().toISOString(),
            updated_by: adminIdentity
        };

        let { error } = await supabase.from('employee_office_config').upsert(payload, { onConflict: 'employee_id' });
        
        if (error && error.code === 'PGRST204') {
            const fallback = { ...payload }; delete fallback.updated_by;
            let res = await supabase.from('employee_office_config').upsert(fallback, { onConflict: 'employee_id' });
            error = res.error;
            if (!error) showStatus('success', 'Custom config saved! (To show edits, add "updated_by" text column to employee_office_config table)');
        } else if (!error) {
            const empName = employees.find(emp => emp.id === configForm.employee_id)?.name || 'Employee';
            showStatus('success', `Custom configuration saved for ${empName}!`);
        }
        if (error) throw error;
      }
      fetchData();
    } catch (err) {
      console.error('Config save error:', err);
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
      const todayStr = new Date().toLocaleDateString('en-CA');
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
    const todayStr = new Date().toLocaleDateString('en-CA');
    const isHoliday = holidays.some((h) => h.holiday_date === todayStr);

    if (record) {
      if (record.status === 'Late') {
        return (
          <div className="admin-live-badge late">
            <span className="badge-text">Late</span>
            {record.marked_at && <span className="badge-time">{new Date(record.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
          </div>
        );
      }
      if (record.status === 'Excused') {
        return (
          <div className="admin-live-badge excused">
            <span className="badge-text">Excused</span>
            {record.override_reason && <span className="badge-reason" title={record.override_reason}>{record.override_reason.slice(0, 10)}...</span>}
          </div>
        );
      }
      if (record.status === 'Half Day') {
        return (
          <div className="admin-live-badge late">
            <span className="badge-text">Half Day</span>
            {record.marked_at && <span className="badge-time">{new Date(record.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
          </div>
        );
      }
      return (
        <div className="admin-live-badge present">
          <span className="badge-text">Present</span>
          {record.marked_at && <span className="badge-time">{new Date(record.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
        </div>
      );
    }

    if (isHoliday) {
      return <div className="admin-live-badge holiday"><span className="badge-text">Holiday</span></div>;
    }

    return <div className="admin-live-badge absent"><span className="badge-text">Absent</span></div>;
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
            className={`admin-tab ${activeTab === 'attendance' ? 'active' : ''}`}
          >
            <Clock size={16} /> Live Tracking
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`admin-tab ${activeTab === 'employees' ? 'active' : ''}`}
          >
            <Users size={16} /> Employee Directory & Enrollment
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`}
          >
            <Settings size={16} /> Geofencing & Timings
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`admin-tab ${activeTab === 'holidays' ? 'active' : ''}`}
          >
            <Calendar size={16} /> Holiday Settings
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
                    <thead className="admin-table-head">
                      <tr>
                        <th>Employee</th>
                        <th>Role</th>
                        <th>Method</th>
                        <th>Time (In/Out)</th>
                        <th>Status</th>
                        <th>Geofence</th>
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
                              {!record ? '-' : (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                  record.face_matched 
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15' 
                                    : 'bg-orange-500/10 text-orange-400 border border-orange-500/15'
                                }`}>
                                  {record.face_matched ? 'Face Biometric' : (record.direction_used === 'ADMIN_OVERRIDE' ? 'Manual' : record.direction_used)}
                                </span>
                              )}
                            </td>
                            <td className="admin-font-mono" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>
                              {!record ? '-' : (
                                <>
                                  {record.marked_at && (
                                    <div style={{ color: '#10B981' }}>In: {new Date(record.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                  )}
                                  {record.out_time && (
                                    <div style={{ color: '#F59E0B' }}>Out: {new Date(record.out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                  )}
                                  {!record.marked_at && !record.out_time && '-'}
                                </>
                              )}
                            </td>
                            <td >
                              {getAttendanceStatusBadge(emp.id, emp.role)}
                            </td>
                            <td className="admin-font-mono">
                              {!record ? '-' : (record.role === 'office' 
                                ? (record.distance_m != null ? `${record.distance_m.toFixed(1)}m` : 'Error')
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
                <div style={{ position: 'relative' }}>
                  <label className="admin-label">Full Name</label>
                  <input
                    type="text"
                    required
                    value={enrollForm.name}
                    onChange={handleNameChange}
                    onFocus={() => enrollForm.name.trim() && matchingEmployees.length > 0 && setActiveSuggestField('name')}
                    onBlur={() => setTimeout(() => setActiveSuggestField(null), 200)}
                    placeholder="Enter full name"
                    className="admin-input"
                  />
                  {activeSuggestField === 'name' && (
                    <div className="admin-suggestions-overlay">
                      {matchingEmployees.map(emp => (
                        <div 
                          key={emp.id} 
                          className="admin-suggestion-item"
                          onMouseDown={(e) => { e.preventDefault(); selectSuggestion(emp); }}
                        >
                          <div className="suggestion-name">{emp.full_name || emp.name} <span style={{fontSize: '0.65rem', color: '#94a3b8'}}>(ID: {emp.id.slice(0,8)})</span></div>
                          <div className="suggestion-email">{emp.email} (Auth User)</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div style={{ position: 'relative' }}>
                  <label className="admin-label">Corporate Email</label>
                  <input
                    type="email"
                    required
                    value={enrollForm.email}
                    onChange={handleEmailChange}
                    onFocus={() => enrollForm.email.trim() && matchingEmployees.length > 0 && setActiveSuggestField('email')}
                    onBlur={() => setTimeout(() => setActiveSuggestField(null), 200)}
                    placeholder="name@company.com"
                    className="admin-input"
                  />
                  {activeSuggestField === 'email' && (
                    <div className="admin-suggestions-overlay">
                      {matchingEmployees.map(emp => (
                        <div 
                          key={emp.id} 
                          className="admin-suggestion-item"
                          onMouseDown={(e) => { e.preventDefault(); selectSuggestion(emp); }}
                        >
                          <div className="suggestion-name">{emp.full_name || emp.name} <span style={{fontSize: '0.65rem', color: '#94a3b8'}}>(ID: {emp.id.slice(0,8)})</span></div>
                          <div className="suggestion-email">{emp.email} (Auth User)</div>
                        </div>
                      ))}
                    </div>
                  )}
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



                <button
                  type="submit"
                  disabled={enrollLoading}
                  className="admin-btn-primary"
                >
                  {enrollLoading ? 'Registering...' : 'Register Employee'}
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
                      <th style={{textAlign: "right"}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody >
                    {employees.map((emp) => (
                      <tr key={emp.id} className="admin-table-row">
                        <td className="admin-emp-cell">
                          <div className="admin-emp-info-main">
                            <span className="admin-emp-name">{emp.name}</span>
                            <span className="admin-emp-id-label">ID: {emp.id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="admin-emp-email-cell">
                          <div className="admin-email-badge-container">
                            <span className="admin-font-mono">{emp.email}</span>
                            {emp.has_auth ? (
                              <span className="admin-auth-badge verified" title="User has registered their account">
                                <ShieldCheck size={10} /> Registered
                              </span>
                            ) : (
                              <span className="admin-auth-badge pending" title="User has not registered yet">
                                <AlertTriangle size={10} /> Not Registered
                              </span>
                            )}
                          </div>
                        </td>
                        <td >
                          <span className={`admin-role-tag ${emp.role}`}>
                            {emp.role === 'office' ? 'Office' : 'Field'}
                          </span>
                        </td>
                        <td className="admin-biometric-cell" style={{ verticalAlign: 'top' }}>
                          {emp.face_encoding ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div className="admin-face-status enrolled" title="Biometric signature saved">
                                <div className="status-dot"></div> Enrolled
                              </div>
                              <button 
                                onClick={() => removeFaceData(emp.id)} 
                                style={{
                                  background: 'none', border: 'none', color: '#f43f5e', 
                                  cursor: 'pointer', fontSize: '0.75rem', display: 'flex', 
                                  alignItems: 'center', gap: '4px', padding: 0
                                }}
                              >
                                <Trash2 size={12} /> Remove Face
                              </button>
                            </div>
                          ) : (
                            <div className="admin-face-status missing" title="No biometric data found">
                              <div className="status-dot"></div> Missing
                            </div>
                          )}
                        </td>
                        <td style={{textAlign: "right", verticalAlign: 'top'}}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                            <button
                              onClick={() => toggleEmployeeStatus(emp.id, emp.is_active)}
                              className={`admin-toggle-btn ${emp.is_active ? 'active' : 'inactive'}`}
                            >
                              {emp.is_active ? 'Active' : 'Disabled'}
                            </button>
                            <button
                              onClick={() => deleteEmployee(emp.id)}
                              style={{
                                background: 'none', border: 'none', color: '#f43f5e', 
                                cursor: 'pointer', fontSize: '0.75rem', display: 'flex', 
                                alignItems: 'center', gap: '4px', padding: 0
                              }}
                            >
                              <Trash2 size={12} /> Delete Emp
                            </button>
                          </div>
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
                  
                  {/* Select Employee */}
                  <div>
                    <label className="admin-label">Assign Configuration To</label>
                    <select
                      value={configForm.employee_id}
                      onChange={(e) => setConfigForm({ ...configForm, employee_id: e.target.value })}
                      className="admin-input"
                    >
                      <option value="global">Global Office (Default applied to everyone)</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* OpenStreetMap Search Bar */}
                  <div style={{ position: 'relative' }}>
                    <label className="admin-label">Office Address (Location Search)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Search precise office location..."
                        value={configForm.address}
                        onChange={(e) => handleAddressSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                          }
                        }}
                        onFocus={() => { if (addressSuggestions.length > 0) setShowAddressSuggestions(true); }}
                        onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                        className="admin-input"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        title="Use My Current GPS Location"
                        onClick={() => {
                          if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(async (pos) => {
                              const lat = pos.coords.latitude;
                              const lng = pos.coords.longitude;
                              setConfigForm(prev => ({ ...prev, lat, lng }));
                              
                              try {
                                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                                const data = await res.json();
                                if (data && data.display_name) {
                                  setConfigForm(prev => ({ ...prev, address: data.display_name }));
                                }
                              } catch (err) {
                                console.error("Reverse geocoding failed", err);
                              }
                            }, (err) => {
                              alert("GPS location access denied or unavailable.");
                            }, {
                              enableHighAccuracy: true,
                              maximumAge: 0,
                              timeout: 10000
                            });
                          } else {
                            alert("Geolocation is not supported by your browser.");
                          }
                        }}
                        className="admin-btn-primary emerald"
                        style={{ width: 'auto', marginTop: 0, padding: '0 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                      >
                        <MapPin size={16} /> GPS
                      </button>
                    </div>
                    {showAddressSuggestions && addressSuggestions.length > 0 && (
                      <div className="admin-suggestions-overlay" style={{ maxHeight: '250px', overflowY: 'auto', zIndex: 50 }}>
                        {addressSuggestions.map(s => (
                          <div 
                            key={s.place_id} 
                            className="admin-suggestion-item"
                            onMouseDown={(e) => { e.preventDefault(); selectAddress(s); }}
                          >
                            <div className="suggestion-name" style={{ whiteSpace: 'normal', lineHeight: '1.4', fontSize: '0.85rem' }}>
                              {s.display_name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="admin-border-t">
                    <div className="grid grid-cols-2 gap-4">
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
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 my-2">
                    <div>
                      <label className="admin-label">Shift Start Time</label>
                      <input
                        type="time"
                        required
                        value={configForm.start_time || ''}
                        onChange={(e) => setConfigForm({ ...configForm, start_time: e.target.value })}
                        className="admin-input"
                      />
                    </div>
                    <div>
                      <label className="admin-label">Shift End Time</label>
                      <input
                        type="time"
                        required
                        value={configForm.end_time || ''}
                        onChange={(e) => setConfigForm({ ...configForm, end_time: e.target.value })}
                        className="admin-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 my-2">
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
                  </div>

                  <button
                    type="submit"
                    disabled={configLoading}
                    className="admin-btn-primary"
                    style={{ marginTop: '1rem' }}
                  >
                    {configLoading ? 'Saving Configuration...' : 'Save Office Location'}
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
              
              {/* Highly interactive map component */}
              <div className="admin-map-container">
                <InteractiveMap 
                  lat={configForm.lat} 
                  lng={configForm.lng} 
                  onLocationChange={handleMapInteraction}
                />
                
                {/* Visual Glassmorphic coordinates box */}
                <div className="admin-map-overlay">
                  <h4 className="admin-map-overlay-title">
                    <MapPin className="w-4 h-4 text-emerald-400" /> Geofence Map Preview
                  </h4>
                  <div className="admin-map-overlay-coords">
                    <span>Coordinates: {Number(configForm.lat || 0).toFixed(6)}, {Number(configForm.lng || 0).toFixed(6)}</span>
                    <span>Active perimeter radius: {configForm.radius_meters} meters</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Employee Configurations Table */}
            <div style={{ gridColumn: '1 / -1' }} className="admin-panel admin-panel-padded">
              <div className="admin-panel-header">
                <Users />
                <h3 className="admin-panel-title">Custom Employee Assignments</h3>
              </div>
              <p className="admin-map-overlay-title" style={{marginBottom:'1rem', color:'var(--text-muted)', fontSize: '0.85em'}}>
                Employees listed here bypass the global settings and follow their own assigned radius and shift constraints.
              </p>

              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th>Employee</th>
                      <th>Custom Location</th>
                      <th>Radius</th>
                      <th>Shift Timings</th>
                      {isSuperAdminUser && <th style={{textAlign: "right"}}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {employeeConfigs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="admin-table-empty">
                          No custom employee configurations found. All employees are using the Global Office settings.
                        </td>
                      </tr>
                    ) : (
                      employeeConfigs.map((conf) => {
                        const empName = employees.find(e => e.id === conf.employee_id)?.name || 'Unknown User';
                        return (
                          <tr key={conf.id} className="admin-table-row">
                            <td>
                              <div className="admin-table-cell-bold">{empName}</div>
                            </td>
                            <td>
                              <div className="text-sm" title={conf.address || `${conf.lat}, ${conf.lng}`} style={{maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                {conf.address ? conf.address : `${Number(conf.lat).toFixed(4)}, ${Number(conf.lng).toFixed(4)}`}
                              </div>
                            </td>
                            <td><span className="admin-badge admin-badge-info">{conf.radius_meters}m</span></td>
                            <td>
                              <div className="text-sm">{conf.start_time.slice(0,5)} - {conf.end_time.slice(0,5)}</div>
                              {conf.updated_by && <div className="text-xs mt-1" style={{color: 'var(--brand-primary)', fontWeight: '600'}}>✏️ Edited By: {conf.updated_by}</div>}
                            </td>
                            {isSuperAdminUser && (
                              <td style={{textAlign: "right", paddingRight: "1rem"}}>
                                <button 
                                  type="button"
                                  onClick={() => handleEditCustomConfig(conf)}
                                  className="admin-btn-icon"
                                  style={{color: "var(--brand-primary)", marginRight: "0.5rem"}}
                                  title="Edit Timings / Location"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => handleDeleteCustomConfig(conf.employee_id)}
                                  className="admin-btn-icon" 
                                  style={{color: "var(--danger)"}}
                                  title="Revert to global"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
                      <tr key={hol.id} className="admin-holiday-row">
                        <td className="admin-holiday-name">{hol.name}</td>
                        <td className="admin-holiday-date-text">
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
      {absentEmployees.length > 0 && currentAbsentEmp && !showOverrideModal && !showAlertModal && (
        <button 
          onClick={() => setShowAlertModal(true)}
          style={{
            position: 'fixed', bottom: '20px', right: '20px', 
            background: '#1e293b', 
            border: '1px solid #334155',
            padding: '10px 15px', borderRadius: '20px',
            color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}
        >
          <div style={{width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'}} />
          <span style={{fontSize: '0.85rem', fontWeight: 600}}>Absent Alerts ({absentEmployees.length})</span>
        </button>
      )}

      {absentEmployees.length > 0 && currentAbsentEmp && !showOverrideModal && showAlertModal && (
        <div className="admin-popup-alert">
          <div className="admin-popup-header">
            <div className="admin-popup-header-left">
              <div className="admin-ping-dot" />
              <span className="admin-popup-title">Absent Employee Alert</span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <span className="admin-popup-count">
                {currentAbsentIndex + 1} of {absentEmployees.length} missing
              </span>
              <button 
                onClick={() => setShowAlertModal(false)}
                style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px'}}
              >
                <X size={14} />
              </button>
            </div>
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
