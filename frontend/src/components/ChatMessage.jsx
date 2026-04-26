import React from "react";

function ChatMessage({ role, content, toolCalls }) {
  return (
    <div className={`chat-msg chat-msg-${role}`}>
      {content && <div className="chat-msg-text">{content}</div>}
      {toolCalls && toolCalls.length > 0 && (
        <div className="chat-msg-tools">
          {toolCalls.map((tc, i) => (
            <div key={i} className="chat-msg-tool-ref">⚙ {tc.tool}</div>
          ))}
        </div>
      )}
    </div>
  );
}
export default ChatMessage;
