import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', maxWidth: 500, margin: '80px auto' }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: 8 }}>
            An unexpected error occurred. Please try reloading the page.
          </p>
          {this.state.error?.message && (
            <pre style={{
              background: '#fee', padding: 16, borderRadius: 8,
              marginTop: 16, textAlign: 'left', fontSize: 12,
              color: '#dc2626', overflow: 'auto',
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: 20, padding: '10px 24px', background: '#2563eb',
              color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
