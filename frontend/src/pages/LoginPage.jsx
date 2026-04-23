import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, User as UserIcon, Lock } from 'lucide-react';
import loginBg from '../../assets/login_bg.jpg';
import logo from '../assets/logo.png';

const LoginPage = () => {
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await login(username, password);

            if (!result.success) {
                setError(result.message);
                setLoading(false);
            }
            
        } catch (err) {
            setError(err.message || 'Login failed');
            setLoading(false);
        }
    };

    return (
        <div className="login-container" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${loginBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', position: 'relative', overflow: 'hidden' }}>

            <div className="premium-card" style={{ width: '100%', maxWidth: '460px', padding: '20px 48px', zIndex: 1, position: 'relative', background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255, 255, 255, 0.4)', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.02)' }}>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <div className="premium-icon-box" style={{ width: '80px', height: '80px', margin: '0 auto 24px', background: '#000', padding: '12px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.2)' }}>
                        <img src={logo} alt="HMD Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <h1 className="space-grotesk" style={{ fontSize: '2rem', fontWeight: 900, color: 'hsl(var(--primary))', marginBottom: '12px', letterSpacing: '-0.03em' }}>
                        HMD
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'hsl(var(--success))', boxShadow: '0 0 8px hsl(var(--success))' }}></div>
                        <p style={{ margin: 0, color: 'hsl(var(--text-muted))', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Secure Access Protocol</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.75rem', fontWeight: 900, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Authorized Personnel
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--primary))', opacity: 0.6 }}>
                                <UserIcon size={18} />
                            </div>
                            <input type="text" required className="premium-input" style={{ width: '100%', height: '60px', paddingLeft: '52px', fontSize: '1.1rem', }} placeholder="Username or Email" value={username} onChange={(e) => setUsername(e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.75rem', fontWeight: 900, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            System Passkey
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--primary))', opacity: 0.6 }}>
                                <Lock size={18} />
                            </div>
                            <input type="password" required className="premium-input" style={{ width: '100%', height: '60px', paddingLeft: '52px', fontSize: '1.1rem', }} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                        </div>
                    </div>

                    {error && (
                        <div style={{
                            padding: '16px',
                            background: 'hsl(var(--danger) / 0.05)',
                            border: '1px solid hsl(var(--danger) / 0.1)',
                            borderRadius: '14px',
                            color: 'hsl(var(--danger))',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            animation: 'fadeIn 0.2s ease'
                        }}>
                            AUTHENTICATION FAILURE: {error.toUpperCase()}
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="premium-btn primary" style={{ width: '100%', height: '64px', fontSize: '1.1rem', marginTop: '12px', }}>
                        {loading ? 'Validating...' : (
                            <>
                                <span>Initialize Session</span>
                                <LogIn size={20} />
                            </>
                        )}
                    </button>
                </form>

                <div style={{
                    marginTop: '40px',
                    paddingTop: '24px',
                    borderTop: '1px solid hsl(var(--border-color))',
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: 'hsl(var(--text-muted))',
                    letterSpacing: '0.05em'
                }}>
                    HOT METAL DISTRIBUTION SYSTEM
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: '24px', fontSize: '0.7rem', fontWeight: 900, color: 'hsl(var(--text-muted))', opacity: 0.5, letterSpacing: '0.2em' }}>
                HMD SYSTEM V3.1 
            </div>
        </div>
    );
};

export default LoginPage;
