import { useState, useCallback } from 'react';
import { exportPlanToPDF } from '../../utils/pdfExport';
import { api } from '../../utils/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { ChevronDown, ChevronUp, Calendar, Clock, Download, Mail, X, Loader2 } from 'lucide-react'
import SummaryStats from './SummaryStats'
import NodeTables from './NodeTables'
import TripsSection from './TripsSection'

const PlanCard = ({ plan, isExpanded, onToggle }) => {
    const { user } = useAuth();
    const { showSuccess, showError } = useNotification();
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailAddress, setEmailAddress] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const handleExportPDF = (e) => {
        e.stopPropagation(); 
        exportPlanToPDF(plan);
    };

    const openEmailModal = (e) => {
        e.stopPropagation();
        setEmailAddress(user?.email || '');
        setShowEmailModal(true);
    };

    const handleSendEmail = useCallback(async () => {
        const targetEmail = emailAddress.trim();
        if (!targetEmail || !targetEmail.includes('@')) {
            showError('Please enter a valid email address');
            return;
        }

        setIsSendingEmail(true);
        try {
            const response = await api.post('/api/daily-plans/email', {
                email: targetEmail,
                plan_id: plan.plan_id
            });

            if (response.status === 'success') {
                showSuccess(`Plan report sent to ${targetEmail}`);
                setShowEmailModal(false);
                setEmailAddress('');
            } else {
                showError(response.detail || 'Failed to send email');
            }
        } catch (error) {
            console.error('Email error:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to send email. Please check SMTP configuration.';
            showError(errorMessage);
        } finally {
            setIsSendingEmail(false);
        }
    }, [emailAddress, plan.plan_id, showSuccess, showError]);

    return (
        <div className={`plan-history-card ${isExpanded ? 'expanded' : ''}`}>
            <div className="plan-card-header" onClick={onToggle}>
                <div className="plan-card-title-section">
                    <div className="plan-card-icon">
                        <Calendar size={18} />
                    </div>
                    <div className="plan-card-info">
                        <span className="plan-name">{plan.plan_name}</span>
                        <span className="plan-date-time">
                            <Clock size={12} />
                            {formatDate(plan.date)} at {formatTime(plan.created_at)}
                        </span>
                    </div>
                    <span className={`status-pill ${plan.status.toLowerCase()}`}>
                        {plan.status}
                    </span>
                </div>

                <div className="plan-card-summary-preview">
                    <div className="preview-stat">
                        <span className="preview-value">{plan.summary.total_production_mt.toLocaleString()}</span>
                        <span className="preview-label">MT Prod</span>
                    </div>
                    <div className="preview-stat">
                        <span className="preview-value">{plan.summary.planned_trips ?? plan.summary.total_trips}</span>
                        <span className="preview-label">Trips</span>
                    </div>
                    <div className="preview-stat">
                        <span className="preview-value">{plan.summary.fulfillment_rate}%</span>
                        <span className="preview-label">Fulfilled</span>
                    </div>
                </div>

                <div className="plan-card-actions">
                    <button className="btn-export-pdf" onClick={handleExportPDF} title="Export to PDF">
                        <Download size={16} />
                        <span>PDF</span>
                    </button>
                    <button className="btn-export-email" onClick={openEmailModal} title="Email Report">
                        <Mail size={16} />
                    </button>
                    <div className="plan-card-toggle">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="plan-card-body">
                    <SummaryStats summary={plan.summary} />
                    <NodeTables producers={plan.producers} consumers={plan.consumers} />
                    <TripsSection routes={plan.routes} />
                </div>
            )}
            {showEmailModal && (
                <div className="plan-email-modal-overlay" onClick={() => { setShowEmailModal(false); setEmailAddress(''); }}>
                    <div className="plan-email-modal" onClick={e => e.stopPropagation()}>
                        <div className="plan-email-modal-header">
                            <div className="plan-email-modal-title">
                                <Mail size={20} />
                                <span>Send Plan Report via Email</span>
                            </div>
                            <button className="plan-email-modal-close" onClick={() => { setShowEmailModal(false); setEmailAddress(''); }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="plan-email-modal-body">
                            <p className="plan-email-modal-desc">
                                The plan <strong>{plan.plan_name}</strong> report will be generated and sent to your email.
                            </p>
                            <label className="plan-email-modal-label">Email Address</label>
                            <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="Enter email address..." className="plan-email-modal-input" autoFocus />
                        </div>
                        <div className="plan-email-modal-footer">
                            <button onClick={() => { setShowEmailModal(false); setEmailAddress(''); }} className="plan-email-modal-btn secondary" disabled={isSendingEmail}>
                                Cancel
                            </button>
                            <button onClick={handleSendEmail} className="plan-email-modal-btn primary" disabled={isSendingEmail || !emailAddress.trim()}>
                                {isSendingEmail ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Mail size={14} />
                                        Send Report
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    <style>{`
                        .plan-email-modal-overlay {
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: rgba(0, 0, 0, 0.5);
                            backdrop-filter: blur(4px);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            z-index: 9999;
                            animation: fadeIn 0.2s ease;
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                        .plan-email-modal {
                            background: ${'#ffffff'};
                            border-radius: 16px;
                            width: 100%;
                            max-width: 420px;
                            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                            animation: slideUp 0.3s ease;
                            border: 1px solid ${'#e2e8f0'};
                        }
                        @keyframes slideUp {
                            from { opacity: 0; transform: translateY(20px) scale(0.95); }
                            to { opacity: 1; transform: translateY(0) scale(1); }
                        }
                        .plan-email-modal-header {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 20px 24px;
                            border-bottom: 1px solid ${'#e2e8f0'};
                            background: ${'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)'};
                            border-radius: 16px 16px 0 0;
                        }
                        .plan-email-modal-title {
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            font-size: 1rem;
                            font-weight: 700;
                            color: ${'#0f172a'};
                        }
                        .plan-email-modal-title svg {
                            color: #3b82f6;
                        }
                        .plan-email-modal-close {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            width: 32px;
                            height: 32px;
                            border: none;
                            background: ${'#f1f5f9'};
                            border-radius: 8px;
                            cursor: pointer;
                            color: ${'#64748b'};
                            transition: all 0.2s ease;
                        }
                        .plan-email-modal-close:hover {
                            background: rgba(239, 68, 68, 0.1);
                            color: #ef4444;
                        }
                        .plan-email-modal-body {
                            padding: 24px;
                            background: ${'#ffffff'};
                        }
                        .plan-email-modal-desc {
                            font-size: 0.85rem;
                            color: ${'#64748b'};
                            margin-bottom: 20px;
                            line-height: 1.5;
                        }
                        .plan-email-modal-desc strong {
                            color: ${'#0f172a'};
                        }
                        .plan-email-modal-label {
                            display: block;
                            font-size: 0.75rem;
                            font-weight: 700;
                            color: ${'#64748b'};
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                            margin-bottom: 8px;
                        }
                        .plan-email-modal-input {
                            width: 100%;
                            padding: 12px 16px;
                            border: 2px solid ${'#e2e8f0'};
                            border-radius: 10px;
                            font-size: 0.9rem;
                            font-weight: 500;
                            color: ${'#0f172a'};
                            background: ${'#f8fafc'};
                            transition: all 0.2s ease;
                            box-sizing: border-box;
                        }
                        .plan-email-modal-input:focus {
                            outline: none;
                            border-color: #3b82f6;
                            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
                        }
                        .plan-email-modal-input::placeholder {
                            color: ${'#94a3b8'};
                        }
                        .plan-email-modal-footer {
                            display: flex;
                            gap: 12px;
                            padding: 20px 24px;
                            border-top: 1px solid ${'#e2e8f0'};
                            background: ${'#f8fafc'};
                            border-radius: 0 0 16px 16px;
                        }
                        .plan-email-modal-btn {
                            flex: 1;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            padding: 12px 20px;
                            border-radius: 10px;
                            font-size: 0.85rem;
                            font-weight: 700;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            border: none;
                        }
                        .plan-email-modal-btn.secondary {
                            background: ${'#ffffff'};
                            color: ${'#64748b'};
                            border: 1px solid ${'#e2e8f0'};
                        }
                        .plan-email-modal-btn.secondary:hover:not(:disabled) {
                            background: ${'#f1f5f9'};
                            color: ${'#0f172a'};
                        }
                        .plan-email-modal-btn.primary {
                            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                            color: white;
                            box-shadow: 0 4px 12px -4px rgba(59, 130, 246, 0.4);
                        }
                        .plan-email-modal-btn.primary:hover:not(:disabled) {
                            transform: translateY(-1px);
                            box-shadow: 0 6px 16px -4px rgba(59, 130, 246, 0.5);
                        }
                        .plan-email-modal-btn:disabled {
                            opacity: 0.6;
                            cursor: not-allowed;
                        }
                        .plan-email-modal-btn .animate-spin {
                            animation: spin 1s linear infinite;
                        }
                        @keyframes spin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            )}
        </div>
    );
};

export default PlanCard;
