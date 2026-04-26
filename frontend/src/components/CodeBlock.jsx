import React, { useMemo, useState, useLayoutEffect, useRef, useEffect } from "react";
import { highlight } from "../lib/highlight.js";

function CodeBlock({ solutions, onSave }) {
  const tabs = useMemo(() => [
    { key: "python", label: "Python" },
    { key: "cpp", label: "C++" },
    { key: "java", label: "Java" }
  ], []);
  const [active, setActive] = useState("python");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const tabsWrapRef = useRef(null);
  const tabRefs = useRef({});

  useLayoutEffect(() => {
    const el = tabRefs.current[active];
    const wrap = tabsWrapRef.current;
    if (el && wrap) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [active]);

  // When the active tab changes while editing, refresh the draft from that tab's
  // current source so the textarea always shows the correct language.
  useEffect(() => {
    if (editing) setDraft((solutions && solutions[active]) || "");
  }, [active, editing, solutions]);

  const onCopy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText((solutions && solutions[active]) || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const startEdit = () => {
    setDraft((solutions && solutions[active]) || "");
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
  };
  const saveEdit = () => {
    if (!onSave) {
      setEditing(false);
      return;
    }
    const next = { python: "", cpp: "", java: "", ...(solutions || {}), [active]: draft };
    onSave(next);
    setEditing(false);
  };

  return (
    <div className="code-block">
      <div className="code-tabs" ref={tabsWrapRef}>
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => (tabRefs.current[t.key] = el)}
            className={"code-tab" + (active === t.key ? " active" : "")}
            onClick={() => setActive(t.key)}
            disabled={editing}
          >
            {t.label}
          </button>
        ))}
        <span className="code-tab-indicator" style={{ left: indicator.left, width: indicator.width }} />

        {editing ? (
          <div className="code-actions">
            <button className="code-action code-cancel" onClick={cancelEdit}>Cancel</button>
            <button className="code-action code-save" onClick={saveEdit}>Save</button>
          </div>
        ) : (
          <div className="code-actions">
            <button className={"code-action code-copy" + (copied ? " copied" : "")} onClick={onCopy}>
              {copied ? "✓ copied" : "Copy"}
            </button>
            {onSave && (
              <button className="code-action code-edit" onClick={startEdit} title="Edit this solution">
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          className="code-edit-area"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          autoFocus
        />
      ) : (
        <pre
          className="code-pre"
          dangerouslySetInnerHTML={{ __html: highlight((solutions && solutions[active]) || "", active) }}
        />
      )}
    </div>
  );
}

export default CodeBlock;
