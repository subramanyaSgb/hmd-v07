import { useState, useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'
import { LayoutDashboard, Settings as SettingsIcon, ClipboardList, Truck, Activity, BarChart2, Container, FileText, Shield, Factory, History } from 'lucide-react'

const Sidebar = () => {
    const { user, logout } = useAuth()
    const location = useLocation()
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const adminMenuItems = [
        { path: '/statistics', label: 'Dashboard', icon: <BarChart2 size={20} /> },
        { path: '/planning/monthly', label: 'Strategic Planning', icon: <ClipboardList size={20} /> },
        { path: '/trips', label: 'Trip Management', icon: <Truck size={20} /> },
        { path: '/', label: 'Live Tracking', icon: <LayoutDashboard size={20} /> },
        { path: '/operations-live', label: 'Operations Live', icon: <Activity size={20} /> },
        { path: '/trip-history-live', label: 'Trip History (Live)', icon: <History size={20} /> },
        { path: '/plant', label: 'Plant Live', icon: <Factory size={20} /> },
        { path: '/fleet', label: 'Torpedo Management', icon: <Container size={20} /> },
        { path: '/reports', label: 'Reports', icon: <FileText size={20} /> },
        { path: '/audit', label: 'Audit Trail', icon: <Shield size={20} /> },
        { path: '/operations', label: 'Operations Control', icon: <Activity size={20} /> },
        { path: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> },
    ]

    const trsMenuItems = [
        { path: '/statistics', label: 'Dashboard', icon: <BarChart2 size={20} /> },
        { path: '/planning/monthly', label: 'Strategic Planning', icon: <ClipboardList size={20} /> },
        { path: '/trips', label: 'Trip Management', icon: <Truck size={20} /> },
        { path: '/', label: 'Live Tracking', icon: <LayoutDashboard size={20} /> },
        { path: '/operations-live', label: 'Operations Live', icon: <Activity size={20} /> },
        { path: '/trip-history-live', label: 'Trip History (Live)', icon: <History size={20} /> },
        { path: '/plant', label: 'Plant Live', icon: <Factory size={20} /> },
        { path: '/fleet', label: 'Torpedo Management', icon: <Container size={20} /> },
        { path: '/reports', label: 'Reports', icon: <FileText size={20} /> },
        { path: '/operations', label: 'Operations Control', icon: <Activity size={20} /> },
        { path: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> },
    ]

    const ppcMenuItems = [
        { path: '/statistics', label: 'Dashboard', icon: <BarChart2 size={20} /> },
        { path: '/', label: 'Live Tracking', icon: <LayoutDashboard size={20} /> },
        { path: '/operations-live', label: 'Operations Live', icon: <Activity size={20} /> },
        { path: '/trip-history-live', label: 'Trip History (Live)', icon: <History size={20} /> },
        { path: '/plant', label: 'Plant Live', icon: <Factory size={20} /> },
        { path: '/reports', label: 'Reports', icon: <FileText size={20} /> },
        { path: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> },
    ]

    const operatorMenuItems = [
        { path: '/statistics', label: 'Dashboard', icon: <BarChart2 size={20} /> },
        { path: '/trips', label: 'Trip Management', icon: <Truck size={20} /> },
        { path: '/', label: 'Live Tracking', icon: <LayoutDashboard size={20} /> },
        { path: '/operations-live', label: 'Operations Live', icon: <Activity size={20} /> },
        { path: '/trip-history-live', label: 'Trip History (Live)', icon: <History size={20} /> },
        { path: '/planning/daily', label: 'Daily Planning', icon: <ClipboardList size={20} /> },
        { path: '/operations', label: 'Operations Control', icon: <Activity size={20} /> },
        { path: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> },
    ]

    const menuItems = user?.role === 'admin' ? adminMenuItems
        : user?.role === 'trs' ? trsMenuItems
        : user?.role === 'ppc' ? ppcMenuItems
        : operatorMenuItems

    const isActive = (path) => location.pathname === path

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <img src={logo} alt="Deevia Logo" className="logo-img" />
            </div>

            <nav>
                <ul className="nav-links">
                    {menuItems.map((item) => (
                        <li key={item.path}>
                            <Link
                                to={item.path}
                                className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                                style={{
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    padding: '14px 20px',
                                    margin: '4px 12px',
                                    borderRadius: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                    background: isActive(item.path) ? 'hsl(var(--primary))' : 'transparent',
                                    color: isActive(item.path) ? 'white' : 'hsl(var(--text-muted))',
                                    fontWeight: isActive(item.path) ? 700 : 500,
                                    boxShadow: isActive(item.path) ? '0 10px 20px -5px hsl(var(--primary) / 0.3)' : 'none',
                                    textDecoration: 'none'
                                }}
                            >
                                <span className="icon-container" style={{
                                    color: isActive(item.path) ? 'hsl(var(--accent))' : 'inherit',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {item.icon}
                                </span>
                                <span className="space-grotesk" style={{ flex: 1, fontSize: '0.95rem', letterSpacing: '0.01em' }}>{item.label}</span>
                                {isActive(item.path) && (
                                    <div style={{
                                        position: 'absolute',
                                        left: '-12px',
                                        width: '4px',
                                        height: '24px',
                                        background: 'hsl(var(--accent))',
                                        borderRadius: '0 4px 4px 0',
                                        boxShadow: '0 0 10px hsl(var(--accent))'
                                    }} />
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-time-box">
                    <span className="sidebar-time">
                        {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="sidebar-date">
                        {currentTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                </div>
            </div>
        </aside>
    )
}

export default Sidebar
