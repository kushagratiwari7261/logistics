import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { 
    Check, 
    User, 
    Lock, 
    Moon, 
    Sun, 
    Monitor, 
    Bell, 
    Shield, 
    AlertTriangle, 
    Trash2 
} from 'lucide-react'

import { ACCENTS, applyColorMode, applyAccent } from '../utils/themeUtils'
import './Settings.css'

/* ── Accent colour presets ─────────────────────────────────── */


const Settings = ({ user }) => {
    const [colorMode, setColorMode] = useState('dark')
    const [accentColor, setAccentColor] = useState('indigo')
    const [sidebarCompact, setSidebarCompact] = useState(false)
    const [emailNotif, setEmailNotif] = useState(true)
    const [pushNotif, setPushNotif] = useState(false)
    const [saving, setSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState('')
    const [loading, setLoading] = useState(true)

    const loadPrefs = useCallback(async () => {
        // First try to load from Supabase (Primary Source)
        if (supabase && user?.id) {
            console.log('Fetching preferences from user_settings for:', user.id);
            const { data, error } = await supabase
              .from('user_settings')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle()

            if (error) {
                console.warn('Error loading remote prefs:', error);
            } else if (data) {
                console.log('✅ Remote preferences found:', data);
                setColorMode(data.theme ?? 'dark');
                setAccentColor(data.accent_color ?? 'indigo');
                setEmailNotif(data.email_notifications ?? true);
                setPushNotif(data.push_notifications ?? false);
                
                applyColorMode(data.theme ?? 'dark');
                applyAccent(data.accent_color ?? 'indigo');
                
                // Keep local storage in sync
                localStorage.setItem('sf_color_mode', data.theme ?? 'dark');
                localStorage.setItem('sf_accent_color', data.accent_color ?? 'indigo');
                
                setLoading(false);
                return;
            }
        }

        // Fallback to local storage if not logged in or no record found
        console.log('Falling back to local storage preferences');
        const lm = localStorage.getItem('sf_color_mode') ?? 'dark'
        const la = localStorage.getItem('sf_accent_color') ?? 'indigo'
        const lsc = localStorage.getItem('sf_sidebar_compact') === 'true'
        const le = localStorage.getItem('sf_email_notif') !== 'false'
        const lp = localStorage.getItem('sf_push_notif') === 'true'
        
        setColorMode(lm); setAccentColor(la); setSidebarCompact(lsc)
        setEmailNotif(le); setPushNotif(lp)
        applyColorMode(lm); applyAccent(la)
        
        setLoading(false)
    }, [user])

    useEffect(() => { loadPrefs() }, [loadPrefs])

    const savePrefs = async () => {
        setSaving(true)
        console.log('Saving preferences to Supabase:', { colorMode, accentColor });

        localStorage.setItem('sf_color_mode', colorMode)
        localStorage.setItem('sf_accent_color', accentColor)
        localStorage.setItem('sf_sidebar_compact', String(sidebarCompact))
        localStorage.setItem('sf_email_notif', String(emailNotif))
        localStorage.setItem('sf_push_notif', String(pushNotif))

        if (supabase && user?.id) {
            const { error } = await supabase.from('user_settings').upsert({
                user_id: user.id,
                theme: colorMode,
                accent_color: accentColor,
                email_notifications: emailNotif,
                push_notifications: pushNotif,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })

            if (error) {
                console.error('Error saving settings to Supabase:', error);
                alert('Connection error: Settings saved locally but not to cloud. Please check your internet.');
            } else {
                console.log('✅ Settings saved to Supabase successfully');
            }
        }
        setSaving(false)
        setSavedMsg('Saved!')
        setTimeout(() => setSavedMsg(''), 2500)
    }

    const handleDeleteAccount = async () => {
        if (!window.confirm("Are you absolutely sure you want to delete your account? Your profile and messages will be removed, but essential company records (Jobs, Shipments, Payments, and Tracking) will be permanently preserved. This action cannot be undone.")) {
            return;
        }

        setSaving(true);
        try {
            // Note: Jobs, Shipments, Payments, and Tracking are explicitly NOT deleted to preserve company records.
            // 1. Delete all messages associated with this user
            await supabase.from('messages').delete().or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

            // 2. Delete profile and user settings
            await supabase.from('user_settings').delete().eq('user_id', user.id);
            await supabase.from('profiles').delete().eq('id', user.id);

            // 5. Try to call an RPC if it exists in the backend to delete the auth.users record
            const { error: rpcError } = await supabase.rpc('delete_user');
            if (rpcError && !rpcError.message.includes('Could not find')) {
                console.warn('RPC delete_user failed:', rpcError);
            }

            // 6. Force sign out and clear local storage
            await supabase.auth.signOut();
            
            // Clean local storage fully
            const storageKeys = Object.keys(localStorage);
            storageKeys.forEach(key => {
                if (key.includes('supabase') || key.includes('sf_') || key.includes('sb-')) {
                    localStorage.removeItem(key);
                }
            });
            
            window.location.href = '/login';

        } catch (error) {
            console.error("Error deleting account logs:", error);
            alert("An error occurred while cleaning up your account data. Please contact support. Details: " + error.message);
        } finally {
            setSaving(false);
        }
    }

    const handleMode = (m) => { setColorMode(m); applyColorMode(m) }
    const handleAccent = (id) => { setAccentColor(id); applyAccent(id) }

    const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'SF'
    const currentAccent = ACCENTS.find(a => a.id === accentColor) ?? ACCENTS[0]

    if (loading) return (
        <div className="settings-loading"><div className="settings-spinner" /></div>
    )

    return (
        <div className="settings-page page-enter">

            {/* Top bar */}
            <div className="settings-topbar">
                <div>
                    <h1 className="settings-title">Settings</h1>
                    <p className="settings-subtitle">Manage your workspace and preferences</p>
                </div>
                <button className="settings-save-btn" onClick={savePrefs} disabled={saving}>
                    {saving ? <><span className="settings-btn-spinner" />Saving…</> : <><Check size={18} />Save</>}
                </button>
            </div>

            {savedMsg && (
                <div className="settings-toast"><Check size={18} /> {savedMsg}</div>
            )}

            <div className="settings-layout">

                {/* LEFT */}
                <div className="settings-col">

                    {/* Profile */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)' }}><User size={18} /></span>
                            <div><h3 className="s-card-title">Profile</h3><p className="s-card-desc">Your account information</p></div>
                        </div>
                        <div className="s-profile-row">
                            <div className="s-avatar" style={{ background: currentAccent.gradient }}>{initials}</div>
                            <div>
                                <p className="s-profile-email">{user?.email ?? '—'}</p>
                                <p className="s-profile-role">Freight Administrator</p>
                            </div>
                        </div>
                        <Link to="/change-password" className="s-link-btn"><Lock size={16} /> Change Password</Link>

                    </div>

                    {/* Appearance */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#0891b2,#22d3ee)' }}><Moon size={18} /></span>
                            <div><h3 className="s-card-title">Appearance</h3><p className="s-card-desc">Theme and display settings</p></div>
                        </div>

                        {/* Color mode */}
                        <p className="s-field-label">Color Mode</p>
                        <div className="s-mode-row">
                            {[
                                { id: 'dark', label: 'Dark', icon: Moon, desc: 'Easy on eyes' },
                                { id: 'light', label: 'Light', icon: Sun, desc: 'Bright & clean' },
                                { id: 'system', label: 'System', icon: Monitor, desc: 'Auto-detect' },
                            ].map(m => (
                                <button key={m.id} className={`s-mode-btn ${colorMode === m.id ? 'active' : ''}`} onClick={() => handleMode(m.id)}>
                                    <span className="s-mode-emoji"><m.icon size={20} /></span>
                                    <span className="s-mode-label">{m.label}</span>
                                    <span className="s-mode-desc">{m.desc}</span>
                                </button>
                            ))}
                        </div>

                        {/* Accent colour */}
                        <p className="s-field-label" style={{ marginTop: 20 }}>Accent Colour</p>
                        <div className="s-accent-grid">
                            {ACCENTS.map(a => (
                                <button
                                    key={a.id}
                                    className={`s-accent-btn ${accentColor === a.id ? 'active' : ''}`}
                                    onClick={() => handleAccent(a.id)}
                                    title={a.label}
                                >
                                    <span className="s-accent-dot" style={{ background: a.gradient }} />
                                    <span className="s-accent-label">{a.label}</span>
                                    {accentColor === a.id && <span className="s-accent-check"><Check size={14} /></span>}
                                </button>
                            ))}
                        </div>

                        {/* Compact sidebar */}
                        <div className="s-toggle-row" style={{ marginTop: 16 }}>
                            <div>
                                <p className="s-toggle-label">Compact Sidebar</p>
                                <p className="s-toggle-desc">Smaller navigation, more content space</p>
                            </div>
                            <Toggle on={sidebarCompact} onToggle={() => setSidebarCompact(v => !v)} />
                        </div>
                    </div>
                </div>

                {/* RIGHT */}
                <div className="settings-col">

                    {/* Notifications */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#d97706,#fbbf24)' }}><Bell size={18} /></span>
                            <div><h3 className="s-card-title">Notifications</h3><p className="s-card-desc">Control how we reach you</p></div>
                        </div>
                        <div className="s-toggle-row">
                            <div><p className="s-toggle-label">Email Notifications</p><p className="s-toggle-desc">Shipment updates, invoices, alerts</p></div>
                            <Toggle on={emailNotif} onToggle={() => setEmailNotif(v => !v)} />
                        </div>
                        <div className="s-toggle-row" style={{ borderBottom: 'none' }}>
                            <div><p className="s-toggle-label">Push Notifications</p><p className="s-toggle-desc">Browser and desktop alerts</p></div>
                            <Toggle on={pushNotif} onToggle={() => setPushNotif(v => !v)} />
                        </div>
                    </div>

                    {/* Account & Security */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#059669,#34d399)' }}><Shield size={18} /></span>
                            <div><h3 className="s-card-title">Account & Security</h3><p className="s-card-desc">Manage your account settings</p></div>
                        </div>
                        <div className="s-info-row">
                            <span className="s-info-label">Account status</span>
                            <span className="s-info-badge active">Active</span>
                        </div>
                        <div className="s-info-row">
                            <span className="s-info-label">Two-factor auth</span>
                            <span className="s-info-badge muted">Not set up</span>
                        </div>
                        <div className="s-info-row" style={{ borderBottom: 'none' }}>
                            <span className="s-info-label">Last session</span>
                            <span className="s-info-value">Just now</span>
                        </div>
                    </div>

                    {/* Danger */}
                    <div className="s-card s-card-danger">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#991b1b,#f87171)' }}><AlertTriangle size={18} /></span>
                            <div><h3 className="s-card-title" style={{ color: 'var(--danger)' }}>Danger Zone</h3><p className="s-card-desc">These actions cannot be undone</p></div>
                        </div>
                        <button className="s-danger-btn" onClick={handleDeleteAccount} disabled={saving}>
                            {saving ? <span className="settings-btn-spinner" /> : <Trash2 size={16} />} 
                            {saving ? 'Deleting...' : 'Delete Account'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const Toggle = ({ on, onToggle }) => (
    <button className={`s-toggle ${on ? 'on' : ''}`} onClick={onToggle} type="button" aria-label="toggle">
        <span className="s-toggle-thumb" />
    </button>
)

export default Settings
