import React, { useState, useRef, useEffect } from "react";
import { streamChat } from "../lib/chat.js";
import ToolCallCard from "./ToolCallCard.jsx";

// Always-docked chat panel. Lives in the right column of `.layout-shell`.
// `pendingMessage` is `{text, ts}` (or null) — the parent bumps `ts` each time
// it wants the chat to send something on its behalf (e.g. composer paste).
function ChatDrawer({ pendingMessage, onSessionUpdated }) {
  const [messages, setMessages] = useState([]);
  const [pendingTools, setPendingTools] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [route, setRoute] = useState(null);
  const bodyRef = useRef(null);
  const lastSentTsRef = useRef(null);

  useEffect(() => {
    if (!pendingMessage || streaming) return;
    if (pendingMessage.ts === lastSentTsRef.current) return;
    lastSentTsRef.current = pendingMessage.ts;
    send(pendingMessage.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, pendingTools]);

  const send = async (text) => {
    if (!text.trim() || streaming) return;
    setStreaming(true);
    setRoute(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");

    let assistantContent = "";
    try {
      for await (const ev of streamChat({ message: text, sessionId })) {
        if (ev.type === "session") setSessionId(ev.data.sessionId);
        if (ev.type === "route") setRoute(ev.data.route);
        if (ev.type === "thinking") {
          assistantContent += ev.data.delta;
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last && last.role === "assistant") {
              return [...m.slice(0, -1), { ...last, content: assistantContent }];
            }
            return [...m, { role: "assistant", content: assistantContent }];
          });
        }
        if (ev.type === "tool_call") {
          const card = { id: ev.data.id, tool: ev.data.tool, args: ev.data.args };
          setPendingTools((t) => [...t, card]);
        }
        if (ev.type === "tool_result") {
          setPendingTools((t) =>
            t.map((c) =>
              c.id === ev.data.id
                ? { ...c, result: ev.data.result, error: ev.data.error, durationMs: ev.data.durationMs }
                : c
            )
          );
        }
        if (ev.type === "session_saved") {
          if (onSessionUpdated) onSessionUpdated(ev.data.sessionId);
        }
        if (ev.type === "error") {
          setMessages((m) => [...m, { role: "assistant", content: "⚠ " + (ev.data.message || "Backend error") }]);
        }
        if (ev.type === "session_save_failed") {
          console.warn("session save failed:", ev.data.error);
        }
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error: " + e.message }]);
    } finally {
      setStreaming(false);
    }
  };

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send(input);
    }
  };

  const clearChat = () => {
    if (streaming) return;
    setMessages([]);
    setPendingTools([]);
    setSessionId(null);
    setRoute(null);
    setInput("");
  };

  return (
    <aside className="chat-panel">
      <div className="chat-panel-head">
        <h3>Assistant {route && <span className="chat-panel-route">· {route}</span>}</h3>
        <button
          className="chat-panel-clear"
          onClick={clearChat}
          disabled={streaming || messages.length === 0}
          aria-label="New conversation"
          title="New conversation"
        >
          New
        </button>
      </div>
      <div className="chat-panel-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="chat-panel-empty">
            Try: <em>"I just did Two Sum"</em> · <em>"Analyze my weak spots"</em> · <em>"Plan me 5 days on graphs"</em>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg-${m.role}`}>
            {m.content}
          </div>
        ))}
        {pendingTools.map((tc) => (
          <ToolCallCard key={tc.id} {...tc} />
        ))}
        {streaming && <div className="chat-panel-streaming">…thinking</div>}
      </div>
      <div className="chat-panel-foot">
        <textarea
          placeholder="Type a message… ⌘↵ to send"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={streaming}
        />
        <button className="btn btn-primary" onClick={() => send(input)} disabled={streaming || !input.trim()}>
          Send
        </button>
      </div>
    </aside>
  );
}

export default ChatDrawer;
