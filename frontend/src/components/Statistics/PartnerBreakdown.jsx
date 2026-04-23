import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const PartnerBreakdown = ({ data, partnerType }) => {
    if (!data || data.length === 0) {
        return (
            <div className="partner-breakdown-section">
                <h3>My Deliveries by {partnerType}</h3>
                <div className="no-data">
                    <p>No partner data available</p>
                </div>
            </div>
        );
    }

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

    return (
        <div className="partner-breakdown-section">
            <h3>{partnerType === 'Consumer' ? 'Deliveries' : 'Receipts'} by {partnerType}</h3>
            <div className="partner-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 15, left: 60, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="partner_id" tick={{ fontSize: 10 }} />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="custom-tooltip">
                                            <p><strong>{data.partner_id}</strong></p>
                                            <p>Tonnage: {data.tonnage} MT</p>
                                            <p>Trips: {data.trips}</p>
                                            <p>Share: {data.percentage}%</p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Bar dataKey="tonnage" radius={[0, 4, 4, 0]}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default PartnerBreakdown;
