import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Catches render errors so one bad screen shows a friendly message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui]', error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">The page hit an unexpected problem. Reloading usually fixes it. Your saved data is safe.</p>
          <button className="btn-premium mt-5 px-5 py-2.5" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
