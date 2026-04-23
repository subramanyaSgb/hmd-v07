import { useState, useCallback, useRef } from 'react'
import { parseExcelFile, validateExcelData, getImportSummary } from './excelUtils'
import { FileSpreadsheet, XCircle, Upload, AlertTriangle, CheckCircle2, Loader2, FileX } from 'lucide-react'
import ExcelPreviewTable from './ExcelPreviewTable'
import ExcelValidationErrors from './ExcelValidationErrors'

const ExcelUploadModal = ({
    isOpen,
    onClose,
    onConfirm,
    users,
    currentDate
}) => {
    const [file, setFile] = useState(null)
    const [previewData, setPreviewData] = useState(null)
    const [errors, setErrors] = useState([])
    const [summary, setSummary] = useState(null)
    const [parsing, setParsing] = useState(false)
    const [parseError, setParseError] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef(null)

    const resetState = () => {
        setFile(null)
        setPreviewData(null)
        setErrors([])
        setSummary(null)
        setParsing(false)
        setParseError(null)
    }

    const handleClose = () => {
        resetState()
        onClose()
    }

    const handleFileSelect = useCallback(async (selectedFile) => {
        if (!selectedFile) return

        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ]
        const isValidType = validTypes.includes(selectedFile.type) ||
            selectedFile.name.endsWith('.xlsx') ||
            selectedFile.name.endsWith('.xls')

        if (!isValidType) {
            setParseError('Please upload an Excel file (.xlsx or .xls)')
            return
        }

        setFile(selectedFile)
        setParsing(true)
        setParseError(null)

        try {
            const parsed = await parseExcelFile(selectedFile)
            const validationErrors = validateExcelData(parsed, users, currentDate)
            const importSummary = getImportSummary(parsed, validationErrors, users)

            setPreviewData(parsed)
            setErrors(validationErrors)
            setSummary(importSummary)
        } catch (err) {
            setParseError(err.message || 'Failed to parse Excel file')
            setPreviewData(null)
        } finally {
            setParsing(false)
        }
    }, [users, currentDate])

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        setIsDragging(false)

        const droppedFile = e.dataTransfer.files?.[0]
        if (droppedFile) {
            handleFileSelect(droppedFile)
        }
    }, [handleFileSelect])

    const handleDragOver = (e) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleInputChange = (e) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            handleFileSelect(selectedFile)
        }
    }

    const handleConfirm = () => {
        if (previewData && summary?.canImport) {
            onConfirm(previewData)
            handleClose()
        }
    }

    if (!isOpen) return null

    return (
        <div className="premium-modal-overlay animate-in fade-in duration-300">
            <div className="premium-modal glass-morphism animate-in zoom-in-95" style={{ maxWidth: previewData ? '95vw' : '540px', maxHeight: '90vh', width: previewData ? '1200px' : 'auto', transition: 'all 0.3s ease' }}>
                <div className="premium-modal-header">
                    <div className="title-group">
                        <FileSpreadsheet size={20} className="icon-accent" />
                        <h3>Import Monthly Plan from Excel</h3>
                    </div>
                    <button onClick={handleClose} className="close-btn">
                        <XCircle size={24} />
                    </button>
                </div>
                <div className="premium-modal-body" style={{ overflow: 'auto', maxHeight: '65vh', padding: '24px' }}>
                    {!file && !parsing && (
                        <div
                            className={`excel-drop-zone ${isDragging ? 'dragging' : ''}`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${isDragging ? 'hsl(var(--accent))' : 'hsl(var(--border))'}`,
                                borderRadius: '16px',
                                padding: '48px 32px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: isDragging ? 'hsla(var(--accent), 0.05)' : 'hsla(var(--bg-muted), 0.5)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <Upload
                                size={48}
                                style={{
                                    color: isDragging ? 'hsl(var(--accent))' : 'hsl(var(--text-muted))',
                                    marginBottom: '16px'
                                }}
                            />
                            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px', color: 'hsl(var(--text))' }}>
                                Drop Excel file here or click to browse
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
                                Supports .xlsx and .xls files
                            </p>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleInputChange} style={{ display: 'none' }} />
                        </div>
                    )}
                    {parsing && (
                        <div style={{ textAlign: 'center', padding: '48px' }}>
                            <Loader2 size={48} className="animate-spin" style={{ color: 'hsl(var(--accent))', marginBottom: '16px' }} />
                            <p style={{ fontSize: '1rem', color: 'hsl(var(--text))' }}>Parsing Excel file...</p>
                            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', marginTop: '8px' }}>
                                {file?.name}
                            </p>
                        </div>
                    )}
                    {parseError && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                            <FileX size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
                            <p style={{ fontSize: '1rem', color: '#991b1b', fontWeight: 600, marginBottom: '8px' }}>
                                Failed to Parse File
                            </p>
                            <p style={{ fontSize: '0.9rem', color: '#7f1d1d' }}>{parseError}</p>
                            <button className="premium-btn secondary" onClick={resetState} style={{ marginTop: '16px' }}>
                                Try Another File
                            </button>
                        </div>
                    )}
                    {previewData && !parsing && (
                        <>
                            {summary && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                                    <div className="stat-card-mini">
                                        <span className="label">Days</span>
                                        <span className="value">{summary.totalDays}</span>
                                    </div>
                                    <div className="stat-card-mini">
                                        <span className="label">Nodes</span>
                                        <span className="value">{summary.validNodes}/{summary.totalNodes}</span>
                                    </div>
                                    <div className="stat-card-mini">
                                        <span className="label">Filled Cells</span>
                                        <span className="value">{summary.filledCells}</span>
                                    </div>
                                    <div className="stat-card-mini" style={{ background: summary.errorCount > 0 ? '#fef2f2' : '#f0fdf4' }}>
                                        <span className="label">{summary.errorCount > 0 ? 'Errors' : 'Valid'}</span>
                                        <span className="value" style={{ color: summary.errorCount > 0 ? '#ef4444' : '#22c55e' }}>
                                            {summary.errorCount > 0 ? summary.errorCount : summary.validCells}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {errors.length > 0 && (
                                <ExcelValidationErrors errors={errors} />
                            )}
                            <ExcelPreviewTable data={previewData} users={users} />
                            <div style={{ textAlign: 'center', marginTop: '16px' }}>
                                <button className="premium-btn text-only" onClick={resetState} style={{ fontSize: '0.85rem' }}>
                                    Choose Different File
                                </button>
                            </div>
                        </>
                    )}
                </div>
                <div className="premium-modal-footer">
                    <button className="premium-btn text-only" onClick={handleClose}>
                        CANCEL
                    </button>
                    {previewData && summary && (
                        <button className="premium-btn primary glow" onClick={handleConfirm} disabled={!summary.canImport} style={{ minWidth: '160px' }}>
                            {summary.canImport ? (
                                <>
                                    <CheckCircle2 size={18} />
                                    IMPORT {summary.totalDays} DAYS
                                </>
                            ) : (
                                <>
                                    <AlertTriangle size={18} />
                                    FIX ERRORS FIRST
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                .stat-card-mini {
                    background: hsl(var(--bg-muted));
                    border: 1px solid hsl(var(--border));
                    border-radius: 10px;
                    padding: 12px 16px;
                    text-align: center;
                }
                .stat-card-mini .label {
                    display: block;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: hsl(var(--text-muted));
                    margin-bottom: 4px;
                }
                .stat-card-mini .value {
                    display: block;
                    font-size: 1.25rem;
                    font-weight: 900;
                    color: hsl(var(--text));
                }
            `}</style>
        </div>
    )
}

export default ExcelUploadModal
