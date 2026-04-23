import { useState } from 'react';
import { FileText, FileSpreadsheet, FileJson, File, Download, ChevronDown } from 'lucide-react';

const EXPORT_OPTIONS = [
    { id: 'pdf', name: 'PDF Document', icon: FileText, description: 'Printable PDF with charts', color: '#ef4444' },
    { id: 'excel', name: 'Excel Spreadsheet', icon: FileSpreadsheet, description: 'CSV format (Excel compatible)', color: '#10b981' },
    { id: 'csv', name: 'CSV File', icon: File, description: 'Comma-separated values', color: '#3b82f6' },
    { id: 'json', name: 'JSON File', icon: FileJson, description: 'Structured data format', color: '#f59e0b' },
    { id: 'html', name: 'HTML Page', icon: FileText, description: 'Web browser view', color: '#8b5cf6' }
];

function ExportDropdown({ onExport }) {
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredId, setHoveredId] = useState(null);

    const handleExport = (format) => {
        onExport(format);
        setIsOpen(false);
    };

    return (
        <div className="export-dropdown-container">
            <button onClick={() => setIsOpen(!isOpen)} className="export-trigger-btn">
                <Download size={16} />
                <span>Export</span>
                <ChevronDown size={14} className={`export-chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="export-backdrop" onClick={() => setIsOpen(false)} />
                    <div className="export-dropdown">
                        <div className="export-dropdown-header">
                            Export Format
                        </div>
                        {EXPORT_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const isHovered = hoveredId === option.id;
                            return (
                                <button key={option.id} onClick={() => handleExport(option.id)} className="export-option-btn" onMouseEnter={() => setHoveredId(option.id)} onMouseLeave={() => setHoveredId(null)} style={{ '--option-color': option.color, '--option-bg': `${option.color}12` }}>
                                    <div className={`export-option-icon ${isHovered ? 'hovered' : ''}`}>
                                        <Icon size={18} />
                                    </div>
                                    <div className="export-option-content">
                                        <div className="export-option-name">{option.name}</div>
                                        <div className="export-option-desc">{option.description}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            <style>{`
                .export-dropdown-container {
                    position: relative;
                }

                .export-trigger-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 18px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: 700;
                    font-size: 0.75rem;
                    color: white;
                    transition: all 0.3s ease;
                    box-shadow: 0 2px 8px -2px rgba(16, 185, 129, 0.4);
                }

                .export-trigger-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px -2px rgba(16, 185, 129, 0.5);
                }

                .export-chevron {
                    transition: transform 0.2s ease;
                    margin-left: 2px;
                }

                .export-chevron.open {
                    transform: rotate(180deg);
                }

                .export-backdrop {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 99;
                }

                .export-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 16px;
                    box-shadow: 0 12px 40px -8px rgba(0, 0, 0, 0.2),
                                0 4px 12px -4px rgba(0, 0, 0, 0.1);
                    padding: 8px;
                    z-index: 100;
                    min-width: 280px;
                }

                .export-dropdown-header {
                    padding: 10px 12px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-secondary));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid hsl(var(--border-subtle));
                    margin-bottom: 4px;
                }

                .export-option-btn {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    padding: 12px;
                    background: transparent;
                    border: none;
                    border-radius: 12px;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s ease;
                }

                .export-option-btn:hover {
                    background: var(--option-bg);
                }

                .export-option-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    background: hsl(var(--bg-secondary));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: hsl(var(--text-secondary));
                    transition: all 0.2s ease;
                }

                .export-option-icon.hovered {
                    background: var(--option-bg);
                    color: var(--option-color);
                    transform: scale(1.05);
                }

                .export-option-content {
                    flex: 1;
                }

                .export-option-name {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--text-primary));
                    margin-bottom: 2px;
                }

                .export-option-desc {
                    font-size: 0.7rem;
                    color: hsl(var(--text-muted));
                }

                /* Dark mode */
                :root[data-theme="dark"] .export-dropdown {
                    background: hsl(var(--bg-secondary));
                    border-color: hsl(var(--border-color));
                }
            `}</style>
        </div>
    );
}

export default ExportDropdown;
