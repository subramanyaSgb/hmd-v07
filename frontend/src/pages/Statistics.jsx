import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useHeader } from '../context/HeaderContext';
import { BarChart2, AlertTriangle } from 'lucide-react'
import ProducerStatistics from '../components/Statistics/ProducerStatistics'
import ConsumerStatistics from '../components/Statistics/ConsumerStatistics'
import AdminStatistics from '../components/Statistics/AdminStatistics'
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
