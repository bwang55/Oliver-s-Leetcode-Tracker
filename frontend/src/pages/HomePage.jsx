import React, { useMemo } from "react";
import Topbar from "../components/Topbar.jsx";
import HeroDate from "../components/HeroDate.jsx";
import Heatmap from "../components/Heatmap.jsx";
import ProgressCard from "../components/ProgressCard.jsx";
import Composer from "../components/Composer.jsx";
import Tile from "../components/Tile.jsx";
import SkeletonTile from "../components/SkeletonTile.jsx";
import { isoDayKey, fmtDayHeader } from "../lib/date.js";

function groupByDay(problems) {
  const groups = {};
  for (const p of problems) {
    const k = isoDayKey(p.solvedAt);
    (groups[k] = groups[k] || []).push(p);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
  }
  return Object.keys(groups)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((k) => ({ dayKey: k, items: groups[k], isoSample: groups[k][0].solvedAt }));
}

function HomePage(props) {
  const {
    problems, pending, heatmap, target, theme,
    onAdjustTarget, onComposerSubmit, onOpenProblem, onToggleTheme, showToast,
    onSignOut
  } = props;

  const groups = useMemo(() => groupByDay(problems), [problems]);
  const todayKey = isoDayKey(new Date().toISOString());
  const todayDone = problems.filter((p) => isoDayKey(p.solvedAt) === todayKey).length;

  const onCellClick = (cell) => {
    const k = isoDayKey(cell.dateIso);
    const el = document.getElementById("day-" + k);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1500);
    } else {
      showToast("No problems on that day yet");
    }
  };

  return (
    <div className="app">
      <Topbar
        theme={theme}
        onToggleTheme={onToggleTheme}
        onSearch={() => showToast("Search coming soon")}
        onSignOut={onSignOut || (() => showToast("Signed out (mock)"))}
      />
      <section className="hero">
        <HeroDate todayCount={todayDone} target={target} />
        <Heatmap cells={heatmap} onCellClick={onCellClick} />
        <ProgressCard done={todayDone} target={target} onAdjust={onAdjustTarget} />
      </section>
      <Composer onSubmit={onComposerSubmit} />
      {groups.length === 0 && pending === 0 && (
        <div className="empty-state">No problems yet. Paste your first solution above.</div>
      )}
      {pending > 0 && !groups.some((g) => g.dayKey === todayKey) && (
        <section className="day-section" id={"day-" + todayKey}>
          <header className="day-section-head">
            <div>
              <span className="main">{fmtDayHeader(new Date().toISOString()).main}</span>
              <span className="rel">{fmtDayHeader(new Date().toISOString()).rel}</span>
            </div>
            <span className="count">{pending} problem{pending > 1 ? "s" : ""}</span>
          </header>
          <div className="tile-grid">
            {Array.from({ length: pending }).map((_, i) => (<SkeletonTile key={i} />))}
          </div>
        </section>
      )}
      {groups.map((g) => {
        const head = fmtDayHeader(g.isoSample);
        const isToday = g.dayKey === todayKey;
        const total = g.items.length + (isToday ? pending : 0);
        return (
          <section key={g.dayKey} className="day-section" id={"day-" + g.dayKey}>
            <header className="day-section-head">
              <div>
                <span className="main">{head.main}</span>
                <span className="rel">{head.rel}</span>
              </div>
              <span className="count">{total} problem{total !== 1 ? "s" : ""}</span>
            </header>
            <div className="tile-grid">
              {isToday && Array.from({ length: pending }).map((_, i) => (<SkeletonTile key={"sk" + i} />))}
              {g.items.map((p, i) => (<Tile key={p.id} p={p} index={i} onOpen={onOpenProblem} />))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default HomePage;
