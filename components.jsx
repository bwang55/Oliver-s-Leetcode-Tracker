// =====================================================
// Shared components
// =====================================================

const { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } = React;

function attachRipple(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;
  const r = document.createElement("span");
  r.className = "ripple";
  r.style.width = r.style.height = size + "px";
  r.style.left = x + "px";
  r.style.top = y + "px";
  btn.appendChild(r);
  setTimeout(() => r.remove(), 620);
}

const Icon = {
  Search: (p) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m13 13-2.6-2.6" />
    </svg>
  ),
  Pencil: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m11.5 2.5 2 2L5 13H3v-2z" />
    </svg>
  ),
  ArrowLeft: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 3 5 8l5 5" />
    </svg>
  ),
  Plus: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  Minus: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <path d="M3 8h10" />
    </svg>
  ),
  Sun: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
    </svg>
  ),
  Moon: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M13.5 9.5A6 6 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" />
    </svg>
  ),
};

function Topbar(props) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const isDark = props.theme === "dark";
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <span>Leetcode Tracker</span>
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" aria-label="Search" onClick={props.onSearch}>
          <Icon.Search />
        </button>
        <div className="dropdown-wrap" ref={ref}>
          <button className="avatar" onClick={() => setOpen((v) => !v)} aria-label="Account">A</button>
          {open && (
            <div className="dropdown" role="menu">
              <div className="dropdown-meta">
                <div className="name">Alex Liu</div>
                <div className="email">alex@example.com</div>
              </div>
              <button className="dropdown-item" onClick={() => { props.onToggleTheme(); }}>
                {isDark ? <Icon.Sun /> : <Icon.Moon />}
                <span>{isDark ? "Light mode" : "Dark mode"}</span>
              </button>
              <button className="dropdown-item">Account</button>
              <button className="dropdown-item">Send feedback</button>
              <button className="dropdown-item" onClick={props.onSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function HeroDate({ todayCount, target }) {
  const now = new Date();
  const big = fmtBigDate(now);
  const hr = now.getHours();
  let timeOfDay = "evening";
  if (hr < 5) timeOfDay = "night";
  else if (hr < 12) timeOfDay = "morning";
  else if (hr < 18) timeOfDay = "afternoon";
  let status = "Let's solve something today.";
  if (todayCount >= target) status = todayCount + " down — goal hit. Keep going.";
  else if (todayCount > 0) status = todayCount + " down — keep going.";
  return (
    <div className="hero-date-wrap">
      <div className="hero-date">
        <span className="month">{big.month}</span> {big.day}{" "}
        <span className="year">{big.year}</span>
      </div>
      <div className="hero-greeting">
        Good {timeOfDay}, Alex.<span className="status">{status}</span>
      </div>
    </div>
  );
}

function Heatmap({ cells, onCellClick }) {
  const [tip, setTip] = useState(null);
  const hoverTimer = useRef(null);
  const total = cells.reduce((sum, c) => sum + c.count, 0);
  const levelFor = (n) => {
    if (n === 0) return 0;
    if (n === 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 3;
    return 4;
  };
  const showTip = (e, cell) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top - 12;
    hoverTimer.current = setTimeout(() => {
      setTip({ x, y, ...cell });
    }, 280);
  };
  const hideTip = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTip(null);
  };
  const tipDate = tip
    ? (() => {
        const d = new Date(tip.dateIso);
        const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
        const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
        return wd + ", " + m + " " + d.getDate();
      })()
    : "";
  return (
    <div className="card heatmap">
      <div className="heatmap-head">
        <span className="eyebrow">Last 16 weeks</span>
        <span className="heatmap-count"><span className="num">{total}</span> solved</span>
      </div>
      <div className="heatmap-grid">
        {cells.map((c, i) => (
          <div
            key={i}
            className="heatmap-cell"
            data-level={levelFor(c.count)}
            onMouseEnter={(e) => showTip(e, c)}
            onMouseLeave={hideTip}
            onClick={() => onCellClick(c)}
          />
        ))}
      </div>
      <div className="heatmap-legend">
        <span>less</span>
        <span className="dot" style={{ background: "var(--heat-0)" }} />
        <span className="dot" style={{ background: "var(--heat-1)" }} />
        <span className="dot" style={{ background: "var(--heat-2)" }} />
        <span className="dot" style={{ background: "var(--heat-3)" }} />
        <span className="dot" style={{ background: "var(--heat-4)" }} />
        <span>more</span>
      </div>
      {tip && (
        <div className="heat-tip" style={{ left: tip.x, top: tip.y, transform: "translate(-50%, -100%)" }}>
          <div className="heat-tip-main">
            {tip.count > 0 ? tip.count + " problem" + (tip.count > 1 ? "s" : "") : "No problems"}
          </div>
          <div className="heat-tip-sub">{tipDate}</div>
        </div>
      )}
    </div>
  );
}

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

function Tile({ p, index, onOpen }) {
  const visibleTags = p.tags.slice(0, 4);
  const overflow = p.tags.length - visibleTags.length;
  const delay = Math.min(index, 8) * 40;
  return (
    <button
      className="tile"
      data-difficulty={p.difficulty}
      style={{ animationDelay: delay + "ms" }}
      onClick={() => onOpen(p.id)}
    >
      <div className="tile-difficulty-stripe" />
      <div className="tile-head">
        <span className="tile-num">#{p.number}</span>
        <span className="tile-title">{p.title}</span>
      </div>
      <div className="tile-meta">
        <span className="tile-difficulty">{p.difficulty}</span>
        <span className="tile-time">{fmtTime(p.solvedAt)}</span>
      </div>
      <div className="tile-tags">
        {visibleTags.map((t) => (<span className="tag" key={t}>{t}</span>))}
        {overflow > 0 && <span className="tag-more">+{overflow}</span>}
      </div>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div className="skel">
      <div className="skel-bar short" />
      <div className="skel-bar tall" />
      <div className="skel-pills">
        <span className="skel-pill" style={{ width: 50 }} />
        <span className="skel-pill" style={{ width: 64 }} />
        <span className="skel-pill" style={{ width: 38 }} />
      </div>
    </div>
  );
}

function Toast({ message, onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 2400);
    const t2 = setTimeout(() => onDone && onDone(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return <div className={"toast" + (out ? " out" : "")}>{message}</div>;
}

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

const SLOT_OPEN = "@@SLOT_";
const SLOT_CLOSE = "_END@@";

function highlight(code, lang) {
  if (!code) return "";
  let out = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const slots = [];
  const slot = (cls, content) => {
    slots.push({ cls, content });
    return SLOT_OPEN + (slots.length - 1) + SLOT_CLOSE;
  };

  if (lang === "python") {
    out = out.replace(/(#.*)$/gm, (m) => slot("tok-com", m));
  } else {
    out = out.replace(/(\/\/.*)$/gm, (m) => slot("tok-com", m));
    out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => slot("tok-com", m));
  }

  out = out.replace(/("(?:\\.|[^"\\])*")/g, (m) => slot("tok-str", m));
  out = out.replace(/('(?:\\.|[^'\\])*')/g, (m) => slot("tok-str", m));

  out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => slot("tok-num", m));

  const kws = {
    python: ["def","class","return","if","elif","else","for","while","in","not","and","or","import","from","as","with","try","except","finally","raise","is","lambda","yield","pass","break","continue","None","True","False","self"],
    cpp: ["class","public","private","protected","int","void","return","if","else","for","while","auto","const","static","new","delete","this","using","namespace","template","typename","vector","string","unordered_map","map","list","pair","function","include","struct","virtual","override","nullptr","true","false"],
    java: ["class","public","private","protected","static","final","void","int","return","if","else","for","while","new","this","import","package","extends","implements","interface","abstract","try","catch","finally","throw","throws","null","true","false","Map","HashMap","List","Integer"],
  };
  const list = kws[lang] || [];
  if (list.length) {
    const re = new RegExp("\\b(" + list.join("|") + ")\\b", "g");
    out = out.replace(re, (m) => slot("tok-kw", m));
  }

  out = out.replace(/(?<![\w@])([A-Z][A-Za-z0-9_]*)\b/g, (m) => slot("tok-cls", m));
  out = out.replace(/([a-z_][A-Za-z0-9_]*)(?=\()/g, (m) => slot("tok-fn", m));

  const restoreRe = new RegExp(SLOT_OPEN.replace(/[@]/g, "@") + "(\\d+)" + SLOT_CLOSE.replace(/[@]/g, "@"), "g");
  out = out.replace(restoreRe, (_, i) => {
    const s = slots[+i];
    return '<span class="' + s.cls + '">' + s.content + '</span>';
  });
  return out;
}

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

function TagList({ tags, onChange }) {
  const remove = (t) => onChange(tags.filter((x) => x !== t));
  const add = () => {
    const v = window.prompt("Add tag");
    if (v && v.trim()) onChange([...tags, v.trim().toLowerCase()]);
  };
  return (
    <div className="detail-tags">
      {tags.map((t) => (
        <span className="tag" key={t} onClick={() => remove(t)}>
          {t}
          <span className="x">×</span>
        </span>
      ))}
      <button className="tag-add" onClick={add}>+ add tag</button>
    </div>
  );
}

function Prose({ text }) {
  const parts = text.split(/\n\n+/);
  return (
    <div className="detail-prose">
      {parts.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{
          __html: p
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/`([^`]+)`/g, "<code>$1</code>"),
        }} />
      ))}
    </div>
  );
}

Object.assign(window, {
  Topbar, HeroDate, Heatmap, ProgressCard, Composer,
  Tile, SkeletonTile, Toast, TargetModal, CodeBlock, TagList, Prose,
  Icon, attachRipple,
});
