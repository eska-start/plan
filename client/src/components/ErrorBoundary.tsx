import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8" style={{ background: "#f8fafc" }}>
          <div className="flex flex-col items-center w-full max-w-md p-8 gap-4">
            <AlertTriangle size={40} style={{ color: "#ef4444" }} />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#1e293b" }}>오류가 발생했습니다</h2>
            <p style={{ fontSize: "0.875rem", color: "#64748b", textAlign: "center" }}>
              세션 정보가 손상되었을 수 있습니다.<br />세션 초기화 후 다시 시도해보세요.
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
              <a
                href="/api/auth/clear"
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "8px 16px", borderRadius: "8px",
                  background: "#6366f1", color: "white",
                  textDecoration: "none", fontSize: "0.875rem", fontWeight: 500,
                }}
              >
                <RotateCcw size={14} />
                세션 초기화
              </a>
              <button
                onClick={() => window.location.reload()}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "8px 16px", borderRadius: "8px",
                  background: "#e2e8f0", color: "#1e293b",
                  border: "none", cursor: "pointer",
                  fontSize: "0.875rem", fontWeight: 500,
                }}
              >
                새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
