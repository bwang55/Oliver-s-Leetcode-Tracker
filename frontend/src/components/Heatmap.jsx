import React, { useState, useRef } from "react";

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

export default Heatmap;
