import useFlowStore from "../store/flowStore";

const typeStyle: Record<string, { bg: string; border: string }> = {
  success: { bg: "rgba(34, 197, 94, 0.15)", border: "#22c55e" },
  error: { bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444" },
  info: { bg: "rgba(0, 240, 255, 0.15)", border: "var(--accent)" },
};

export default function ToastContainer() {
  const toasts = useFlowStore((s) => s.toasts);
  const removeToast = useFlowStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => {
        const style = typeStyle[t.type] || typeStyle.info;
        return (
          <div
            key={t.id}
            className="toast-item"
            style={{ background: style.bg, borderLeft: `3px solid ${style.border}` }}
          >
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={() => removeToast(t.id)}>&times;</button>
          </div>
        );
      })}
    </div>
  );
}
