import { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import { api } from '../utils/api';
import { Save, RefreshCw, AlertCircle, Factory, Navigation, Clock, ShieldCheck, ArrowRightLeft, Shield, Users, MessageCircle, QrCode, Send, Trash2, Plus, X, Globe, Check } from 'lucide-react'

const Configuration = () => {
    const { showNotification } = useNotification();
    const [producers, setProducers] = useState([]);
    const [consumers, setConsumers] = useState([]);
    const [matrix, setMatrix] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hoveredRow, setHoveredRow] = useState(null);
    const [hoveredCol, setHoveredCol] = useState(null);

    const [whatsappStatus, setWhatsappStatus] = useState({ connected: false, state: 'unknown', loading: true });
    const [whatsappConfig, setWhatsappConfig] = useState({});
    const [whatsappConfigLoading, setWhatsappConfigLoading] = useState(true);
    const [whatsappConfigSaving, setWhatsappConfigSaving] = useState(false);
    const [groupMappings, setGroupMappings] = useState([]);
    const [availableGroups, setAvailableGroups] = useState([]);
    const [showQrModal, setShowQrModal] = useState(false);
    const [qrCode, setQrCode] = useState(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);
    const [newGroupMapping, setNewGroupMapping] = useState({
        group_jid: '',
        group_name: '',
        mapping_type: 'producer',
        node_id: '',
        language_code: 'en',
        is_active: true,
        notifications_enabled: true,
        notify_trip_assigned: true,
        notify_trip_started: true,
        notify_trip_completed: true,
        notify_deviations: true,
        notify_daily_report: true
    });
    const [testMessage, setTestMessage] = useState('');
    const [sendingTest, setSendingTest] = useState(false);

    const SUPPORTED_LANGUAGES = {
        en: 'English',
        hi: 'Hindi',
        kn: 'Kannada',
        te: 'Telugu',
        ta: 'Tamil',
        mr: 'Marathi',
        gu: 'Gujarati',
        bn: 'Bengali'
    };

    useEffect(() => { fetchConfig(); fetchWhatsAppStatus(); fetchWhatsAppConfig(); fetchGroupMappings(); }, []);

    const fetchWhatsAppStatus = async () => {
        try {
            const data = await api.get('/api/whatsapp/status');
            setWhatsappStatus({
                connected: data.service?.connected || false,
                state: data.service?.state || 'unknown',
                phoneNumber: data.service?.phoneNumber,
                enabled: data.enabled,
                loading: false
            });
        } catch (error) {
            console.log('WhatsApp status not available:', error.message);
            setWhatsappStatus({ connected: false, state: 'error', loading: false });
        }
    };

    const fetchWhatsAppConfig = async () => {
        setWhatsappConfigLoading(true);
        try {
            const data = await api.get('/api/whatsapp/config');
            const configMap = {};
            (data.configs || []).forEach(c => {
                configMap[c.config_key] = c.config_value;
            });
            setWhatsappConfig(configMap);
        } catch (error) {
            console.log('WhatsApp config not available:', error.message);
        } finally {
            setWhatsappConfigLoading(false);
        }
    };

    const fetchGroupMappings = async () => {
        try {
            const data = await api.get('/api/whatsapp/group-mappings');
            setGroupMappings(data.mappings || []);
        } catch (error) {
            console.log('Group mappings not available:', error.message);
        }
    };

    const fetchAvailableGroups = async () => {
        try {
            const data = await api.get('/api/whatsapp/groups');
            setAvailableGroups(data.groups || []);
        } catch (error) {
            showNotification('error', 'Failed to fetch WhatsApp groups. Make sure WhatsApp is connected.');
        }
    };

    const handleWhatsAppConfigToggle = (key, value) => {
        setWhatsappConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleSaveWhatsAppConfig = async () => {
        setWhatsappConfigSaving(true);
        try {
            const configs = Object.entries(whatsappConfig).map(([key, value]) => ({
                config_key: key,
                config_value: String(value)
            }));
            await api.post('/api/whatsapp/config/bulk', { configs });
            showNotification('success', 'WhatsApp settings saved successfully!');
            fetchWhatsAppStatus();
        } catch (error) {
            showNotification('error', `Failed to save: ${error.message}`);
        } finally {
            setWhatsappConfigSaving(false);
        }
    };

    const handleGetQRCode = async () => {
        setQrLoading(true);
        setShowQrModal(true);
        try {
            const data = await api.get('/api/whatsapp/qr');
            if (data.connected) {
                showNotification('info', 'WhatsApp is already connected!');
                setShowQrModal(false);
            } else if (data.qrCode) {
                setQrCode(data.qrCode);
            } else {
                showNotification('warning', data.message || 'QR code not available');
            }
        } catch (error) {
            showNotification('error', `Failed to get QR code: ${error.message}`);
        } finally {
            setQrLoading(false);
        }
    };

    const handleWhatsAppLogout = async () => {
        if (!window.confirm('Are you sure you want to disconnect WhatsApp?')) return;
        try {
            await api.post('/api/whatsapp/logout');
            showNotification('success', 'WhatsApp disconnected');
            setWhatsappStatus({ connected: false, state: 'disconnected', loading: false });
        } catch (error) {
            showNotification('error', `Failed to disconnect: ${error.message}`);
        }
    };

    const handleAddGroupMapping = async () => {
        try {
            await api.post('/api/whatsapp/group-mappings', newGroupMapping);
            showNotification('success', 'Group mapping added successfully!');
            setShowAddGroupModal(false);
            setNewGroupMapping({
                group_jid: '',
                group_name: '',
                mapping_type: 'producer',
                node_id: '',
                language_code: 'en',
                is_active: true,
                notifications_enabled: true,
                notify_trip_assigned: true,
                notify_trip_started: true,
                notify_trip_completed: true,
                notify_deviations: true,
                notify_daily_report: true
            });
            fetchGroupMappings();
        } catch (error) {
            showNotification('error', `Failed to add mapping: ${error.message}`);
        }
    };

    const handleDeleteGroupMapping = async (id) => {
        if (!window.confirm('Are you sure you want to delete this group mapping?')) return;
        try {
            await api.delete(`/api/whatsapp/group-mappings/${id}`);
            showNotification('success', 'Group mapping deleted');
            fetchGroupMappings();
        } catch (error) {
            showNotification('error', `Failed to delete: ${error.message}`);
        }
    };

    const handleToggleGroupMapping = async (id, field, value) => {
        try {
            await api.put(`/api/whatsapp/group-mappings/${id}`, { [field]: value });
            fetchGroupMappings();
        } catch (error) {
            showNotification('error', `Failed to update: ${error.message}`);
        }
    };

    const handleSendTestMessage = async (groupJid, groupName) => {
        setSendingTest(true);
        try {
            await api.post('/api/whatsapp/send-test', {
                recipient_type: 'group',
                recipient_id: groupJid,
                message: `Test message from HMD System at ${new Date().toLocaleTimeString()}`
            });
            showNotification('success', `Test message sent to ${groupName}!`);
        } catch (error) {
            showNotification('error', `Failed to send test: ${error.message}`);
        } finally {
            setSendingTest(false);
        }
    };

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/config/trip-times');
            const sortedProducers = (data.producers || []).sort((a, b) => a.user_id.localeCompare(b.user_id, undefined, { numeric: true, sensitivity: 'base' }));
            const sortedConsumers = (data.consumers || []).sort((a, b) => a.user_id.localeCompare(b.user_id, undefined, { numeric: true, sensitivity: 'base' }));

            setProducers(sortedProducers);
            setConsumers(sortedConsumers);
            const initialMatrix = {};
            if (data.configs) {
                data.configs.forEach(config => {
                    initialMatrix[`${config.source}_${config.destination}`] = config.time;
                });
            }
            setMatrix(initialMatrix);
        } catch (error) {
            showNotification('error', `Failed to load configuration: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (sourceId, destId, value) => {
        const val = value === '' ? '' : parseInt(value);
        setMatrix(prev => ({
            ...prev,
            [`${sourceId}_${destId}`]: isNaN(val) ? 0 : val
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        const payload = [];
        producers.forEach(p => {
            consumers.forEach(c => {
                payload.push({ source: p.user_id, destination: c.user_id, time: matrix[`${p.user_id}_${c.user_id}`] || 0 });
            });
        });
        try {
            await api.post('/api/config/trip-times/bulk', payload);
            showNotification('success', 'Logistics rules synchronized successfully!');
        } catch (error) {
            showNotification('error', `Synchronization failed: ${error.message}`);
        }
        finally { setSaving(false); }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '24px' }}>
                <div style={{ position: 'relative' }}>
                    <RefreshCw className="animate-spin" style={{ color: 'hsl(var(--accent))' }} size={48} />
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '12px', height: '12px', background: 'hsl(var(--accent))', borderRadius: '50%' }}></div>
                </div>
                <p style={{ color: 'hsl(var(--text-muted))', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.2em' }}>INITIALIZING DATA HUB</p>
            </div>
        );
    }

    return (
        <div className="premium-page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '24px 40px', gap: '20px', maxWidth: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', flexShrink: 0 }}>
                <button onClick={fetchConfig} className="premium-btn secondary" style={{ padding: '8px 16px' }}>
                    <RefreshCw size={18} />
                    <span>Refresh Node</span>
                </button>
                <button onClick={handleSave} disabled={saving} className="premium-btn primary" style={{ padding: '8px 16px' }}>
                    {saving ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                    <span>{saving ? 'Synchronizing...' : 'Commit Changes'}</span>
                </button>
            </div>
            <div className="premium-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: '20px' }}>
                <div className="premium-card-header">
                    <div>
                        <h3 style={{ margin: 0 }}>Travel Time Matrix</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>UNIT-TO-UNIT PERFORMANCE METRICS</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '10px', height: '10px', background: 'hsl(var(--accent))', borderRadius: '3px' }}></div>
                            PRODUCER (ROW)
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '10px', height: '10px', background: 'hsl(var(--primary))', borderRadius: '3px' }}></div>
                            CONSUMER (COL)
                        </div>
                    </div>
                </div>

                <div className="premium-card-body" style={{ flex: 1, overflow: 'auto', padding: '0px' }}>
                    <div className="matrix-container" style={{ border: 'none', borderRadius: '0' }}>
                        <table className="matrix-table">
                            <thead>
                                <tr>
                                    <th style={{ background: 'hsl(var(--primary))', color: 'white', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                            <ArrowRightLeft size={16} style={{ opacity: 0.6 }} />
                                            <span style={{ fontSize: '0.6rem', fontWeight: 900 }}>MASTER GRID</span>
                                        </div>
                                    </th>
                                    {consumers.map((c, idx) => (
                                        <th key={c.user_id} className={hoveredCol === idx ? 'matrix-cell-active' : ''} style={{ textAlign: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'inherit' }}>{c.user_id}</div>
                                            <div style={{ fontSize: '0.55rem', opacity: 0.6 }}>CONSUMER</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {producers.map((p, rowIdx) => (
                                    <tr key={p.user_id}>
                                        <td className={`matrix-producer-header ${hoveredRow === rowIdx ? 'active' : ''}`} style={{ padding: '16px 20px', position: 'sticky', left: 0, zIndex: 5, background: 'hsl(var(--card-bg))' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <Factory size={14} style={{ opacity: 0.7 }} />
                                                <span style={{ fontWeight: 800 }}>{p.user_id}</span>
                                            </div>
                                        </td>
                                        {consumers.map((c, colIdx) => (
                                            <td key={`${p.user_id}_${c.user_id}`} className={hoveredRow === rowIdx || hoveredCol === colIdx ? 'matrix-cell-active' : ''} onMouseEnter={() => { setHoveredRow(rowIdx); setHoveredCol(colIdx); }} onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); }} style={{ padding: '4px', verticalAlign: 'middle' }}>
                                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <input type="number" className="premium-input" value={matrix[`${p.user_id}_${c.user_id}`] ?? 0} onChange={(e) => handleInputChange(p.user_id, c.user_id, e.target.value)} style={{ width: '100%', height: '48px', padding: '0 4px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 900, background: 'transparent', border: 'none', color: 'inherit', boxShadow: 'none' }} />
                                                    <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.4 }}>MIN</span>
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div className="premium-card" style={{ marginBottom: '20px' }}>
                <div className="premium-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="premium-icon-box" style={{ background: 'hsl(142, 76%, 36% / 0.1)', color: '#25D366' }}>
                            <MessageCircle size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0 }}>WhatsApp Notifications</h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>CONFIGURE WHATSAPP MESSAGING</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                            <div style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: whatsappStatus.connected ? '#25D366' : 'hsl(var(--danger))',
                                boxShadow: whatsappStatus.connected ? '0 0 8px #25D366' : 'none'
                            }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: whatsappStatus.connected ? '#25D366' : 'hsl(var(--text-muted))' }}>
                                {whatsappStatus.connected ? `Connected ${whatsappStatus.phoneNumber ? `(+${whatsappStatus.phoneNumber})` : ''}` : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {whatsappStatus.connected ? (
                            <button onClick={handleWhatsAppLogout} className="premium-btn secondary" style={{ padding: '8px 16px' }}>
                                <X size={18} />
                                <span>Disconnect</span>
                            </button>
                        ) : (
                            <button onClick={handleGetQRCode} className="premium-btn secondary" style={{ padding: '8px 16px' }}>
                                <QrCode size={18} />
                                <span>Scan QR Code</span>
                            </button>
                        )}
                        <button onClick={handleSaveWhatsAppConfig} disabled={whatsappConfigSaving || whatsappConfigLoading} className="premium-btn primary" style={{ padding: '8px 16px' }}>
                            {whatsappConfigSaving ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                            <span>{whatsappConfigSaving ? 'Saving...' : 'Save Settings'}</span>
                        </button>
                    </div>
                </div>
                <div className="premium-card-body" style={{ padding: '24px' }}>
                    {whatsappConfigLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>
                            <RefreshCw className="animate-spin" size={24} style={{ marginRight: '12px' }} />
                            Loading WhatsApp settings...
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '20px',
                                    background: 'hsl(var(--main-bg))',
                                    borderRadius: '12px',
                                    border: '1px solid hsl(var(--border-color))'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <MessageCircle size={20} color="white" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Enable WhatsApp</div>
                                            <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>Turn on WhatsApp notifications system-wide</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleWhatsAppConfigToggle('WHATSAPP_ENABLED', whatsappConfig.WHATSAPP_ENABLED === 'true' ? 'false' : 'true')}
                                        style={{
                                            width: '52px',
                                            height: '28px',
                                            borderRadius: '14px',
                                            border: 'none',
                                            background: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '#25D366' : 'hsl(var(--border-color))',
                                            position: 'relative',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', left: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '26px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                                    </button>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '20px',
                                    background: 'hsl(var(--main-bg))',
                                    borderRadius: '12px',
                                    border: '1px solid hsl(var(--border-color))'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'hsl(var(--accent) / 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Clock size={20} color="hsl(var(--accent))" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Daily Report Time</div>
                                            <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>When to send daily summary reports</div>
                                        </div>
                                    </div>
                                    <input
                                        type="time"
                                        value={whatsappConfig.WHATSAPP_DAILY_REPORT_TIME || '18:00'}
                                        onChange={(e) => handleWhatsAppConfigToggle('WHATSAPP_DAILY_REPORT_TIME', e.target.value)}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid hsl(var(--border-color))',
                                            background: 'hsl(var(--card-bg))',
                                            fontSize: '0.9rem',
                                            fontWeight: 600
                                        }}
                                    />
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '20px',
                                    background: 'hsl(var(--main-bg))',
                                    borderRadius: '12px',
                                    border: '1px solid hsl(var(--border-color))'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'hsl(var(--warning) / 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Globe size={20} color="hsl(var(--warning))" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Default Language</div>
                                            <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>Default language for messages</div>
                                        </div>
                                    </div>
                                    <select
                                        value={whatsappConfig.WHATSAPP_DEFAULT_LANGUAGE || 'en'}
                                        onChange={(e) => handleWhatsAppConfigToggle('WHATSAPP_DEFAULT_LANGUAGE', e.target.value)}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid hsl(var(--border-color))',
                                            background: 'hsl(var(--card-bg))',
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            minWidth: '120px'
                                        }}
                                    >
                                        {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                                            <option key={code} value={code}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginTop: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Users size={18} />
                                        Group Mappings
                                    </h4>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {whatsappStatus.connected && (
                                            <button onClick={fetchAvailableGroups} className="premium-btn secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                                                <RefreshCw size={16} />
                                                <span>Refresh Groups</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setShowAddGroupModal(true); if (whatsappStatus.connected) fetchAvailableGroups(); }}
                                            className="premium-btn primary"
                                            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                        >
                                            <Plus size={16} />
                                            <span>Add Mapping</span>
                                        </button>
                                    </div>
                                </div>

                                {groupMappings.length === 0 ? (
                                    <div style={{
                                        padding: '40px',
                                        textAlign: 'center',
                                        background: 'hsl(var(--main-bg))',
                                        borderRadius: '12px',
                                        border: '1px dashed hsl(var(--border-color))',
                                        color: 'hsl(var(--text-muted))'
                                    }}>
                                        <MessageCircle size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                                        <p style={{ margin: 0 }}>No group mappings configured yet.</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>Add a mapping to link WhatsApp groups with producers/consumers.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {groupMappings.map(mapping => (
                                            <div
                                                key={mapping.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '16px 20px',
                                                    background: 'hsl(var(--main-bg))',
                                                    borderRadius: '12px',
                                                    border: '1px solid hsl(var(--border-color))',
                                                    opacity: mapping.is_active ? 1 : 0.6
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                    <div style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        borderRadius: '10px',
                                                        background: mapping.mapping_type === 'producer' ? 'hsl(var(--warning) / 0.1)' :
                                                                   mapping.mapping_type === 'consumer' ? 'hsl(var(--accent) / 0.1)' :
                                                                   'hsl(var(--danger) / 0.1)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        {mapping.mapping_type === 'producer' ? <Factory size={18} color="hsl(var(--warning))" /> :
                                                         mapping.mapping_type === 'consumer' ? <Navigation size={18} color="hsl(var(--accent))" /> :
                                                         <Shield size={18} color="hsl(var(--danger))" />}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{mapping.group_name}</div>
                                                        <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <span style={{
                                                                padding: '2px 8px',
                                                                background: mapping.mapping_type === 'producer' ? 'hsl(var(--warning) / 0.15)' :
                                                                           mapping.mapping_type === 'consumer' ? 'hsl(var(--accent) / 0.15)' :
                                                                           'hsl(var(--danger) / 0.15)',
                                                                borderRadius: '4px',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 700,
                                                                textTransform: 'uppercase'
                                                            }}>
                                                                {mapping.mapping_type}
                                                            </span>
                                                            {mapping.node_id && <span>• {mapping.node_id}</span>}
                                                            <span>• {SUPPORTED_LANGUAGES[mapping.language_code] || mapping.language_code}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <button
                                                        onClick={() => handleToggleGroupMapping(mapping.id, 'is_active', !mapping.is_active)}
                                                        style={{
                                                            width: '40px',
                                                            height: '24px',
                                                            borderRadius: '12px',
                                                            border: 'none',
                                                            background: mapping.is_active ? '#25D366' : 'hsl(var(--border-color))',
                                                            position: 'relative',
                                                            cursor: 'pointer',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        title={mapping.is_active ? 'Enabled' : 'Disabled'}
                                                    >
                                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', left: mapping.is_active ? '18px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                                                    </button>
                                                    <button onClick={() => handleSendTestMessage(mapping.group_jid, mapping.group_name)} disabled={sendingTest || !whatsappStatus.connected} className="premium-btn secondary" style={{ padding: '6px 10px' }} title="Send test message">
                                                        <Send size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteGroupMapping(mapping.id)}
                                                        className="premium-btn"
                                                        style={{ padding: '6px 10px', background: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))' }}
                                                        title="Delete mapping"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
            {showQrModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{
                        background: 'hsl(var(--card-bg))',
                        borderRadius: '16px',
                        padding: '32px',
                        maxWidth: '400px',
                        width: '90%',
                        textAlign: 'center'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MessageCircle size={20} color="#25D366" />
                                Scan QR Code
                            </h3>
                            <button onClick={() => { setShowQrModal(false); setQrCode(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        {qrLoading ? (
                            <div style={{ padding: '60px', color: 'hsl(var(--text-muted))' }}>
                                <RefreshCw className="animate-spin" size={32} style={{ marginBottom: '16px' }} />
                                <p>Generating QR Code...</p>
                            </div>
                        ) : qrCode ? (
                            <>
                                <img src={qrCode} alt="WhatsApp QR Code" style={{ width: '250px', height: '250px', borderRadius: '12px', border: '4px solid #25D366' }} />
                                <p style={{ marginTop: '16px', color: 'hsl(var(--text-muted))', fontSize: '0.9rem' }}>
                                    Open WhatsApp on your phone, go to Settings → Linked Devices → Link a Device
                                </p>
                                <button onClick={handleGetQRCode} className="premium-btn secondary" style={{ marginTop: '16px' }}>
                                    <RefreshCw size={16} />
                                    <span>Refresh QR</span>
                                </button>
                            </>
                        ) : (
                            <div style={{ padding: '40px', color: 'hsl(var(--text-muted))' }}>
                                <AlertCircle size={32} style={{ marginBottom: '16px' }} />
                                <p>QR code not available. The service may be initializing.</p>
                                <button onClick={handleGetQRCode} className="premium-btn primary" style={{ marginTop: '16px' }}>
                                    <RefreshCw size={16} />
                                    <span>Try Again</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {showAddGroupModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{
                        background: 'hsl(var(--card-bg))',
                        borderRadius: '16px',
                        padding: '32px',
                        maxWidth: '500px',
                        width: '90%'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0 }}>Add Group Mapping</h3>
                            <button onClick={() => setShowAddGroupModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>WhatsApp Group</label>
                                {availableGroups.length > 0 ? (
                                    <select
                                        value={newGroupMapping.group_jid}
                                        onChange={(e) => {
                                            const group = availableGroups.find(g => g.jid === e.target.value);
                                            setNewGroupMapping(prev => ({
                                                ...prev,
                                                group_jid: e.target.value,
                                                group_name: group?.name || ''
                                            }));
                                        }}
                                        className="premium-input"
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Select a group...</option>
                                        {availableGroups.map(group => (
                                            <option key={group.jid} value={group.jid}>{group.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input type="text" value={newGroupMapping.group_jid} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, group_jid: e.target.value }))} placeholder="Enter Group JID (e.g., 120363xxx@g.us)" className="premium-input" style={{ width: '100%' }} />
                                )}
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>Group Name</label>
                                <input type="text" value={newGroupMapping.group_name} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, group_name: e.target.value }))} placeholder="Display name for this group" className="premium-input" style={{ width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>Mapping Type</label>
                                <select value={newGroupMapping.mapping_type} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, mapping_type: e.target.value }))} className="premium-input" style={{ width: '100%' }}>
                                    <option value="producer">Producer</option>
                                    <option value="consumer">Consumer</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            {newGroupMapping.mapping_type !== 'admin' && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                                        {newGroupMapping.mapping_type === 'producer' ? 'Producer ID' : 'Consumer ID'}
                                    </label>
                                    <select value={newGroupMapping.node_id} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, node_id: e.target.value }))} className="premium-input" style={{ width: '100%' }}>
                                        <option value="">Select {newGroupMapping.mapping_type}...</option>
                                        {(newGroupMapping.mapping_type === 'producer' ? producers : consumers).map(item => (
                                            <option key={item.user_id} value={item.user_id}>{item.user_id}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>Language</label>
                                <select value={newGroupMapping.language_code} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, language_code: e.target.value }))} className="premium-input" style={{ width: '100%' }}>
                                    {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                                        <option key={code} value={code}>{name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button onClick={() => setShowAddGroupModal(false)} className="premium-btn secondary" style={{ flex: 1 }}>
                                    Cancel
                                </button>
                                <button onClick={handleAddGroupMapping} disabled={!newGroupMapping.group_jid || !newGroupMapping.group_name} className="premium-btn primary" style={{ flex: 1 }}>
                                    <Check size={18} />
                                    <span>Add Mapping</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Configuration;
