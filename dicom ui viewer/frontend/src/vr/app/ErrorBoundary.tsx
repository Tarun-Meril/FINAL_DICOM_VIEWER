import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@3d/core/logger';

interface Props { children: ReactNode; fallbackTitle?: string }
interface State { error: Error | null; info: string | null }

/** Keeps a rendering failure inside the viewport instead of blanking the workstation. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('ui', 'unhandled error in component tree', {
      message: error.message, componentStack: info.componentStack,
    });
    this.setState({ info: info.componentStack ?? null });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>{this.props.fallbackTitle ?? 'Something went wrong in this part of the application.'}</h2>
        <p className="hint">
          The rest of the workstation is still usable. Full technical details are in the
          Diagnostics panel and in the exported log.
        </p>
        <div className="note error" style={{ marginBottom: 12 }}>{this.state.error.message}</div>
        <button className="btn" onClick={() => this.setState({ error: null, info: null })}>Try again</button>
      </div>
    );
  }
}
