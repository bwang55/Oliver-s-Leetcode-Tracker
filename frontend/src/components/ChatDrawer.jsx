import React, { useState, useRef, useEffect } from "react";
import { streamChat } from "../lib/chat.js";
import ToolCallCard from "./ToolCallCard.jsx";

function ChatDrawer({ open, onClose, initialMessage, onSessionUpdated }) {
  const [messages, setMessages] = useState([]); // {role, content, toolCalls?}
  const [pendingTools, setPendingTools] = useState([]); // active tool cards
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [route, setRoute] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (open && initialMessage && !streaming) {
      setInput(initialMessage);
      send(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMessage]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, pendingTools]);

  const send = async (text) => {
    if (!text.trim() || streaming) return;
    setStreaming(true);
    setRoute(null);

    // Append user message
    const userMsg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    // Stream
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

  if (!open) return null;
  return (
    <div className="chat-drawer-backdrop" onClick={onClose}>
      <div className="chat-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="chat-drawer-head">
          <h3>Assistant {route && <span className="chat-drawer-route">· {route}</span>}</h3>
          <button className="chat-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="chat-drawer-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="chat-drawer-empty">
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
          {streaming && <div className="chat-drawer-streaming">…thinking</div>}
        </div>
        <div className="chat-drawer-foot">
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
      </div>
    </div>
  );
}

export default ChatDrawer;
