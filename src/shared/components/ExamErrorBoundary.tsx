import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ExamErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ExamErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground text-center max-w-md">
            An unexpected error occurred while loading the exam. Please refresh the page and try again.
          </p>
          <details className="mt-2 text-xs text-muted-foreground max-w-lg w-full bg-muted rounded-lg p-3 overflow-auto">
            <summary className="cursor-pointer font-semibold mb-1">Error details</summary>
            <pre className="whitespace-pre-wrap break-words">{error.message}</pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
