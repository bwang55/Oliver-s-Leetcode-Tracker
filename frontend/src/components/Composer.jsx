import React, { useState, useEffect, useRef } from "react";
import { attachRipple } from "../lib/ripple.js";

function Composer({ onSubmit }) {
  const [val, setVal] = useState("");
  const taRef = useRef(null);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(320, Math.max(84, ta.scrollHeight)) + "px";
  }, [val]);
  const submit = (e) => {
    if (e) attachRipple(e);
    if (!val.trim()) return;
    onSubmit(val.trim());
    setVal("");
  };
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="card composer">
      <div className="composer-head">
        <span className="pulse-dot" />
        <span className="eyebrow">Paste a solution</span>
      </div>
      <textarea
        ref={taRef}
        className="composer-textarea"
        placeholder="Paste your code, or your messy attempt. We'll figure out the problem, tags, and difficulty."
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="composer-foot">
        <span className="composer-hint">
          Press <span className="kbd">⌘</span><span className="kbd">↵</span> to add
        </span>
        <button className="btn btn-primary" onClick={submit} disabled={!val.trim()}>
          Add to tracker
        </button>
      </div>
    </div>
  );
}

export default Composer;
