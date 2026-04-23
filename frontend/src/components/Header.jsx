import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, AlertCircle, CheckCircle2, Info, AlertTriangle, Bell, User, LogOut, ChevronDown, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useHeader } from '../context/HeaderContext'
import { api } from '../utils/api'
import { PAGE_ID_TO_PATH } from '../App'

const getNotificationStyle = (message) => {
    const lowerMessage = message?.toLowerCase() || '';

    if (lowerMessage.includes('trip assigned') || lowerMessage.includes('new trip')) {
        return {
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            icon: Truck,
            title: 'Trip Assigned',
        };
    }
    if (lowerMessage.includes('completed') || lowerMessage.includes('success')) {
        return {
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            icon: CheckCircle2,
            title: 'Success',
        };
    }
    if (lowerMessage.includes('error') || lowerMessage.includes('failed')) {
        return {
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            icon: AlertCircle,
            title: 'Error',
        };
    }
    if (lowerMessage.includes('warning') || lowerMessage.includes('delayed')) {
        return {
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            icon: AlertTriangle,
            title: 'Warning',
        };
    }
    return {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        icon: Info,
        title: 'Notification',
    };
};

const ToastNotification = ({ message, onDismiss }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const style = getNotificationStyle(message);
    const Icon = style.icon;

    useEffect(() => {
        requestAnimationFrame(() => {
            setIsVisible(true);
        });

        const exitTimer = setTimeout(() => {
            setIsLeaving(true);
        }, 2700);

        const removeTimer = setTimeout(() => {
            onDismiss();
        }, 3000);

        return () => {
            clearTimeout(exitTimer);
            clearTimeout(removeTimer);
        };
    }, [onDismiss]);

    return (
        <div style={{ position: 'fixed', top: '80px', left: '50%', transform: `translateX(-50%) translateY(${isVisible && !isLeaving ? '0' : '-20px'}) scale(${isVisible && !isLeaving ? 1 : 0.95})`, opacity: isVisible && !isLeaving ? 1 : 0, zIndex: 99999, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', pointerEvents: 'auto', }}>
            <div style={{ background: style.background, color: 'white', padding: '16px 32px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.4), 0 8px 20px -8px rgba(0, 0, 0, 0.3)', minWidth: '300px', maxWidth: '500px', backdropFilter: 'blur(10px)', }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.2)', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', }}>
                    <Icon size={24} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px', opacity: 0.9, }}>
                        {style.title}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.4, }}>
                        {message}
                    </div>
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: '0', left: '16px', right: '16px', height: '3px', background: 'rgba(255, 255, 255, 0.3)', borderRadius: '0 0 16px 16px', overflow: 'hidden', }}>
                <div style={{ height: '100%', background: 'rgba(255, 255, 255, 0.8)', borderRadius: '3px', animation: 'header-toast-progress 3s linear forwards', }} />
            </div>
            <style>{`
                @keyframes header-toast-progress {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `}</style>
        </div>
    );
};

const Header = ({ title }) => {
    const { user, logout } = useAuth()
    const { headerContent } = useHeader()
    const navigate = useNavigate()
    const [showDropdown, setShowDropdown] = useState(false)
    const [showNotifications, setShowNotifications] = useState(false)
    const [notifications, setNotifications] = useState([])
    const [toast, setToast] = useState(null)
    const notificationRef = useRef(null)
    const profileRef = useRef(null)

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (notificationRef.current && !notificationRef.current.contains(e.target)) {
                setShowNotifications(false)
            }
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchNotifications = async () => {
        if (!user?.user_id) return
        try {
            const data = await api.get(`/api/notifications/${user.user_id}`)

            setNotifications(prev => {
                const unread = data.filter(n => !n.is_read)
                const prevUnreadCount = prev.filter(n => !n.is_read).length

                if (unread.length > prevUnreadCount) {
                    const latest = unread[0]
                    setToast(latest.message)
                }
                return data
            })
        } catch (err) {
            console.error("Failed to fetch notifications:", err)
        }
    }

    useEffect(() => {
        fetchNotifications()
        const interval = setInterval(fetchNotifications, 10000) 
        return () => clearInterval(interval)
    }, [user])

    const markAsRead = async (id) => {
        const prev = notifications
        setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n))
        try {
            await api.put(`/api/notifications/${id}/read`, {})
        } catch (err) {
            setNotifications(prev)
            console.error("Failed to mark as read:", err)
        }
    }

    const markAllAsRead = async () => {
        if (!user?.user_id) return
        const unreadCount = notifications.filter(n => !n.is_read).length
        if (unreadCount === 0) return

        const prev = notifications
        setNotifications(notifications.map(n => ({ ...n, is_read: true })))
        try {
            await api.put(`/api/notifications/${user.user_id}/read-all`, {})
        } catch (err) {
            setNotifications(prev)
            console.error("Failed to mark all as read:", err)
        }
    }

    const unreadCount = notifications.filter(n => !n.is_read).length

    const isTitleLeft = headerContent.center || headerContent.forceLeftTitle;

    return (
        <header className="header" style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid hsl(var(--border-color))',
            height: '80px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 40px',
            position: 'sticky',
            top: 0,
            zIndex: 2000,
            transition: 'background 300ms cubic-bezier(0.4, 0, 0.2, 1), border-color 300ms cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
            <div className="header-left">
                {isTitleLeft && (
                    <span className="page-title space-grotesk" style={{
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: 'hsl(var(--text-main))',
                        textTransform: 'uppercase'
                    }}>{title}</span>
                )}
                {headerContent.left}
            </div>

            <div className="header-center">
                {!isTitleLeft && (
                    <span className="page-title space-grotesk" style={{
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: 'hsl(var(--text-main))',
                        textTransform: 'uppercase'
                    }}>{title}</span>
                )}
                {headerContent.center}
            </div>

            <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {headerContent.right}
                {toast && (
                    <ToastNotification message={toast} onDismiss={() => setToast(null)} />
                )}
                <div ref={notificationRef} style={{ position: 'relative' }}>
                    <div
                        onClick={() => setShowNotifications(!showNotifications)}
                        style={{
                            color: 'hsl(var(--text-muted))',
                            padding: '10px',
                            background: 'hsl(var(--card-bg))',
                            border: '1px solid hsl(var(--border-color))',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            position: 'relative',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                background: 'hsl(var(--danger))',
                                color: 'white',
                                fontSize: '0.6rem',
                                fontWeight: 900,
                                minWidth: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid hsl(var(--card-bg))'
                            }}>
                                {unreadCount}
                            </span>
                        )}
                    </div>

                    {showNotifications && (
                        <div style={{
                            position: 'absolute',
                            top: '120%',
                            right: 0,
                            background: 'hsl(var(--card-bg))',
                            borderRadius: '16px',
                            boxShadow: 'var(--shadow-xl)',
                            border: '1px solid hsl(var(--border-color))',
                            width: '320px',
                            zIndex: 2001,
                            maxHeight: '400px',
                            overflowY: 'auto',
                            animation: 'fadeInUp 0.2s ease-out'
                        }}>
                            <div style={{ padding: '16px', borderBottom: '1px solid hsl(var(--border-color))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'hsl(var(--text-main))' }}>Notifications</h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>{unreadCount} UNREAD</span>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                markAllAsRead()
                                            }}
                                            style={{
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                padding: '4px 10px',
                                                background: 'hsl(var(--primary))',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.target.style.background = 'hsl(var(--accent))'}
                                            onMouseLeave={(e) => e.target.style.background = 'hsl(var(--primary))'}
                                        >
                                            MARK ALL READ
                                        </button>
                                    )}
                                </div>
                            </div>
                            {notifications.length > 0 ? (
                                notifications.map(n => (
                                    <div
                                        key={n.id}
                                        onClick={() => {
                                            if (n.link) {
                                                
                                                const pageId = n.link.replace('/', '')
                                                const path = PAGE_ID_TO_PATH[pageId] || n.link
                                                navigate(path)
                                                setShowNotifications(false)
                                            }
                                            if (!n.is_read) {
                                                markAsRead(n.id)
                                            }
                                        }}
                                        style={{
                                            padding: '16px',
                                            borderBottom: '1px solid hsl(var(--border-color))',
                                            background: n.is_read ? 'transparent' : 'hsl(var(--primary) / 0.02)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            cursor: n.link ? 'pointer' : 'default',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (n.link) e.currentTarget.style.background = 'hsl(var(--primary) / 0.05)'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = n.is_read ? 'transparent' : 'hsl(var(--primary) / 0.02)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>{n.message}</span>
                                            {!n.is_read && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        markAsRead(n.id)
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: 'hsl(var(--success))', cursor: 'pointer', padding: 0 }}
                                                    title="Mark as read"
                                                >
                                                    <Check size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>{n.sender}</span>
                                            <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))' }}>
                                                {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-muted))', fontSize: '0.85rem', fontWeight: 600 }}>
                                    NO NOTIFICATIONS
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div ref={profileRef} className="profile-widget"
                    onClick={() => setShowDropdown(!showDropdown)}
                    style={{
                        background: 'hsl(var(--card-bg))',
                        border: '1px solid hsl(var(--border-color))',
                        padding: '6px 16px',
                        borderRadius: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                    }}
                >
                    <div className="avatar" style={{
                        width: '32px',
                        height: '32px',
                        background: 'hsl(var(--primary))',
                        color: 'white',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <User size={18} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="space-grotesk" style={{ fontWeight: 800, fontSize: '0.9rem', color: 'hsl(var(--primary))' }}>{user?.username || 'Guest'}</span>
                        <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>{user?.role?.toUpperCase()}</span>
                    </div>
                    <ChevronDown size={14} style={{ opacity: 0.5 }} />

                    {showDropdown && (
                        <div style={{
                            position: 'absolute',
                            top: '120%',
                            right: 0,
                            background: 'hsl(var(--card-bg))',
                            borderRadius: '16px',
                            boxShadow: 'var(--shadow-xl)',
                            border: '1px solid hsl(var(--border-color))',
                            width: '180px',
                            zIndex: 2001,
                            overflow: 'hidden',
                            animation: 'fadeInUp 0.2s ease-out'
                        }}>
                            <div style={{ padding: '16px', borderBottom: '1px solid hsl(var(--border-color))', background: 'hsl(var(--main-bg) / 0.3)' }}>
                                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>User Session</p>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); logout(); }}
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    background: 'none',
                                    border: 'none',
                                    color: 'hsl(var(--danger))',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 700,
                                    textAlign: 'left',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'hsl(var(--danger) / 0.05)'}
                                onMouseLeave={(e) => e.target.style.background = 'none'}
                            >
                                <LogOut size={16} />
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header >
    )
}

export default Header
