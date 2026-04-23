import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { Truck, Clock, AlertTriangle, ChevronRight, RefreshCw, Timer, ChevronDown, ChevronUp } from 'lucide-react'

const INITIAL_DISPLAY_COUNT = 2;

const CountdownTimer = ({ eta_minutes, is_delayed, delay_minutes }) => {
    const [displayTime, setDisplayTime] = useState('');

    useEffect(() => {
        const updateDisplay = () => {
            if (eta_minutes === null || eta_minutes === undefined) {
                setDisplayTime('--:--');
                return;
            }

            if (eta_minutes <= 0) {
                setDisplayTime('Arriving...');
                return;
            }

            const totalSeconds = Math.max(0, Math.floor(eta_minutes * 60));
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            setDisplayTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        };

        updateDisplay();
        const interval = setInterval(updateDisplay, 1000);
        return () => clearInterval(interval);
    }, [eta_minutes]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: '"Space Grotesk", monospace', color: is_delayed ? '#ef4444' : eta_minutes && eta_minutes < 5 ? '#f59e0b' : '#22c55e', lineHeight: 1 }}>
                {displayTime}
            </span>
            {is_delayed && delay_minutes && (
                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <AlertTriangle size={8} />
                    +{Math.round(delay_minutes)}m delay
                </span>
            )}
        </div>
    );
};

const IncomingTorpedoes = ({ consumerId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const fetchIncoming = useCallback(async () => {
        if (!consumerId) return;
        try {
            const result = await api.get(`/api/live-ops/incoming/${consumerId}`);
            setData(result);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch incoming torpedoes:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [consumerId]);

    useEffect(() => {
        fetchIncoming();
        const interval = setInterval(fetchIncoming, 10000); 
        return () => clearInterval(interval);
    }, [fetchIncoming]);

    const formatTime = (dateStr) => {
        if (!dateStr) return '--:--';
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return (
            <div className="premium-card" style={{ borderRadius: '16px' }}>
                <div className="premium-card-body" style={{ padding: '16px', textAlign: 'center' }}>
                    <RefreshCw size={18} className="animate-spin" style={{ color: 'hsl(var(--text-muted))' }} />
                    <p style={{ margin: '8px 0 0', color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>Loading...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="premium-card" style={{ borderRadius: '16px' }}>
                <div className="premium-card-body" style={{ padding: '16px', textAlign: 'center' }}>
                    <AlertTriangle size={18} style={{ color: 'hsl(var(--warning))' }} />
                    <p style={{ margin: '8px 0 0', color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>{error}</p>
                </div>
            </div>
        );
    }

    const incomingTorpedoes = data?.incoming_torpedoes || [];
    const hasIncoming = incomingTorpedoes.length > 0;

    return (
        <div className="premium-card" style={{ borderRadius: '16px' }}>
            <div className="premium-card-header" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: hasIncoming ? 'hsl(var(--accent) / 0.1)' : 'hsl(var(--main-bg))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: hasIncoming ? 'hsl(var(--accent))' : 'hsl(var(--text-muted))'
                    }}>
                        <Truck size={16} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Incoming Torpedoes</h3>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase' }}>
                            {hasIncoming ? `${incomingTorpedoes.length} in transit` : 'No torpedoes approaching'}
                        </span>
                    </div>
                </div>
                {hasIncoming && data?.next_arrival_minutes && (
                    <div style={{
                        padding: '4px 10px',
                        background: 'hsl(var(--accent) / 0.1)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <Timer size={12} style={{ color: 'hsl(var(--accent))' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--accent))' }}>
                            Next: {Math.round(data.next_arrival_minutes)}m
                        </span>
                    </div>
                )}
            </div>
            <div className="premium-card-body" style={{ padding: '0 16px 12px' }}>
                {!hasIncoming ? (
                    <div style={{
                        padding: '16px',
                        textAlign: 'center',
                        background: 'hsl(var(--main-bg))',
                        borderRadius: '8px'
                    }}>
                        <Truck size={24} style={{ color: 'hsl(var(--text-muted))', opacity: 0.3 }} />
                        <p style={{ margin: '8px 0 0', color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>
                            No torpedoes currently heading to your location
                        </p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: isExpanded ? 'none' : '90px', overflowY: isExpanded ? 'visible' : 'auto' }}>
                            {(isExpanded ? incomingTorpedoes : incomingTorpedoes.slice(0, INITIAL_DISPLAY_COUNT)).map((torpedo) => (
                                <div
                                    key={torpedo.trip_id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '8px 10px',
                                        background: torpedo.is_delayed ? 'rgba(239, 68, 68, 0.05)' : 'hsl(var(--main-bg))',
                                        borderRadius: '8px',
                                        border: torpedo.is_delayed ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid hsl(var(--border-color))',
                                    }}
                                >
                                    <span style={{
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        color: 'hsl(var(--primary))',
                                        fontFamily: '"Space Grotesk", monospace',
                                        minWidth: '55px'
                                    }}>
                                        {torpedo.torpedo_id || 'Unknown'}
                                    </span>
                                    <span style={{
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: torpedo.current_status === 5 ? 'hsl(var(--accent) / 0.1)' : 'hsl(var(--success) / 0.1)',
                                        color: torpedo.current_status === 5 ? 'hsl(var(--accent))' : 'hsl(var(--success))',
                                        fontSize: '0.5rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {torpedo.status_label || (torpedo.current_status === 5 ? 'In Transit' : 'Arrived')}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>{torpedo.producer_id}</span>
                                        <ChevronRight size={10} style={{ color: 'hsl(var(--text-muted))' }} />
                                        <Clock size={9} style={{ color: 'hsl(var(--text-muted))' }} />
                                        <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))' }}>{formatTime(torpedo.departed_at)}</span>
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        background: torpedo.is_delayed ? 'rgba(239, 68, 68, 0.1)' : 'hsl(var(--card-bg))',
                                        borderRadius: '6px',
                                        border: '1px solid ' + (torpedo.is_delayed ? 'rgba(239, 68, 68, 0.2)' : 'hsl(var(--border-color))')
                                    }}>
                                        {torpedo.current_status === 6 ? (
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#22c55e' }}>ARRIVED</span>
                                        ) : torpedo.eta_minutes <= 0 ? (
                                            <>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: torpedo.is_delayed ? '#ef4444' : '#22c55e' }}>
                                                    Arriving Now
                                                </span>
                                                {torpedo.is_delayed && torpedo.delay_minutes && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ef4444' }}>
                                                        ({Math.round(torpedo.delay_minutes)}m late)
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <span style={{ fontSize: '0.5rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase' }}>ETA</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: '"Space Grotesk", monospace', color: torpedo.is_delayed ? '#ef4444' : torpedo.eta_minutes < 5 ? '#f59e0b' : '#22c55e' }}>
                                                    {Math.floor(torpedo.eta_minutes)}m
                                                </span>
                                                {torpedo.is_delayed && torpedo.delay_minutes && (
                                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#ef4444' }}>
                                                        ({Math.round(torpedo.delay_minutes)}m late)
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {incomingTorpedoes.length > INITIAL_DISPLAY_COUNT && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                style={{
                                    width: '100%',
                                    marginTop: '8px',
                                    padding: '6px 12px',
                                    background: 'hsl(var(--main-bg))',
                                    border: '1px solid hsl(var(--border-color))',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    color: 'hsl(var(--primary))',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'hsl(var(--primary) / 0.05)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'hsl(var(--main-bg))';
                                }}
                            >
                                {isExpanded ? (
                                    <>
                                        <ChevronUp size={12} />
                                        Show Less
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown size={12} />
                                        +{incomingTorpedoes.length - INITIAL_DISPLAY_COUNT} More
                                    </>
                                )}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default IncomingTorpedoes;
