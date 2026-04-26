import React, { useMemo, useState, useLayoutEffect, useRef } from "react";
import { highlight } from "../lib/highlight.js";

function CodeBlock({ solutions }) {
  const tabs = useMemo(() => [
    { key: "python", label: "Python" },
    { key: "cpp", label: "C++" },
    { key: "java", label: "Java" },
  ], []);
  const [active, setActive] = useState("python");
  const [copied, setCopied] = useState(false);
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
  const onCopy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(solutions[active] || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
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
          >
            {t.label}
          </button>
        ))}
        <span className="code-tab-indicator" style={{ left: indicator.left, width: indicator.width }} />
        <button className={"code-copy" + (copied ? " copied" : "")} onClick={onCopy}>
          {copied ? "✓ copied" : "Copy"}
        </button>
      </div>
      <pre className="code-pre" dangerouslySetInnerHTML={{ __html: highlight(solutions[active] || "", active) }} />
    </div>
  );
}

export default CodeBlock;
