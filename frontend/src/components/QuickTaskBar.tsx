import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";

export default function QuickTaskBar() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const addToast = useFlowStore((s) => s.addToast);
  const navigate = useNavigate();
  const resultRef = useRef<HTMLPreElement>(null);

  const runQuickTask = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult("");
    setError("");
    setDone(false);

    try {
      const res = await fetch(`${API_BASE}/api/workflows/quick-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);
            if (event.type === "text_delta") {
              setResult((prev) => prev + event.content);
              if (resultRef.current) {
                resultRef.current.scrollTop = resultRef.current.scrollHeight;
              }
            } else if (event.type === "completed") {
              setDone(true);
            } else if (event.type === "error") {
              setError(event.detail || "Unknown error");
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
      if (!error) setDone(true);
    }
  };

  const saveAsWorkflow = async () => {
    const name = prompt.trim().slice(0, 30) || "Quick Task";
    try {
      const res = await fetch(`${API_BASE}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: prompt.trim(),
          type: "single",
          default_prompt: prompt.trim(),
          agent_config: {
            id: `wf-${name.replace(/[^\w\u4e00-\u9fff]/g, "-").slice(0, 32)}`,
            role: "Assistant",
            system_prompt:
              "You are a helpful assistant. Complete the user's task directly and concisely.",
            tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      addToast("success", `Saved as workflow "${name}"`);
      navigate("/");
    } catch {
      addToast("error", "Failed to save workflow");
    }
  };

  return (
    <div className="quick-task-bar">
      <div className="quick-task-input-row">
        <input
          className="quick-task-input"
          type="text"
          placeholder="Describe your task..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runQuickTask()}
          disabled={loading}
        />
        <button
          className="quick-task-run-btn"
          onClick={runQuickTask}
          disabled={loading || !prompt.trim()}
        >
          {loading ? "Running..." : "Run ▶"}
        </button>
      </div>

      {(result || error || loading) && (
        <div className="quick-task-result-area">
          {error ? (
            <div className="quick-task-error">{error}</div>
          ) : (
            <pre className="quick-task-result" ref={resultRef}>
              {result || (loading ? "Waiting for response..." : "")}
            </pre>
          )}
          {done && result && (
            <div className="quick-task-actions">
              <button className="quick-task-save-btn" onClick={saveAsWorkflow}>
                Save as Workflow
              </button>
              <button
                className="quick-task-close-btn"
                onClick={() => {
                  setResult("");
                  setDone(false);
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
