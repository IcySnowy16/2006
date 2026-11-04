/** A screen that throws while rendering must not leave a blank page: show a short message and a way out. */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the browser console only; there is no client error service yet.
    // eslint-disable-next-line no-console -- the browser console is the only place a client error can go for now
    console.error('Screen crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="stack" style={{ padding: '24px 16px', maxWidth: 520, margin: '0 auto' }}>
        <div className="banner banner-error" role="alert">
          <strong>Something went wrong on this screen.</strong> Try again, or go back to the start.
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
          <a className="btn btn-secondary" href="/">
            Go to the start
          </a>
        </div>
      </main>
    );
  }
}
