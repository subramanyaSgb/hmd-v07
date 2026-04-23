import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        try {
            const savedUser = sessionStorage.getItem('hmd_user');
            if (savedUser) {
                const userData = JSON.parse(savedUser);
                
                if (userData.access_token) {
                    setUser(userData);
                    setToken(userData.access_token);
                } else {
                    sessionStorage.removeItem('hmd_user');
                }
            }
        } catch (e) {
            console.error('Error reading auth state:', e);
            sessionStorage.removeItem('hmd_user');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const handleLogout = () => {
            setUser(null);
            setToken(null);
            sessionStorage.removeItem('hmd_user');
        };

        window.addEventListener('auth:logout', handleLogout);
        return () => window.removeEventListener('auth:logout', handleLogout);
    }, []);

    const login = useCallback(async (username, password) => {
        try {
            const response = await api.post('/api/auth/login', { username, password });

            const userData = {
                access_token: response.access_token,
                token_type: response.token_type,
                username: response.username,
                role: response.role,
                user_id: response.user_id,
            };

            setUser(userData);
            setToken(response.access_token);
            sessionStorage.setItem('hmd_user', JSON.stringify(userData));

            sessionStorage.setItem('hmd_needs_redirect', 'true');

            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            if (user) {
                
                await api.post('/api/auth/logout', { username: user.username }).catch(() => {
                    
                });
            }
        } finally {
            setUser(null);
            setToken(null);
            sessionStorage.removeItem('hmd_user');
            sessionStorage.removeItem('hmd_needs_redirect'); 
        }
    }, [user]);

    const refreshToken = useCallback(async () => {
        try {
            const response = await api.post('/api/auth/refresh');
            if (response.access_token) {
                const updatedUser = {
                    ...user,
                    access_token: response.access_token,
                };
                setUser(updatedUser);
                setToken(response.access_token);
                sessionStorage.setItem('hmd_user', JSON.stringify(updatedUser));
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            
            await logout();
        }
        return false;
    }, [user, logout]);

    const updateUser = useCallback((updates) => {
        if (!user) return;

        const updatedUser = {
            ...user,
            ...updates
        };
        setUser(updatedUser);
        sessionStorage.setItem('hmd_user', JSON.stringify(updatedUser));
    }, [user]);

    const isAuthenticated = useCallback(() => {
        return !!user?.access_token;
    }, [user]);

    const hasRole = useCallback((role) => {
        if (!user) return false;
        if (Array.isArray(role)) {
            return role.includes(user.role);
        }
        return user.role === role;
    }, [user]);

    const isAdmin = useCallback(() => {
        return user?.role === 'admin' || user?.role === 'trs';
    }, [user]);

    const value = {
        user,
        token,
        isLoading,
        login,
        logout,
        refreshToken,
        updateUser,
        isAuthenticated,
        hasRole,
        isAdmin,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
