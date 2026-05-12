import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useHeader } from '../context/HeaderContext';
import { BarChart2, AlertTriangle, Sparkles } from 'lucide-react'
import ProducerStatistics from '../components/Statistics/ProducerStatistics'
import ConsumerStatistics from '../components/Statistics/ConsumerStatistics'
import AdminStatistics from '../components/Statistics/AdminStatistics'
import Version2Dashboard from '../components/Statistics/Version2Dashboard'
import DeviationAnalytics from './DeviationAnalytics'

const Statistics = () => {
    const { user } = useAuth();
    const { setHeaderContent } = useHeader();
    const [activeTab, setActiveTab] = useState('performance');

    const isAdminLike = user && (user.role === 'admin' || user.role === 'trs' || user.role === 'ppc');

    useEffect(() => {
        if (!isAdminLike) return;

        setHeaderContent({
            center: (
                <div className="switcher-tabs">
                    {/* VERSION 2 lives to the LEFT of PERFORMANCE — order matters
                        per the design idea brief. Sparkles icon picked from
                        lucide-react to read as "new / preview". */}
                    <button className={`tab-btn ${activeTab === 'v2' ? 'active' : ''}`} onClick={() => setActiveTab('v2')}>
                        <Sparkles size={16} />
                        VERSION 2
                    </button>
                    <button className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
                        <BarChart2 size={16} />
                        PERFORMANCE
                    </button>
                    <button className={`tab-btn ${activeTab === 'deviation' ? 'active' : ''}`} onClick={() => setActiveTab('deviation')}>
                        <AlertTriangle size={16} />
                        DEVIATION
                    </button>
                </div>
            )
        });

        return () => setHeaderContent({ left: null, center: null, right: null, forceLeftTitle: false });
    }, [activeTab, isAdminLike, setHeaderContent]);

    if (!user) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <p>Please log in to view statistics</p>
            </div>
        );
    }

    const hasValidUserId = user.user_id && user.user_id !== 'null';

    if (isAdminLike) {
        if (activeTab === 'v2') {
            return <Version2Dashboard />;
        }
        if (activeTab === 'deviation') {
            return <DeviationAnalytics embedded />;
        }
        return <AdminStatistics />;
    } else if (user.role === 'producer' && hasValidUserId) {
        return <ProducerStatistics userId={user.user_id} />;
    } else if (user.role === 'consumer' && hasValidUserId) {
        return <ConsumerStatistics userId={user.user_id} />;
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p>Invalid role or user ID. Please contact support.</p>
        </div>
    );
};

export default Statistics;
