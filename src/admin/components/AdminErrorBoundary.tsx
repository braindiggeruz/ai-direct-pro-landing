// Last-resort React error boundary for the admin SPA. Renders a
// recoverable error card instead of a blank screen when any descendant
// component throws.
//
// Used at the top of AdminApp so a malformed API response cannot blank
// the entire dashboard.

import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { ru } from '../i18n/ru';

interface State { error: Error | null; info: string | null; key: number }

export class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, info: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }): void {
    // Best-effort: surface in DevTools without leaking PII to the wire.
    console.error('[AdminErrorBoundary]', error, errorInfo);
    this.setState({ info: errorInfo.componentStack?.split('\n').slice(0, 6).join('\n') || null });
  }

  private retry = (): void => {
    this.setState((s) => ({ error: null, info: null, key: s.key + 1 }));
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-8 bg-bg-base text-white"
          data-testid="admin-error-boundary"
        >
          <div className="max-w-xl w-full bg-bg-surface border border-red-500/40 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <AlertOctagon size={20} className="text-red-300" />
              <h1 className="font-display text-xl">{ru.boundary.title}</h1>
            </div>
            <p className="text-white/80 text-sm mb-3">
              {ru.boundary.description}
            </p>
            <div className="rounded-xl border border-white/10 bg-bg-base p-3 mb-4">
              <div className="text-red-300 text-xs font-mono break-words" data-testid="admin-error-boundary-message">
                {this.state.error.message || String(this.state.error)}
              </div>
              {this.state.info && (
                <details className="mt-2">
                  <summary className="text-white/40 text-xs cursor-pointer hover:text-white/70">{ru.boundary.detail}</summary>
                  <pre className="text-white/50 text-[10px] mt-1 whitespace-pre-wrap">{this.state.info}</pre>
                </details>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-grad-cta text-bg-base font-medium hover:scale-105 transition"
                onClick={this.retry}
                data-testid="admin-error-boundary-retry"
              >
                <RefreshCw size={14} /> {ru.boundary.try_again}
              </button>
              <a
                href="/admin-tools"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/15 text-white hover:bg-white/10 transition"
                data-testid="admin-error-boundary-home"
              >
                {ru.boundary.back_home}
              </a>
            </div>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}
