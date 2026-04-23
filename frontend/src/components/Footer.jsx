import { useState, useEffect } from 'react'
import { BASE_URL } from '../utils/api'

const Footer = () => {
    const [isOperational, setIsOperational] = useState(true)
    const version = 'v5.0'

    useEffect(() => {
        const checkHealth = async () => {
            try {
                
                const response = await fetch(`${BASE_URL}/api/health?t=${Date.now()}`)
                if (response.ok) {
                    setIsOperational(true)
                } else {
                    setIsOperational(false)
                }
            } catch (error) {
                console.error('Health check failed:', error)
                setIsOperational(false)
            }
        }

        checkHealth()

        const interval = setInterval(checkHealth, 10000)
        return () => clearInterval(interval)
    }, [])

    return (
        <footer style={{
            position: 'relative',
            height: 'var(--header-height, 80px)',
            padding: '0 40px',
            borderTop: '1px solid hsl(var(--border-color))',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 100,
            marginTop: 'auto',
            transition: 'background 300ms cubic-bezier(0.4, 0, 0.2, 1), border-color 300ms cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
            <div>
                <p className="space-grotesk" style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    color: 'hsl(var(--text-main))',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase'
                }}>
                    Hot Metal Distribution
                </p>
            </div>
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className={`premium-badge ${isOperational ? 'status-success' : 'status-danger'}`} style={{ padding: '6px 16px', borderRadius: '12px' }} role="status" aria-label={`System ${isOperational ? 'Active' : 'Offline'}`}>
                    <div className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 10px currentColor' }} />
                    SYSTEM {isOperational ? 'ACTIVE' : 'OFFLINE'}
                </div>

                <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 900,
                    color: 'hsl(var(--text-muted))',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '6px 12px',
                    background: 'hsl(var(--main-bg))',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--border-color))'
                }}>
                    {version}
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'right' }}>
                <p className="space-grotesk" style={{
                    margin: 0,
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    color: 'hsl(var(--text-main))',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    opacity: 0.8
                }}>
                    &copy; {new Date().getFullYear()} Deevia Software India Pvt Ltd
                </p>
                <p style={{
                    margin: 0,
                    fontSize: '0.6rem',
                    color: 'hsl(var(--text-muted))',
                    fontWeight: 500
                }}>
                    Advanced Logistics Control & Operational Intelligence System
                </p>
            </div>
        </footer>
    )
}

export default Footer
