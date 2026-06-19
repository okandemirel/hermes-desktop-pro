import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Top-level renderer error boundary. ChatView alone is ~1.6k lines, so a single
 * render throw used to white-screen the whole app and drop every tab's state.
 * This catches it and offers recovery instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Main-process logging captures renderer console output for diagnostics.
    console.error("[renderer] Unhandled error:", error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ui-error-boundary" role="alert">
        <div className="ui-error-boundary-card">
          <h1>Something went wrong</h1>
          <p>The interface hit an unexpected error. Your data is safe — try again or reload.</p>
          <pre>{this.state.error.message}</pre>
          <div className="ui-error-boundary-actions">
            <button type="button" onClick={this.reset}>Try again</button>
            <button type="button" onClick={() => window.location.reload()}>Reload app</button>
          </div>
        </div>
      </div>
    );
  }
}
