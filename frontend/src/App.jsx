import React, { useState, useEffect } from "react";
import HomePage from "./pages/HomePage.jsx";
import DetailPage from "./pages/DetailPage.jsx";
import TargetModal from "./components/TargetModal.jsx";
import Toast from "./components/Toast.jsx";
import { SAMPLE_PROBLEMS, FAKE_BANK, buildHeatmap } from "./lib/sample-data.js";

const STORAGE_KEY = "lc-tracker:v1";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function savePrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
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
          java: "// " + pick.title + " — paste your Java solution to see it here"
        },
        note: ""
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
        <DetailPage problem={detailProblem} onBack={onBack} onUpdate={onUpdateProblem} />
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
      {toast && (<Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} />)}
    </>
  );
}

export default App;
