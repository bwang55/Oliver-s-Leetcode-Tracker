import React from "react";
import { fmtTime } from "../lib/date.js";

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

export default Tile;
