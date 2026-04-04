import { useState, useRef, useEffect, useCallback } from "react";
import { API_BASE } from "../config";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface MetaAgentChatProps {
  onTeamPreview: (config: Record<string, unknown>) => void;
  onTeamCreated?: (data: {
    template_id: string;
    name: string;
    agents_created: string[];
  }) => void;
  onSessionId: (id: string) => void;
  sessionId: string | null;
}

export default function MetaAgentChat({
  onTeamPreview,
  onTeamCreated,
  onSessionId,
  sessionId,
}: MetaAgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming(true);

    // Add empty assistant message placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${API_BASE}/api/meta-agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === "session") {
              onSessionId(event.session_id);
            } else if (event.type === "text_delta") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + event.content,
                  };
                }
                return updated;
              });
            } else if (event.type === "team_preview") {
              onTeamPreview(event.config);
            } else if (event.type === "team_created") {
              onTeamPreview(event.config);
              onTeamCreated?.({
                template_id: event.template_id,
                name: event.name,
                agents_created: event.agents_created,
              });
            } else if (event.type === "team_error") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + `\n\n[Team creation failed: ${event.error}]`,
                  };
                }
                return updated;
              });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: "Connection failed, please retry",
          };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, sessionId, onSessionId, onTeamPreview, onTeamCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="meta-chat">
      <div className="meta-chat-messages">
        {messages.length === 0 && (
          <div className="meta-chat-welcome">
            <h3>Team Creation Assistant</h3>
            <p>Describe the task you want to accomplish, and I'll help you design the best Agent team.</p>
            <div className="meta-chat-suggestions">
              {[
                "I need a team to develop a REST API",
                "Help me create a market research team",
                "I want to build a content creation team",
              ].map((s) => (
                <button
                  key={s}
                  className="meta-chat-suggestion"
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`meta-chat-bubble meta-chat-${msg.role}`}>
            <div className="meta-chat-bubble-label">
              {msg.role === "user" ? "You" : "Meta-Agent"}
            </div>
            <div className="meta-chat-bubble-content">
              {msg.content || (streaming && i === messages.length - 1 ? "..." : "")}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="meta-chat-input-area">
        <textarea
          ref={inputRef}
          className="meta-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your requirements..."
          rows={2}
          disabled={streaming}
        />
        <button
          className="meta-chat-send"
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
        >
          {streaming ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}
