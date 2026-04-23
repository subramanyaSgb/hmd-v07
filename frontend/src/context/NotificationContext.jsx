import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const NotificationContext = createContext();

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

const getNotificationStyle = (type) => {
    const styles = {
        success: {
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            icon: CheckCircle2,
            title: 'Success',
        },
        error: {
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            icon: AlertCircle,
            title: 'Error',
        },
        warning: {
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            icon: AlertTriangle,
            title: 'Warning',
        },
        info: {
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            icon: Info,
            title: 'Info',
        },
    };
    return styles[type] || styles.info;
};

const NotificationPopup = ({ notification, onRemove }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const style = getNotificationStyle(notification.type);
    const Icon = style.icon;

    useEffect(() => {
        
        requestAnimationFrame(() => {
            setIsVisible(true);
        });

        const exitTimer = setTimeout(() => {
            setIsLeaving(true);
        }, 2700); 

        const removeTimer = setTimeout(() => {
            onRemove(notification.id);
        }, 3000);

        return () => {
            clearTimeout(exitTimer);
            clearTimeout(removeTimer);
        };
    }, [notification.id, onRemove]);

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
                        {notification.text}
                    </div>
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: '0', left: '16px', right: '16px', height: '3px', background: 'rgba(255, 255, 255, 0.3)', borderRadius: '0 0 16px 16px', overflow: 'hidden', }}>
                <div style={{ height: '100%', background: 'rgba(255, 255, 255, 0.8)', borderRadius: '3px', animation: 'notification-progress 3s linear forwards', }} />
            </div>
        </div>
    );
};

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);

    const showNotification = useCallback((type, text, options = {}) => {
        const id = Date.now() + Math.random();

        setNotifications([{ id, type, text }]);

        return id;
    }, []);

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const showError = useCallback((text, options = {}) => {
        return showNotification('error', text, options);
    }, [showNotification]);

    const showSuccess = useCallback((text, options = {}) => {
        return showNotification('success', text, options);
    }, [showNotification]);

    const showWarning = useCallback((text, options = {}) => {
        return showNotification('warning', text, options);
    }, [showNotification]);

    const showInfo = useCallback((text, options = {}) => {
        return showNotification('info', text, options);
    }, [showNotification]);

    return (
        <NotificationContext.Provider value={{ showNotification, showError, showSuccess, showWarning, showInfo, removeNotification }}>
            {children}
            {notifications.map(n => (
                <NotificationPopup key={n.id} notification={n} onRemove={removeNotification} />
            ))}
            <style>{`
                @keyframes notification-progress {
                    from {
                        width: 100%;
                    }
                    to {
                        width: 0%;
                    }
                }
            `}</style>
        </NotificationContext.Provider>
    );
};
