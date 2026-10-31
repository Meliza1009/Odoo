import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, ErrorState } from './ui'

interface State {
  error: Error | null
}

/**
 * Catches render errors so one broken page does not blank the whole app. A failed lazy chunk (usually a
 * new deployment while the tab was open) is fixed by reloading, so that is the offered action.
 * Give it `key={pathname}` to clear the error when the user navigates elsewhere.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error.message)
    return (
      <ErrorState
        title={chunk ? 'A new version is available' : 'This page crashed'}
        description={chunk ? 'Reload to get the latest version of Brightloop.' : 'Something unexpected went wrong. Reloading usually fixes it.'}
        action={<Button onClick={() => window.location.reload()}>Reload</Button>}
      />
    )
  }
}
