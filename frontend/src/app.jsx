// =====================================================
// App root, HomePage, DetailPage
// =====================================================

const { useState, useEffect, useMemo, useRef } = React;

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
        onSignOut={() => showToast("Signed out (mock)")}
      />

      <section className="hero">
        <HeroDate todayCount={todayDone} target={target} />
        <Heatmap cells={heatmap} onCellClick={onCellClick} />
        <ProgressCard done={todayDone} target={target} onAdjust={onAdjustTarget} />
      </section>

      <Composer onSubmit={onComposerSubmit} />

      {groups.length === 0 && pending === 0 ? (
        <div className="empty-state">No problems yet. Paste your first solution above.</div>
      ) : null}

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
              {isToday && Array.from({ length: pending }).map((_, i) => (
                <SkeletonTile key={"sk" + i} />
              ))}
              {g.items.map((p, i) => (
                <Tile key={p.id} p={p} index={i} onOpen={onOpenProblem} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DetailPage({ problem, onBack, onUpdate }) {
  const head = fmtDayHeader(problem.solvedAt);
  const setTags = (tags) => onUpdate({ ...problem, tags });
  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        <Icon.ArrowLeft /> Back to tracker
      </button>

      <div className="detail-meta">
        #{problem.number} <span style={{ margin: "0 6px" }}>·</span>
        <span className="diff" data-difficulty={problem.difficulty}>{problem.difficulty}</span>
        <span style={{ margin: "0 6px" }}>·</span>
        solved {head.rel} at {fmtTime(problem.solvedAt)}
      </div>

      <h1 className="detail-title">{problem.title}</h1>

      <TagList tags={problem.tags} onChange={setTags} />

      <div className="section-label">Problem</div>
      <Prose text={problem.description} />

      {problem.constraints && problem.constraints.length > 0 && (
        <>
          <div className="section-label">Constraints</div>
          <ul className="constraints">
            {problem.constraints.map((c, i) => (<li key={i}>{c}</li>))}
          </ul>
        </>
      )}

      <div className="section-label">Solution</div>
      <CodeBlock solutions={problem.solutions} />

      {problem.note && (
        <>
          <div className="section-label">My take</div>
          <div className="note-block">
            <span className="label">Note ·</span>
            {problem.note}
          </div>
        </>
      )}
    </div>
  );
}

const STORAGE_KEY = "lc-tracker:v1";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function savePrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) {}
}

function App() {
  const [problems, setProblems] = useState(SAMPLE_PROBLEMS);
  const [pending, setPending] = useState(0);
  const [heatmap] = useState(() => buildHeatmap());
  const [route, setRoute] = useState({ name: "home" });
  const [toast, setToast] = useState(null);
  const [showTarget, setShowTarget] = useState(false);

  const initial = loadPrefs();
  const [theme, setTheme] = useState(initial.theme || "light");
  const [dailyTarget, setDailyTarget] = useState(initial.dailyTarget || 3);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = "terracotta";
    savePrefs({ theme, dailyTarget });
  }, [theme, dailyTarget]);

  const showToast = (msg) => setToast({ msg, key: Date.now() });
  const onToggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const onComposerSubmit = (text) => {
    setPending((n) => n + 1);
    const delay = 2400 + Math.random() * 1200;
    setTimeout(() => {
      const usedNums = new Set(problems.map((p) => p.number));
      const candidates = FAKE_BANK.filter((b) => !usedNums.has(b.number));
      const pick = candidates[Math.floor(Math.random() * candidates.length)] || FAKE_BANK[0];
      const id = "p_" + Math.random().toString(36).slice(2, 9);
      const desc = text.length > 30
        ? "Auto-extracted from your solution. " + pick.title + " — given the relevant inputs, return the expected output.\n\nThe pasted code follows below in the solution panel; this stub will be replaced with the full problem statement once your backend is wired up."
        : pick.title + " — full problem statement will appear here once your backend is wired up.";
      const newProblem = {
        id,
        number: pick.number,
        title: pick.title,
        difficulty: pick.difficulty,
        tags: pick.tags,
        solvedAt: new Date().toISOString(),
        description: desc,
        constraints: [],
        solutions: {
          python: text.length > 30 ? text : "# your " + pick.title + " solution will appear here",
          cpp: "// " + pick.title + " — paste your C++ solution to see it here",
          java: "// " + pick.title + " — paste your Java solution to see it here",
        },
        note: "",
      };
      setProblems((arr) => [newProblem, ...arr]);
      setPending((n) => Math.max(0, n - 1));
    }, delay);
  };

  const onOpenProblem = (id) => {
    setRoute({ name: "detail", id });
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const onBack = () => setRoute({ name: "home" });
  const onUpdateProblem = (p) => setProblems((arr) => arr.map((x) => (x.id === p.id ? p : x)));

  const detailProblem = route.name === "detail" ? problems.find((p) => p.id === route.id) : null;

  return (
    <>
      {route.name === "home" && (
        <HomePage
          problems={problems}
          pending={pending}
          heatmap={heatmap}
          target={dailyTarget}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onAdjustTarget={() => setShowTarget(true)}
          onComposerSubmit={onComposerSubmit}
          onOpenProblem={onOpenProblem}
          showToast={showToast}
        />
      )}
      {route.name === "detail" && detailProblem && (
        <DetailPage
          problem={detailProblem}
          onBack={onBack}
          onUpdate={onUpdateProblem}
        />
      )}

      {showTarget && (
        <TargetModal
          value={dailyTarget}
          onSave={(v) => {
            setDailyTarget(v);
            setShowTarget(false);
            showToast("Daily target set to " + v);
          }}
          onCancel={() => setShowTarget(false)}
        />
      )}

      {toast && (
        <Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
