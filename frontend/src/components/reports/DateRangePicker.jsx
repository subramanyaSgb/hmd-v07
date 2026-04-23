import { useState } from 'react';
import { Calendar, X, ChevronRight, Check } from 'lucide-react'

const PRESETS = [
    { label: 'Today', days: 0, icon: '📅' },
    { label: 'Yesterday', days: 1, icon: '⏪' },
    { label: 'This Week', days: 7, icon: '📆' },
    { label: 'Last 7 Days', days: 7, icon: '7️⃣' },
    { label: 'This Month', days: 30, icon: '🗓️' },
    { label: 'Last 30 Days', days: 30, icon: '📊' },
    { label: 'This Quarter', days: 90, icon: '📈' },
    { label: 'Last 90 Days', days: 90, icon: '🔄' }
];

function DateRangePicker({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [customMode, setCustomMode] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState(null);

    const handlePreset = (preset, days) => {
        const today = new Date();
        const from = new Date();
        from.setDate(today.getDate() - days);

        setSelectedPreset(preset);
        onChange({
            date_from: from.toISOString().split('T')[0],
            date_to: today.toISOString().split('T')[0]
        });
        setIsOpen(false);
    };

    const handleCustomChange = (field, e) => {
        setSelectedPreset(null);
        onChange({
            ...value,
            [field]: e.target.value
        });
    };

    const clearDates = () => {
        setSelectedPreset(null);
        onChange({ date_from: '', date_to: '' });
        setIsOpen(false);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const hasDateRange = value.date_from && value.date_to;

    return (
        <div className="drp-container">
            <button onClick={() => setIsOpen(!isOpen)} className={`drp-trigger ${hasDateRange ? 'has-value' : ''}`}>
                <span className="drp-text">
                    {hasDateRange
                        ? `${formatDate(value.date_from)} → ${formatDate(value.date_to)}`
                        : 'Select dates'}
                </span>
                {hasDateRange && (
                    <X
                        size={12}
                        className="drp-clear"
                        onClick={(e) => {
                            e.stopPropagation();
                            clearDates();
                        }}
                    />
                )}
            </button>

            {isOpen && (
                <>
                    <div className="drp-backdrop" onClick={() => { setIsOpen(false); setCustomMode(false); }} />
                    <div className="drp-dropdown">
                        <div className="drp-dropdown-inner">
                            {!customMode ? (
                                <>
                                    <div className="drp-section">
                                        <div className="drp-section-title">Quick Select</div>
                                        <div className="drp-presets">
                                            {PRESETS.map((preset) => (
                                                <button key={preset.label} onClick={() => handlePreset(preset.label, preset.days)} className={`drp-preset-btn ${selectedPreset === preset.label ? 'active' : ''}`}>
                                                    <span className="drp-preset-label">{preset.label}</span>
                                                    {selectedPreset === preset.label && (
                                                        <Check size={12} className="drp-check" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="drp-divider" />
                                    <button onClick={() => setCustomMode(true)} className="drp-custom-trigger">
                                        <Calendar size={14} />
                                        <span>Custom Range</span>
                                        <ChevronRight size={14} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="drp-section">
                                        <div className="drp-section-title">Custom Range</div>
                                        <div className="drp-custom-inputs">
                                            <div className="drp-input-group">
                                                <label>From</label>
                                                <input type="date" value={value.date_from || ''} onChange={(e) => handleCustomChange('date_from', e)} />
                                            </div>
                                            <div className="drp-input-separator">→</div>
                                            <div className="drp-input-group">
                                                <label>To</label>
                                                <input type="date" value={value.date_to || ''} onChange={(e) => handleCustomChange('date_to', e)} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="drp-actions">
                                        <button onClick={() => setCustomMode(false)} className="drp-btn drp-btn-secondary">
                                            Back
                                        </button>
                                        <button onClick={() => { setIsOpen(false); setCustomMode(false); }} className="drp-btn drp-btn-primary">
                                            Apply
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            <style>{`
                .drp-container {
                    position: relative;
                }

                .drp-trigger {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0 12px;
                    height: 34px;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    transition: all 0.2s ease;
                    border-radius: 8px;
                }

                .drp-trigger:hover {
                    color: hsl(var(--text-main));
                    background: hsl(var(--main-bg) / 0.5);
                }

                .drp-trigger.has-value {
                    color: hsl(var(--accent));
                }

                .drp-text {
                    white-space: nowrap;
                }

                .drp-clear {
                    color: hsl(var(--text-muted));
                    transition: all 0.2s;
                    border-radius: 50%;
                    padding: 2px;
                    opacity: 0.6;
                }

                .drp-clear:hover {
                    color: hsl(var(--danger));
                    background: hsl(var(--danger) / 0.1);
                    opacity: 1;
                }

                .drp-backdrop {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 2500;
                }

                .drp-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 16px;
                    box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.25),
                                0 8px 20px -8px rgba(0, 0, 0, 0.15);
                    z-index: 2501;
                    min-width: 260px;
                    overflow: hidden;
                    animation: drpSlideIn 0.2s ease-out;
                }

                @keyframes drpSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-8px) scale(0.96);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                .drp-dropdown-inner {
                    padding: 12px;
                }

                .drp-section {
                    margin-bottom: 8px;
                }

                .drp-section-title {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 10px;
                    padding: 0 4px;
                }

                .drp-presets {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }

                .drp-preset-btn {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 12px;
                    background: hsl(var(--main-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-main));
                    text-align: left;
                    transition: all 0.2s ease;
                }

                .drp-preset-btn:hover {
                    background: hsl(var(--accent) / 0.08);
                    border-color: hsl(var(--accent) / 0.3);
                    color: hsl(var(--accent));
                    transform: translateY(-1px);
                }

                .drp-preset-btn.active {
                    background: hsl(var(--accent));
                    border-color: hsl(var(--accent));
                    color: white;
                    box-shadow: 0 4px 12px -4px hsl(var(--accent) / 0.4);
                }

                .drp-preset-label {
                    flex: 1;
                }

                .drp-check {
                    flex-shrink: 0;
                }

                .drp-divider {
                    height: 1px;
                    background: hsl(var(--border-color));
                    margin: 12px 0;
                }

                .drp-custom-trigger {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px;
                    background: transparent;
                    border: 1px dashed hsl(var(--border-color));
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    transition: all 0.2s ease;
                }

                .drp-custom-trigger span {
                    flex: 1;
                    text-align: left;
                }

                .drp-custom-trigger:hover {
                    border-color: hsl(var(--accent));
                    border-style: solid;
                    color: hsl(var(--accent));
                    background: hsl(var(--accent) / 0.05);
                }

                .drp-custom-inputs {
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                }

                .drp-input-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .drp-input-group label {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .drp-input-group input {
                    padding: 10px 12px;
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 10px;
                    font-size: 0.78rem;
                    font-weight: 600;
                    background: hsl(var(--main-bg));
                    color: hsl(var(--text-main));
                    transition: all 0.2s ease;
                    width: 100%;
                }

                .drp-input-group input:focus {
                    outline: none;
                    border-color: hsl(var(--accent));
                    box-shadow: 0 0 0 3px hsl(var(--accent) / 0.15);
                }

                .drp-input-separator {
                    color: hsl(var(--text-muted));
                    font-size: 0.85rem;
                    padding-bottom: 12px;
                }

                .drp-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid hsl(var(--border-color));
                }

                .drp-btn {
                    flex: 1;
                    padding: 10px 16px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 0.75rem;
                    font-weight: 700;
                    transition: all 0.2s ease;
                }

                .drp-btn-secondary {
                    background: hsl(var(--main-bg));
                    border: 1px solid hsl(var(--border-color));
                    color: hsl(var(--text-muted));
                }

                .drp-btn-secondary:hover {
                    border-color: hsl(var(--text-muted));
                    color: hsl(var(--text-main));
                }

                .drp-btn-primary {
                    background: linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(217 91% 50%) 100%);
                    border: none;
                    color: white;
                    box-shadow: 0 4px 12px -4px hsl(var(--accent) / 0.4);
                }

                .drp-btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px -4px hsl(var(--accent) / 0.5);
                }

                /* Dark mode adjustments */
                [data-theme="dark"] .drp-dropdown {
                    background: hsl(var(--card-bg));
                    box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5),
                                0 8px 20px -8px rgba(0, 0, 0, 0.3);
                }

                [data-theme="dark"] .drp-preset-btn {
                    background: hsl(var(--main-bg));
                }

                [data-theme="dark"] .drp-input-group input {
                    background: hsl(var(--main-bg));
                }
            `}</style>
        </div>
    );
}

export default DateRangePicker;
