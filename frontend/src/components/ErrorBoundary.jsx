import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error) {
        
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });

    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '400px',
                    padding: '40px',
                    textAlign: 'center',
                    background: 'hsl(var(--card-bg, #ffffff))',
                    borderRadius: '16px',
                    margin: '20px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'hsl(var(--danger, #ef4444) / 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '24px'
                    }}>
                        <svg
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="hsl(var(--danger, #ef4444))"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>

                    <h2 style={{
                        margin: '0 0 12px 0',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: 'hsl(var(--text-primary, #1f2937))'
                    }}>
                        Something went wrong
                    </h2>

                    <p style={{
                        margin: '0 0 24px 0',
                        color: 'hsl(var(--text-muted, #6b7280))',
                        maxWidth: '400px',
                        lineHeight: 1.6
                    }}>
                        An unexpected error occurred. Please try again or reload the page.
                    </p>

                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <details style={{
                            marginBottom: '24px',
                            padding: '16px',
                            background: 'hsl(var(--danger, #ef4444) / 0.05)',
                            borderRadius: '8px',
                            maxWidth: '100%',
                            overflow: 'auto',
                            textAlign: 'left'
                        }}>
                            <summary style={{
                                cursor: 'pointer',
                                fontWeight: 600,
                                color: 'hsl(var(--danger, #ef4444))'
                            }}>
                                Error Details
                            </summary>
                            <pre style={{
                                margin: '12px 0 0 0',
                                fontSize: '0.75rem',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: 'hsl(var(--text-muted, #6b7280))'
                            }}>
                                {this.state.error.toString()}
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </details>
                    )}

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={this.handleRetry}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '8px',
                                border: '1px solid hsl(var(--border, #e5e7eb))',
                                background: 'transparent',
                                color: 'hsl(var(--text-primary, #1f2937))',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.target.style.background = 'hsl(var(--hover-bg, #f3f4f6))'}
                            onMouseOut={(e) => e.target.style.background = 'transparent'}
                        >
                            Try Again
                        </button>
                        <button
                            onClick={this.handleReload}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'hsl(var(--primary, #3b82f6))',
                                color: 'white',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.target.style.opacity = '0.9'}
                            onMouseOut={(e) => e.target.style.opacity = '1'}
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
