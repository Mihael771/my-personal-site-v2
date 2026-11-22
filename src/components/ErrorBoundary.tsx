import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Възникна неочаквана грешка.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#080B11] px-4 py-12 text-slate-100">
          <div className="w-full max-w-lg rounded-2xl border border-rose-500/35 bg-[#0F141F] p-6 sm:p-8">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <h1 className="font-display text-xl font-bold text-white">
                Грешка в приложението
              </h1>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Възникна проблем при обработката на данните или визуализацията.
            </p>
            {this.state.message && (
              <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-white/10 bg-[#080B11] p-3 font-mono text-xs text-slate-400">
                {this.state.message}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#3B82F6] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
            >
              <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Презареди приложението</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
