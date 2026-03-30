import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  Radio, 
  Save, 
  ArrowLeft, 
  MessageCircle, 
  Trash2, 
  Link, 
  RefreshCw, 
  Search, 
  Ship, 
  Map, 
  Clock, 
  Package,
  FileText,
  Anchor,
  ShieldCheck,
  Truck,
  CheckCircle,
  Users
} from 'lucide-react';
import { STATUS_STEPS, STATUS_COLORS } from '../constants/shipment';
import ShipmentMap from './ShipmentMap';
import StatusTimeline from './StatusTimeline';
import LocationPicker from './LocationPicker';
import { openRazorpay } from '../utils/paymentUtils';
import './ShipmentTracking.css';

/* ─── Status Update Form ─────────────────────────────── */
function StatusUpdateForm({ shipment, onUpdated }) {
    const [form, setForm] = useState({
        status: shipment.status || '',
        location: '',
        remarks: '',
        estimated_arrival: '',
    });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = async e => {
        e.preventDefault();
        if (!form.status) return;
        setSaving(true);
        setMsg('');
        try {
            // 1. Insert into shipment_updates
            const { error: updErr } = await supabase
                .from('shipment_updates')
                .insert([{
                    shipment_id: shipment.id,
                    status: form.status,
                    location: form.location || null,
                    remarks: form.remarks || null,
                    estimated_arrival: form.estimated_arrival || null,
                }]);
            if (updErr) throw updErr;

            // 2. Update master status on shipments table
            const { error: shipErr } = await supabase
                .from('shipments')
                .update({
                    status: form.status,
                    current_location: form.location || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', shipment.id);
            if (shipErr) throw shipErr;

            setMsg('✅ Status updated successfully! Refreshing page...');
            setForm(p => ({ ...p, location: '', remarks: '', estimated_arrival: '' }));
            setTimeout(() => { 
                window.location.reload(); 
            }, 1000);
        } catch (err) {
            setMsg('❌ ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="st-update-form" onSubmit={handleSubmit}>
            <h3 className="st-section-title">
                <Radio size={18} style={{ marginRight: '8px' }} />
                Update Shipment Status
            </h3>
            <div className="st-form-grid">
                <div className="st-form-group">
                    <label>New Status *</label>
                    <select name="status" value={form.status} onChange={handleChange} required>
                        <option value="">Select status…</option>
                        {STATUS_STEPS.map(s => <option key={s.key}>{s.key}</option>)}
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
                <div className="st-form-group st-form-group--full">
                    <label>Current Location *</label>
                    <LocationPicker 
                        value={form.location}
                        onLocationSelect={({ address, lat, lng }) => {
                            if (!address) return;
                            const val = `${address} || ${lat},${lng}`;
                            setForm(p => ({ ...p, location: val }));
                        }}
                    />
                </div>
                <div className="st-form-group">
                    <label>Estimated Arrival</label>
                    <input 
                        type="date" 
                        name="estimated_arrival" 
                        value={form.estimated_arrival} 
                        onChange={handleChange} 
                        min={new Date().toISOString().split('T')[0]} 
                    />
                </div>
                <div className="st-form-group st-form-group--full">
                    <label>Remarks / Notes</label>
                    <textarea name="remarks" value={form.remarks} onChange={handleChange}
                        rows={2} placeholder="Add tracking notes or comments…" />
                </div>
            </div>
            {msg && <div className={`st-msg ${msg.startsWith('✅') || msg.toLowerCase().includes('success') ? 'st-msg--ok' : 'st-msg--err'}`}>{msg}</div>}
            <button className="st-submit-btn" disabled={saving} type="submit">
                {saving ? 'Saving…' : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <Save size={18} />
                        Save Update
                    </div>
                )}
            </button>
        </form>
    );
}

/* ─── Shipment Detail Panel ─────────────────────────── */
function ShipmentDetail({ shipment, onBack, onRefresh }) {
    const [updates, setUpdates] = useState([]);
    const [loadingUpdates, setLoadingUpdates] = useState(true);

    const fetchUpdates = useCallback(async () => {
        setLoadingUpdates(true);
        const { data } = await supabase
            .from('shipment_updates')
            .select('*')
            .eq('shipment_id', shipment.id)
            .order('created_at', { ascending: false });
        setUpdates(data || []);
        setLoadingUpdates(false);
    }, [shipment.id]);

    useEffect(() => { fetchUpdates(); }, [fetchUpdates]);

    const statusColor = STATUS_COLORS[shipment.status] || '#6366f1';

    const fields = [
        ['Shipment No', shipment.shipment_no || shipment.id],
        ['Job No', shipment.job_no],
        ['Client', shipment.client],
        ['Shipper', shipment.shipper],
        ['Consignee', shipment.consignee],
        ['Type', shipment.shipment_type],
        ['Trade', shipment.trade_direction],
        ['Service', shipment.service_type],
        ['POR', shipment.por],
        ['POL', shipment.pol],
        ['POD', shipment.pod],
        ['POF', shipment.pof],
        ['ETD', shipment.etd],
        ['ETA', shipment.eta],
        ['HBL No', shipment.hbl_no],
        ['Container No', shipment.containerNo || shipment.container_no],
        ['Vessel', shipment.vessel],
        ['Voyage', shipment.voy],
        ['AWB', shipment.awb],
        ['Commodity', shipment.commodity],
        ['Gross Weight', shipment.gross_weight],
        ['Volume', shipment.volume],
        ['Location Now', shipment.current_location],
    ].filter(([, v]) => v);

    const [activeToken, setActiveToken] = useState(null);

    useEffect(() => {
        const gen = updates.find(u => u.status === 'Link Generated');
        if (gen) {
            const isRevoked = updates.some(u => u.status === 'Link Revoked' && u.remarks === gen.remarks);
            setActiveToken(isRevoked ? null : gen.remarks);
        } else {
            setActiveToken(null);
        }
    }, [updates]);

    const handleShare = () => {
        if (!activeToken) return;
        const url = `${window.location.origin}/track/${activeToken}`;
        const text = `Track your shipment ${shipment.shipment_no || shipment.id} update here: ${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleGenerateLink = async () => {
        const token = crypto.randomUUID();
        try {
            const { error } = await supabase
                .from('shipment_updates')
                .insert([{
                    shipment_id: shipment.id,
                    status: 'Link Generated',
                    remarks: token,
                    created_at: new Date().toISOString()
                }]);
            if (error) throw error;
            fetchUpdates();
        } catch (err) {
            alert('Error generating link: ' + err.message);
        }
    };

    const handleDestroyLink = async () => {
        if (!activeToken) return;
        try {
            const { error } = await supabase
                .from('shipment_updates')
                .insert([{
                    shipment_id: shipment.id,
                    status: 'Link Revoked',
                    remarks: activeToken,
                    created_at: new Date().toISOString()
                }]);
            if (error) throw error;
            fetchUpdates();
        } catch (err) {
             alert('Error destroying link: ' + err.message);
        }
    };

    return (
        <div className="st-detail">
            {/* Header */}
            <div className="st-detail-header">
                <button className="st-back-btn" onClick={onBack}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} />
                    Back
                </button>
                <div className="st-detail-title">
                    <h2>{shipment.shipment_no || `SHP-${String(shipment.id).padStart(6, '0')}`}</h2>
                    <span className="st-status-chip" style={{ background: statusColor }}>
                        {shipment.status || 'Booked'}
                    </span>
                </div>
                <div className="st-header-actions" style={{ display: 'flex', gap: '8px' }}>
                    {activeToken ? (
                        <>
                            <button className="st-refresh-btn" style={{ background: '#25D366', color: '#fff', border: 'none' }} onClick={handleShare}>
                                <MessageCircle size={16} />
                                Share WhatsApp
                            </button>
                            <button className="st-refresh-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={handleDestroyLink}>
                                <Trash2 size={16} />
                                Destroy Link
                            </button>
                        </>
                    ) : (
                        <button className="st-refresh-btn" style={{ background: '#6366f1', color: '#fff', border: 'none' }} onClick={handleGenerateLink}>
                            <Link size={16} />
                            Generate Share Link
                        </button>
                    )}
                    <button className="st-refresh-btn" onClick={() => { fetchUpdates(); onRefresh(); }}>
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Map */}
            <div className="st-map-wrapper">
                <h3 className="st-section-title">
                    <Map size={18} style={{ marginRight: '8px' }} />
                    Route Map
                </h3>
                <ShipmentMap
                    origin={shipment.por || shipment.pol}
                    destination={shipment.pod || shipment.destination}
                    currentLocation={shipment.current_location}
                    status={shipment.status}
                    shipmentType={shipment.shipment_type}
                />
            </div>

            <div className="st-detail-body">
                {/* Timeline */}
                <div className="st-detail-left">
                    <h3 className="st-section-title">
                        <Clock size={18} style={{ marginRight: '8px' }} />
                        Tracking Timeline
                    </h3>
                    {loadingUpdates ? (
                        <div className="st-loading">Loading updates…</div>
                    ) : (
                        <StatusTimeline currentStatus={shipment.status} updates={updates} />
                    )}
                </div>

                {/* Info + Update Form */}
                <div className="st-detail-right">
                    <h3 className="st-section-title">
                        <Package size={18} style={{ marginRight: '8px' }} />
                        Shipment Details
                    </h3>
                    <div className="st-info-grid">
                        {fields.map(([label, value]) => (
                            <div key={label} className="st-info-row">
                                <span className="st-info-label">{label}</span>
                                <span className="st-info-value">{value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="st-divider" />
                    <StatusUpdateForm
                        shipment={shipment}
                        onUpdated={() => { fetchUpdates(); onRefresh(); }}
                    />
                </div>
            </div>
        </div>
    );
}

const IconMap = {
    FileText,
    Ship,
    Anchor,
    ShieldCheck,
    Truck,
    CheckCircle,
    Users
};

/* ───表达 Shipment List ──────────────────────────────────── */
function ShipmentList({ onSelect }) {
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    const fetchShipments = useCallback(async () => {
        setLoading(true);
        let q = supabase
            .from('shipments')
            .select('id,shipment_no,job_no,client,por,pod,status,shipment_type,current_location,etd,eta,awb,hbl_no,updated_at,shipment_date')
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (statusFilter) q = q.eq('status', statusFilter);
        if (typeFilter) q = q.eq('shipment_type', typeFilter);

        const { data, error } = await q;
        if (!error) setShipments(data || []);
        setLoading(false);
    }, [statusFilter, typeFilter]);

    useEffect(() => { fetchShipments(); }, [fetchShipments]);

    const filtered = shipments.filter(s => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            (s.shipment_no || '').toLowerCase().includes(q) ||
            (s.job_no || '').toLowerCase().includes(q) ||
            (s.client || '').toLowerCase().includes(q) ||
            (s.por || '').toLowerCase().includes(q) ||
            (s.pod || '').toLowerCase().includes(q) ||
            (s.awb || '').toLowerCase().includes(q) ||
            (s.hbl_no || '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="st-list">
            {/* Filters */}
            <div className="st-filters">
                <div className="st-search-bar">
                    <Search size={18} className="st-search-icon" />
                    <input
                        className="st-search"
                        placeholder="Search shipment, AWB, HBL, client, route…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="st-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    {STATUS_STEPS.map(s => <option key={s.key}>{s.key}</option>)}
                    <option>Cancelled</option>
                </select>
                <select className="st-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="">All Types</option>
                    <option>AIR FREIGHT</option>
                    <option>SEA FREIGHT</option>
                    <option>TRANSPORT</option>
                    <option>OTHERS</option>
                </select>
                <button className="st-refresh-btn-sm" onClick={fetchShipments}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Stats row */}
            <div className="st-stat-row">
                {STATUS_STEPS.map(step => {
                    const count = shipments.filter(s => s.status === step.key).length;
                    const Icon = IconMap[step.icon] || FileText;
                    return (
                        <button
                            key={step.key}
                            className={`st-stat-chip ${statusFilter === step.key ? 'active' : ''}`}
                            style={{ '--chip-color': STATUS_COLORS[step.key] }}
                            onClick={() => setStatusFilter(p => p === step.key ? '' : step.key)}
                        >
                            <span><Icon size={18} /></span>
                            {count > 0 && <span>{count}</span>}
                            <small>{step.label}</small>
                        </button>
                    );
                })}
                
                {/* Total Customers Stat */}
                <button 
                    className={`st-stat-chip ${statusFilter === 'CUSTOMERS' ? 'active' : ''}`}
                    style={{ '--chip-color': '#000000' }}
                    onClick={() => setStatusFilter('')}
                >
                    <span><Users size={18} /></span>
                    <span>{new Set(shipments.map(s => s.client).filter(Boolean)).size}</span>
                    <small>Customers</small>
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="st-loading">Loading shipments…</div>
            ) : filtered.length === 0 ? (
                <div className="st-empty">No shipments found</div>
            ) : (
                <div className="st-table-wrap">
                    <table className="st-table">
                        <thead>
                            <tr>
                                <th>Shipment No</th>
                                <th>AWB / HBL</th>
                                <th>Client</th>
                                <th>Route</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Location</th>
                                <th>ETA</th>
                                <th>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(s => (
                                <tr key={s.id} className="st-table-row" onClick={() => onSelect(s)}>
                                    <td className="st-mono">{s.shipment_no || `MTD-${String(s.id).slice(0, 8).toUpperCase()}`}</td>
                                    <td className="st-mono st-awb">{s.awb || s.hbl_no || '—'}</td>
                                    <td>{s.client || '—'}</td>
                                    <td className="st-route">{s.por || '—'} → {s.pod || '—'}</td>
                                    <td><span className="st-type-badge">{s.shipment_type || '—'}</span></td>
                                    <td>
                                        <span className="st-status-pill"
                                            style={{ background: (STATUS_COLORS[s.status] || '#6366f1') + '22', color: STATUS_COLORS[s.status] || '#6366f1', border: `1px solid ${STATUS_COLORS[s.status] || '#6366f1'}44` }}>
                                            {s.status || 'Booked'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`st-payment-pill ${s.payment_status === 'paid' ? 'paid' : 'pending'}`}>
                                            {s.payment_status === 'paid' ? 'Paid' : (parseFloat(s.freight) > 0 ? `Pay Now` : 'Unpaid')}
                                            {s.payment_status !== 'paid' && parseFloat(s.freight) > 0 && (
                                                <button 
                                                    className="st-pay-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openRazorpay(s, s.freight, () => setRefreshKey(k => k + 1), (err) => alert(err));
                                                    }}
                                                >
                                                    💳
                                                </button>
                                            )}
                                        </span>
                                    </td>
                                    <td className="st-location">{s.current_location || '—'}</td>
                                    <td>{s.eta ? new Date(s.eta).toLocaleDateString() : '—'}</td>
                                    <td className="st-muted">{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ─── Root Component ─────────────────────────────────── */
export default function ShipmentTracking() {
    const [selected, setSelected] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    /* Load MapLibre CSS + JS once */
    useEffect(() => {
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
    }, []);

    const handleBack = () => setSelected(null);
    const handleRefresh = () => setRefreshKey(k => k + 1);

    return (
        <div className="st-root">
            <div className="st-page-header">
                <div className="st-page-header-left">
                <h1>
                    <Ship size={32} style={{ marginRight: '12px' }} />
                    Shipment Tracking
                </h1>
                    <p>Real-time shipment monitoring, status updates &amp; route visualization</p>
                </div>
            </div>

            {selected ? (
                <ShipmentDetail
                    key={`${selected.id}-${refreshKey}`}
                    shipment={selected}
                    onBack={handleBack}
                    onRefresh={handleRefresh}
                />
            ) : (
                <ShipmentList key={refreshKey} onSelect={s => setSelected(s)} />
            )}
        </div>
    );
}
