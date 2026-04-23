import { Users, Activity, Shield, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../utils/api'

const ActivitySummaryCards = () => {
    const [summary, setSummary] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const data = await api.get('/api/activity-logs/summary')
                setSummary(data)
            } catch (err) {
                console.error("Failed to fetch activity summary:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchSummary()

        const interval = setInterval(fetchSummary, 30000)
        return () => clearInterval(interval)
    }, [])

    if (loading || !summary) return (
        <div className="activity-stats-grid">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="activity-stat-card loading">
                    <div className="skeleton-shimmer"></div>
                </div>
            ))}
            <style>{`
                .activity-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 16px;
                }
                .activity-stat-card.loading {
                    height: 110px;
                    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                    border-radius: 16px;
                    border: 1px solid hsl(var(--border-subtle));
                    overflow: hidden;
                    position: relative;
                }
                .skeleton-shimmer {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.08), transparent);
                    animation: shimmer 1.5s infinite;
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @media (max-width: 1200px) {
                    .activity-stats-grid { grid-template-columns: repeat(2, 1fr); }
                }
                @media (max-width: 640px) {
                    .activity-stats-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    )

    const cards = [
        {
            title: "Events Today",
            value: summary.today_count,
            trend: summary.trend,
            icon: Zap,
            color: "#3b82f6",
            bgColor: "rgba(59, 130, 246, 0.08)"
        },
        {
            title: "Active Users",
            value: summary.active_users,
            icon: Users,
            color: "#10b981",
            bgColor: "rgba(16, 185, 129, 0.08)"
        },
        {
            title: "Critical Actions",
            value: summary.critical_actions,
            icon: Shield,
            color: summary.critical_actions > 0 ? "#ef4444" : "#10b981",
            bgColor: summary.critical_actions > 0 ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)"
        },
        {
            title: "System Health",
            value: `${summary.system_health ?? 100}%`,
            icon: Activity,
            color: "#8b5cf6",
            bgColor: "rgba(139, 92, 246, 0.08)"
        }
    ]

    return (
        <>
            <div className="activity-stats-grid">
                {cards.map((card, idx) => (
                    <div key={idx} className="activity-stat-card" style={{ '--accent-color': card.color, '--accent-bg': card.bgColor }}>
                        <div className="stat-icon-box">
                            <card.icon size={20} strokeWidth={2.5} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-label">{card.title}</span>
                            <div className="stat-value-row">
                                <span className="stat-value">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</span>
                                {card.trend !== undefined && (
                                    <span className={`stat-trend ${card.trend >= 0 ? 'up' : 'down'}`}>
                                        {card.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {Math.abs(card.trend).toFixed(1)}%
                                    </span>
                                )}
                            </div>
                            {card.trend !== undefined && (
                                <span className="stat-comparison">vs yesterday</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                .activity-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 16px;
                }

                .activity-stat-card {
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 16px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                }

                .activity-stat-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: var(--accent-color);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }

                .activity-stat-card:hover {
                    transform: translateY(-2px);
                    border-color: var(--accent-color);
                    box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.12),
                                0 4px 12px -4px var(--accent-bg);
                }

                .activity-stat-card:hover::before {
                    opacity: 1;
                }

                .stat-icon-box {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    background: var(--accent-bg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--accent-color);
                    flex-shrink: 0;
                    transition: all 0.3s ease;
                }

                .activity-stat-card:hover .stat-icon-box {
                    transform: scale(1.05);
                    box-shadow: 0 4px 12px -2px var(--accent-bg);
                }

                .stat-info {
                    flex: 1;
                    min-width: 0;
                }

                .stat-label {
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-secondary));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    display: block;
                    margin-bottom: 4px;
                }

                .stat-value-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .stat-value {
                    font-size: 1.75rem;
                    font-weight: 800;
                    color: hsl(var(--text-primary));
                    line-height: 1;
                    font-family: 'Space Grotesk', system-ui, sans-serif;
                }

                .stat-trend {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    padding: 3px 7px;
                    border-radius: 6px;
                }

                .stat-trend.up {
                    background: rgba(16, 185, 129, 0.1);
                    color: #059669;
                }

                .stat-trend.down {
                    background: rgba(239, 68, 68, 0.1);
                    color: #dc2626;
                }

                .stat-comparison {
                    font-size: 0.65rem;
                    color: hsl(var(--text-muted));
                    font-weight: 500;
                    margin-top: 2px;
                    display: block;
                }

                /* Dark mode support */
                :root[data-theme="dark"] .activity-stat-card {
                    background: hsl(var(--bg-secondary));
                    border-color: hsl(var(--border-subtle));
                }

                :root[data-theme="dark"] .stat-value {
                    color: hsl(var(--text-primary));
                }

                :root[data-theme="dark"] .stat-label {
                    color: hsl(var(--text-secondary));
                }

                @media (max-width: 1200px) {
                    .activity-stats-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 640px) {
                    .activity-stats-grid {
                        grid-template-columns: 1fr;
                    }
                    .stat-value {
                        font-size: 1.5rem;
                    }
                }
            `}</style>
        </>
    )
}

export default ActivitySummaryCards
