import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react'

const CustomSelect = ({
    options,
    value,
    onChange,
    placeholder = "Select an option...",
    label,
    required = false,
    disabled = false,
    size = 'default',
    style = {}
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const containerRef = useRef(null);
    const triggerRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                const portal = document.querySelector('.custom-select-portal');
                if (portal && portal.contains(event.target)) return;
                setIsOpen(false);
            }
        };

        const updateCoords = () => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + window.scrollY,
                    left: rect.left + window.scrollX,
                    width: rect.width
                });
            }
        };

        if (isOpen) {
            updateCoords();
            window.addEventListener('scroll', updateCoords, true);
            window.addEventListener('resize', updateCoords);
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen]);

    const handleSelect = (optionValue) => {
        if (disabled) return;
        onChange(optionValue);
        setIsOpen(false);
    };

    const isSmall = size === 'small';

    return (
        <div className={`custom-select-container ${isSmall ? 'size-small' : ''}`} ref={containerRef} style={style}>
            {label && (
                <label className="custom-select-label">
                    {label} {required && <span className="required-star">*</span>}
                </label>
            )}
            <div ref={triggerRef} className={`custom-select-trigger ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`} onClick={() => !disabled && setIsOpen(!isOpen)} style={{ height: isSmall ? '36px' : '52px', padding: isSmall ? '0 12px' : '0 16px', borderRadius: isSmall ? '8px' : '12px' }}>
                <span className={`trigger-text ${!selectedOption ? 'placeholder' : ''}`} style={{ fontSize: isSmall ? '0.85rem' : '1rem' }}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={isSmall ? 14 : 18} className={`chevron-icon ${isOpen ? 'rotated' : ''}`} />
            </div>

            {isOpen && createPortal(
                <div className="custom-select-portal custom-select-options animate-in fade-in zoom-in duration-200" style={{ position: 'absolute', top: `${coords.top + (isSmall ? 4 : 8)}px`, left: `${coords.left}px`, width: `${coords.width}px`, zIndex: 9999 }}>
                    <div className="options-scroll-wrapper" style={{ padding: isSmall ? '4px' : '8px' }}>
                        {options.length === 0 ? (
                            <div className="no-options">No options available</div>
                        ) : (
                            options.map((option) => (
                                <div key={option.value} className={`select-option ${option.value === value ? 'selected' : ''}`} onClick={() => handleSelect(option.value)} style={{ padding: isSmall ? '8px 12px' : '12px 16px', fontSize: isSmall ? '0.85rem' : '0.95rem' }}>
                                    {option.label}
                                </div>
                            ))
                        )}
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                .custom-select-container {
                    position: relative;
                    width: 100%;
                    font-family: 'Space Grotesk', sans-serif;
                }

                .custom-select-label {
                    display: block;
                    margin-bottom: 8px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .required-star {
                    color: hsl(var(--danger));
                }

                .custom-select-trigger {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: var(--bg-secondary);
                    border: 1px solid hsl(var(--border-color));
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                }

                .custom-select-trigger:hover:not(.disabled) {
                    border-color: hsl(var(--primary) / 0.5);
                    background: hsl(var(--main-bg) / 0.3);
                }

                .custom-select-trigger.open {
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 4px hsl(var(--primary) / 0.1);
                }

                .custom-select-trigger.disabled {
                    cursor: not-allowed;
                    opacity: 0.6;
                    background: hsl(var(--main-bg));
                }

                .trigger-text {
                    font-weight: 700;
                    color: hsl(var(--primary));
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .trigger-text.placeholder {
                    color: hsl(var(--text-muted) / 0.7);
                    font-weight: 500;
                }

                .chevron-icon {
                    color: hsl(var(--text-muted));
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    flex-shrink: 0;
                }

                .chevron-icon.rotated {
                    transform: rotate(180deg);
                }

                .custom-select-options {
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 12px;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1);
                    overflow: hidden;
                    pointer-events: auto;
                    backdrop-filter: blur(10px);
                }

                .options-scroll-wrapper {
                    max-height: 240px;
                    overflow-y: auto;
                }

                .options-scroll-wrapper::-webkit-scrollbar {
                    width: 4px;
                }

                .options-scroll-wrapper::-webkit-scrollbar-thumb {
                    background: hsl(var(--primary) / 0.1);
                    border-radius: 10px;
                }

                .select-option {
                    border-radius: 6px;
                    font-weight: 600;
                    color: hsl(var(--text-primary));
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: transparent;
                }

                .select-option:hover {
                    background: hsl(var(--primary) / 0.1);
                    color: hsl(var(--primary));
                }

                .select-option.selected {
                    background: hsl(var(--primary) / 0.15);
                    color: hsl(var(--primary));
                    font-weight: 700;
                }

                .no-options {
                    padding: 16px;
                    text-align: center;
                    color: hsl(var(--text-muted));
                    font-size: 0.9rem;
                }
            `}</style>
        </div>
    );
};

export default CustomSelect;
