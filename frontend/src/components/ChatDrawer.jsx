import React, { useState, useRef, useEffect } from "react";
import { streamChat } from "../lib/chat.js";
import ToolCallCard from "./ToolCallCard.jsx";

// Always-docked chat panel. Lives in the right column of `.layout-shell`.
// `pendingMessage` is `{text, ts}` (or null) — the parent bumps `ts` each time
// it wants the chat to send something on its behalf (e.g. composer paste).
//
// `events` is a single chronological timeline so tool cards interleave with
// user/assistant messages instead of all sinking to the bottom. Each entry:
//   { kind: "user",      content }
//   { kind: "assistant", content }   ← accumulates streaming text deltas
//   { kind: "tool",      id, tool, args, result?, error?, durationMs? }
function ChatDrawer({ pendingMessage, onSessionUpdated }) {
  const [events, setEvents] = useState([]);
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
  }, [events]);

  const send = async (text) => {
    if (!text.trim() || streaming) return;
    setStreaming(true);
    setRoute(null);
    setEvents((arr) => [...arr, { kind: "user", content: text }]);
    setInput("");

    // Whether the latest assistant turn is "open" (i.e. last event is an
    // assistant text bubble we should append further deltas to). Reset to false
    // whenever a tool card lands so subsequent thinking goes into a NEW bubble.
    let appendingToAssistant = false;

    try {
      for await (const ev of streamChat({ message: text, sessionId })) {
        if (ev.type === "session") setSessionId(ev.data.sessionId);
        if (ev.type === "route") setRoute(ev.data.route);

        if (ev.type === "thinking") {
          const delta = ev.data.delta || "";
          if (!delta) continue;
          if (appendingToAssistant) {
            setEvents((arr) => {
              const last = arr[arr.length - 1];
              if (last && last.kind === "assistant") {
                return [...arr.slice(0, -1), { ...last, content: (last.content || "") + delta }];
              }
              return [...arr, { kind: "assistant", content: delta }];
            });
          } else {
            setEvents((arr) => [...arr, { kind: "assistant", content: delta }]);
            appendingToAssistant = true;
          }
        }

        if (ev.type === "tool_call") {
          appendingToAssistant = false;
          setEvents((arr) => [
            ...arr,
            { kind: "tool", id: ev.data.id, tool: ev.data.tool, args: ev.data.args }
          ]);
        }

        if (ev.type === "tool_result") {
          setEvents((arr) =>
            arr.map((e) =>
              e.kind === "tool" && e.id === ev.data.id
                ? { ...e, result: ev.data.result, error: ev.data.error, durationMs: ev.data.durationMs }
                : e
            )
          );
        }

        if (ev.type === "session_saved") {
          if (onSessionUpdated) onSessionUpdated(ev.data.sessionId);
        }

        if (ev.type === "error") {
          setEvents((arr) => [...arr, { kind: "assistant", content: "⚠ " + (ev.data.message || "Backend error") }]);
        }

        if (ev.type === "session_save_failed") {
          console.warn("session save failed:", ev.data.error);
        }
      }
    } catch (e) {
      setEvents((arr) => [...arr, { kind: "assistant", content: "Error: " + e.message }]);
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
    setEvents([]);
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
          disabled={streaming || events.length === 0}
          aria-label="New conversation"
          title="New conversation"
        >
          New
        </button>
      </div>
      <div className="chat-panel-body" ref={bodyRef}>
        {events.length === 0 && (
          <div className="chat-panel-empty">
            Try: <em>"I just did Two Sum"</em> · <em>"Analyze my weak spots"</em> · <em>"Plan me 5 days on graphs"</em>
          </div>
        )}
        {events.map((e, i) => {
          if (e.kind === "tool") return <ToolCallCard key={`t-${e.id}`} {...e} />;
          return (
            <div key={`m-${i}`} className={`chat-msg chat-msg-${e.kind}`}>
              {e.content}
            </div>
          );
        })}
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
