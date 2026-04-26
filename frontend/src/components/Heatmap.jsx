import React, { useState, useRef, useEffect, useMemo } from "react";
import { isoDayKey } from "../lib/date.js";

// Build a Map<dayKey, count> from a flat list of solved problems.
function dailyCounts(problems) {
  const m = new Map();
  for (const p of problems || []) {
    const k = isoDayKey(p.solvedAt);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// Build the trailing N-week grid. `weeks` columns × 7 rows. Latest day is the
// bottom-right cell.
function buildCells(counts, weeks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const total = weeks * 7;
  const cells = new Array(total);
  for (let i = total - 1, idx = 0; i >= 0; i--, idx++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells[idx] = { count: counts.get(key) || 0, dateIso: d.toISOString() };
  }
  return cells;
}

const MIN_WEEKS = 4;
const MAX_WEEKS = 60;

function Heatmap({ problems, onCellClick }) {
  const [weeks, setWeeks] = useState(16);
  const [tip, setTip] = useState(null);
  const gridRef = useRef(null);
  const hoverTimer = useRef(null);

  const counts = useMemo(() => dailyCounts(problems), [problems]);
  const cells = useMemo(() => buildCells(counts, weeks), [counts, weeks]);
  const total = useMemo(() => cells.reduce((s, c) => s + c.count, 0), [cells]);

  // Compute how many columns fit. We want square-ish cells, so we derive the
  // column count from the row size: cellSize ≈ height / 7, cols = width / cellSize.
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      // Allow for grid padding (8px) and gaps; we approximate by using the raw
      // box and letting `floor` round down.
      if (width <= 0 || height <= 0) return;
      const rowSize = height / 7;
      const cols = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.floor(width / rowSize)));
      setWeeks((prev) => (prev !== cols ? cols : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
        const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
        return wd + ", " + m + " " + d.getDate();
      })()
    : "";

  return (
    <div className="card heatmap">
      <div className="heatmap-head">
        <span className="eyebrow">Last {weeks} weeks</span>
        <span className="heatmap-count"><span className="num">{total}</span> solved</span>
      </div>
      <div
        className="heatmap-grid"
        ref={gridRef}
        style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}
      >
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
        <div className="heat-tip" style={{ left: tip.x, top: tip.y }}>
          <div className="heat-tip-main">
            {tip.count > 0 ? tip.count + " problem" + (tip.count > 1 ? "s" : "") : "No problems"}
          </div>
          <div className="heat-tip-sub">{tipDate}</div>
        </div>
      )}
    </div>
  );
}

export default Heatmap;
