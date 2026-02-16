import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', color: '#fff', background: '#1E1E1E', height: '100vh' }}>
                    <h1>Something went wrong.</h1>
                    <h3 style={{ color: '#ff4444' }}>{this.state.error?.toString()}</h3>
                    <pre style={{ background: '#000', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
                        {this.state.errorInfo?.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{ marginTop: '20px', padding: '10px 20px', background: '#00F2EA', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Reload App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
