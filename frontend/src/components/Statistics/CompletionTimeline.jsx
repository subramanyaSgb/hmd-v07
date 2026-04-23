import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const CompletionTimeline = ({ data }) => {
    if (!data || data.length === 0) {
        return (
            <div className="completion-timeline-section">
                <h3>My Trip Completion Timeline (Today)</h3>
                <div className="no-data">
                    <p>No timeline data available</p>
                </div>
            </div>
        );
    }

    const formatHour = (hour) => {
        if (hour === 0) return '12 AM';
        if (hour < 12) return `${hour} AM`;
        if (hour === 12) return '12 PM';
        return `${hour - 12} PM`;
    };

    const formattedData = data.map(item => ({
        ...item,
        hourLabel: formatHour(item.hour)
    }));

    return (
        <div className="completion-timeline-section">
            <h3>Trip Completion Timeline</h3>
            <div className="timeline-chart-container">
<ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedData} margin={{ top: 5, right: 15, left: 0, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" tickFormatter={formatHour} ticks={[0, 6, 12, 18]} tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="custom-tooltip">
                                            <p><strong>{formatHour(data.hour)}</strong></p>
                                            <p>{data.trips_completed} trips completed</p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Line type="monotone" dataKey="trips_completed" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default CompletionTimeline;
