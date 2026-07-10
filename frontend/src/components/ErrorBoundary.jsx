import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    } else {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card p-12 text-center border-red-500/20 bg-red-500/5 my-6">
          <AlertTriangle size={40} className="text-red-400 mx-auto mb-4 animate-bounce" />
          <h2 className="text-red-400 text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            {this.state.error?.message || 'An unexpected client-side error occurred.'}
          </p>
          <button onClick={this.handleReset} className="btn-primary btn-sm flex items-center gap-2 mx-auto">
            <RefreshCw size={14} /> Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
