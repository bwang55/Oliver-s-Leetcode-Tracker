import React from "react";
import Icon from "./Icon.jsx";

function ProgressCard({ done, target, onAdjust }) {
  const pct = Math.min(100, Math.round((done / target) * 100));
  return (
    <div className="card progress-card">
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Today's plan</div>
        <div className="progress-row">
          <span className="ratio">
            {done}<span className="target"> / {target}</span>
          </span>
          <span style={{ color: "var(--ink-faint)" }}>{pct}%</span>
        </div>
      </div>
      <div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: pct + "%" }} />
        </div>
        <button className="adjust-target" onClick={onAdjust} style={{ marginTop: 12 }}>
          <Icon.Pencil /> adjust target
        </button>
      </div>
    </div>
  );
}

export default ProgressCard;
