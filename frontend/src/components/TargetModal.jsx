import React, { useState } from "react";
import Icon from "./Icon.jsx";
import { attachRipple } from "../lib/ripple.js";

function TargetModal({ value, onSave, onCancel }) {
  const [v, setV] = useState(value);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Daily target</h3>
        <p>How many problems do you want to clear each day?</p>
        <div className="target-stepper">
          <button className="step-btn" disabled={v <= 1} onClick={() => setV((x) => Math.max(1, x - 1))}>
            <Icon.Minus />
          </button>
          <div className="num">{v}</div>
          <button className="step-btn" disabled={v >= 20} onClick={() => setV((x) => Math.min(20, x + 1))}>
            <Icon.Plus />
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={(e) => { attachRipple(e); onSave(v); }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default TargetModal;
