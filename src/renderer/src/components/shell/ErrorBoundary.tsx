import React from "react";

interface State {
  err: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ChaseJoy renderer crash]", error, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="max-w-lg rounded-lg border border-cj-err/40 bg-cj-panel p-6">
            <div className="mb-2 text-base font-semibold text-cj-err">Something went wrong</div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-cj-bg p-3 text-xs text-slate-200">
{this.state.err.stack ?? this.state.err.message}
            </pre>
            <button
              onClick={() => this.setState({ err: null })}
              className="mt-3 btn-primary"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
