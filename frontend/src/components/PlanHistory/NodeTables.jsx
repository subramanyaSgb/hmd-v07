import { Factory, Users, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

const NodeTables = ({ producers, consumers }) => {
    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'operating':
                return <CheckCircle size={14} className="status-icon operating" />;
            case 'maintenance':
                return <AlertCircle size={14} className="status-icon maintenance" />;
            case 'shutdown':
                return <XCircle size={14} className="status-icon shutdown" />;
            default:
                return <CheckCircle size={14} className="status-icon operating" />;
        }
    };

    const calculateFulfillment = (planned, actual) => {
        if (!planned || planned === 0) return 0;
        return Math.round((actual / planned) * 100);
    };

    const getFulfillmentClass = (rate) => {
        if (rate >= 90) return 'high';
        if (rate >= 70) return 'medium';
        return 'low';
    };

    const renderTable = (data, type) => {
        const Icon = type === 'producer' ? Factory : Users;
        const title = type === 'producer' ? 'Producers' : 'Consumers';
        const actualLabel = type === 'producer' ? 'Delivered' : 'Received';

        return (
            <div className={`node-table-container ${type}`}>
                <div className="node-table-header">
                    <Icon size={16} />
                    <h5>{title}</h5>
                    <span className="node-count">{data.length}</span>
                </div>
                <table className="node-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th className="text-right">Planned</th>
                            <th className="text-right">{actualLabel}</th>
                            <th className="text-right">Rate</th>
                            <th className="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="empty-row">
                                    No {title.toLowerCase()} data
                                </td>
                            </tr>
                        ) : (
                            data.map((item, idx) => {
                                const fulfillment = calculateFulfillment(item.planned, item.actual);
                                return (
                                    <tr key={idx}>
                                        <td className="node-id">{item.user_id}</td>
                                        <td className="text-right">{item.planned.toLocaleString()} MT</td>
                                        <td className="text-right">{item.actual.toLocaleString()} MT</td>
                                        <td className="text-right">
                                            <span className={`fulfillment-badge ${getFulfillmentClass(fulfillment)}`}>
                                                {fulfillment}%
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            {getStatusIcon(item.status)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="node-tables-section">
            <h4 className="section-title">Node Performance</h4>
            <div className="node-tables-row">
                {renderTable(producers, 'producer')}
                {renderTable(consumers, 'consumer')}
            </div>
        </div>
    );
};

export default NodeTables;
