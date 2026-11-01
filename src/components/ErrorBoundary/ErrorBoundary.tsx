import { Component, type ErrorInfo, type ReactNode } from 'react'
import { localized } from '../../i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level safety net: a throw during render would otherwise leave a blank window with no way out. Catch it, show what failed, and offer a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Visible in the webview's developer tools.
    console.error('[beynt] render error:', error, info.componentStack)
  }

  private reload = (): void => {
    this.setState({ error: null })
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="errboundary">
        <div>
          <h1>{localized('Something went wrong', 'Qualcosa è andato storto')}</h1>
          <p>{error.message || localized('Unexpected error in the window.', 'Errore imprevisto nella finestra.')}</p>
          <button className="btn btn--primary" onClick={this.reload}>
            {localized('Reload Beynt', 'Ricarica Beynt')}
          </button>
        </div>
      </div>
    )
  }
}
