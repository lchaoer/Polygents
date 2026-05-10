import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastKind = "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  showError: (msg: string) => void;
  showInfo: (msg: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
const DEDUPE_WINDOW_MS = 3000;
const TOAST_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const recentRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const key = `${kind}::${message}`;
      const now = Date.now();
      const last = recentRef.current.get(key) ?? 0;
      if (now - last < DEDUPE_WINDOW_MS) return;
      recentRef.current.set(key, now);
      const id = now + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      showError: (m) => push("error", m),
      showInfo: (m) => push("info", m),
    }),
    [push]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            style={{ "--toast-duration": `${TOAST_DURATION_MS}ms` } as React.CSSProperties}
          >
            <div className="toast-message">{t.message}</div>
            <button
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
            <div className="toast-progress" />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within ToastProvider");
  return v;
}
