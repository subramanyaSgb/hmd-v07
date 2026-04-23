import { useState } from 'react'
import { AlertTriangle, AlertCircle, ChevronDown, ChevronUp, XCircle } from 'lucide-react'

const ExcelValidationErrors = ({ errors }) => {
    const [isExpanded, setIsExpanded] = useState(false)

    if (!errors || errors.length === 0) return null

    const errorsByType = {
        error: errors.filter(e => e.severity === 'error'),
        warning: errors.filter(e => e.severity === 'warning')
    }

    const hasBlockingErrors = errorsByType.error.length > 0
    const maxPreviewErrors = 5

    return (
        <div style={{ background: hasBlockingErrors ? '#fef2f2' : '#fffbeb', border: `1px solid ${hasBlockingErrors ? '#fecaca' : '#fed7aa'}`, borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', background: hasBlockingErrors ? '#fee2e2' : '#fef3c7' }} onClick={() => setIsExpanded(!isExpanded)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {hasBlockingErrors ? (
                        <XCircle size={20} style={{ color: '#dc2626' }} />
                    ) : (
                        <AlertTriangle size={20} style={{ color: '#d97706' }} />
                    )}
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: hasBlockingErrors ? '#991b1b' : '#92400e' }}>
                        {hasBlockingErrors
                            ? `${errorsByType.error.length} Error${errorsByType.error.length > 1 ? 's' : ''} Found - Import Blocked`
                            : `${errorsByType.warning.length} Warning${errorsByType.warning.length > 1 ? 's' : ''}`
                        }
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {errorsByType.error.length > 0 && (
                        <span style={{ background: '#dc2626', color: 'white', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>
                            {errorsByType.error.length} ERRORS
                        </span>
                    )}
                    {errorsByType.warning.length > 0 && (
                        <span style={{ background: '#d97706', color: 'white', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>
                            {errorsByType.warning.length} WARNINGS
                        </span>
                    )}
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
            </div>
            {isExpanded && (
                <div style={{ padding: '12px 16px' }}>
                    {errorsByType.error.length > 0 && (
                        <div style={{ marginBottom: errorsByType.warning.length > 0 ? '16px' : 0 }}>
                            <h5 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#991b1b', marginBottom: '8px' }}>
                                <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                Errors (Must Fix)
                            </h5>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {errorsByType.error.slice(0, isExpanded ? undefined : maxPreviewErrors).map((err, idx) => (
                                    <ErrorItem key={`error-${idx}`} error={err} severity="error" />
                                ))}
                                {!isExpanded && errorsByType.error.length > maxPreviewErrors && (
                                    <span style={{ fontSize: '0.8rem', color: '#991b1b', fontStyle: 'italic' }}>
                                        ...and {errorsByType.error.length - maxPreviewErrors} more errors
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    {errorsByType.warning.length > 0 && (
                        <div>
                            <h5 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e', marginBottom: '8px' }}>
                                <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                Warnings (Will Be Skipped)
                            </h5>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {errorsByType.warning.slice(0, isExpanded ? undefined : maxPreviewErrors).map((err, idx) => (
                                    <ErrorItem key={`warning-${idx}`} error={err} severity="warning" />
                                ))}
                                {!isExpanded && errorsByType.warning.length > maxPreviewErrors && (
                                    <span style={{ fontSize: '0.8rem', color: '#92400e', fontStyle: 'italic' }}>
                                        ...and {errorsByType.warning.length - maxPreviewErrors} more warnings
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

const ErrorItem = ({ error, severity }) => {
    const isError = severity === 'error'

    const getLocationText = () => {
        if (error.type === 'column') {
            return `Column: ${error.node}`
        }
        if (error.type === 'date') {
            return `Row ${error.row}`
        }
        if (error.type === 'value') {
            return `Row ${error.row}, ${error.col}`
        }
        return ''
    }

    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 12px', background: isError ? '#fff5f5' : '#fffef5', borderRadius: '8px', border: `1px solid ${isError ? '#fecaca' : '#fef08a'}`, fontSize: '0.8rem' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, color: isError ? '#dc2626' : '#d97706', whiteSpace: 'nowrap', minWidth: '100px' }}>
                {getLocationText()}
            </span>
            <span style={{ color: isError ? '#7f1d1d' : '#78350f', flex: 1 }}>
                {error.message}
            </span>
        </div>
    )
}

export default ExcelValidationErrors
