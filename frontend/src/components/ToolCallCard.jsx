import React, { useState } from "react";

function ToolCallCard({ id, tool, args, result, error, durationMs }) {
  const [expanded, setExpanded] = useState(false);
  const status = error ? "error" : result !== undefined ? "ok" : "pending";
  return (
    <div className={`tool-card tool-card-${status}`} onClick={() => setExpanded((x) => !x)}>
      <div className="tool-card-head">
        <span className="tool-card-icon">⚙</span>
        <span className="tool-card-name">{tool}</span>
        {durationMs !== undefined && <span className="tool-card-time">{durationMs}ms</span>}
        <span className="tool-card-status">{status === "ok" ? "✓" : status === "error" ? "⚠" : "…"}</span>
      </div>
      {expanded && (
        <div className="tool-card-body">
          <div className="tool-card-args">
            <strong>args:</strong>
            <pre>{JSON.stringify(args, null, 2)}</pre>
          </div>
          {result !== undefined && (
            <div className="tool-card-result">
              <strong>result:</strong>
              <pre>{JSON.stringify(result, null, 2).slice(0, 1000)}</pre>
            </div>
          )}
          {error && (
            <div className="tool-card-error">
              <strong>error:</strong> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default ToolCallCard;
