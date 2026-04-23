import { createContext, useContext, useState, useCallback } from 'react';

const HeaderContext = createContext();

export const HeaderProvider = ({ children }) => {
    const [headerContent, setHeaderContentRaw] = useState({
        left: null,
        center: null,
        right: null,
        forceLeftTitle: false
    });

    const setHeaderContent = useCallback((update) => {
        setHeaderContentRaw(prev => ({ ...prev, ...update }));
    }, []);

    return (
        <HeaderContext.Provider value={{ headerContent, setHeaderContent }}>
            {children}
        </HeaderContext.Provider>
    );
};

export const useHeader = () => {
    const context = useContext(HeaderContext);
    if (!context) {
        throw new Error('useHeader must be used within a HeaderProvider');
    }
    return context;
};
