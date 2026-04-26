import React, { useState, useEffect, useCallback } from "react";
import { getCurrentUser, signOut as amplifySignOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import HomePage from "./pages/HomePage.jsx";
import DetailPage from "./pages/DetailPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import TargetModal from "./components/TargetModal.jsx";
import Toast from "./components/Toast.jsx";
import ChatDrawer from "./components/ChatDrawer.jsx";
import {
  ensureUser, listMyProblems, updateMyDailyTarget, updateProblemTags,
  updateProblemSolutions, deleteProblem
} from "./lib/api.js";

const STORAGE_KEY = "lc-tracker:v1";
function loadCachedPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveCachedPrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

function AppInner({ user, signOut }) {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState({ name: "home" });
  const [toast, setToast] = useState(null);
  const [showTarget, setShowTarget] = useState(false);
  // Always-docked chat panel: pendingChat is `{text, ts}` so the same text
  // resubmitted re-fires the chat's effect (ts changes each time).
  const [pendingChat, setPendingChat] = useState(null);

  const cached = loadCachedPrefs();
  const [theme, setTheme] = useState(cached.theme || "light");
  const [dailyTarget, setDailyTarget] = useState(cached.dailyTarget || 3);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = "terracotta";
    saveCachedPrefs({ theme, dailyTarget });
  }, [theme, dailyTarget]);

  // Initial load: ensure User row + fetch problems
  useEffect(() => {
    (async () => {
      try {
        const email = user?.signInDetails?.loginId || user?.username || "";
        const urow = await ensureUser(user.userId, email);
        if (urow?.dailyTarget) setDailyTarget(urow.dailyTarget);
        const ps = await listMyProblems();
        setProblems(ps);
      } catch (e) {
        console.error(e);
        showToast("Failed to load: " + e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.userId]);

  const showToast = (msg) => setToast({ msg, key: Date.now() });
  const onToggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const onComposerSubmit = (text) => {
    // The composer paste is unambiguously "user just solved a problem, please add it".
    // Prepend a hint so the orchestrator's intent classifier doesn't get confused by
    // a raw code dump and route to Analyst (which would just write a code review).
    const framed = `I just solved this Leetcode problem. Please add it to my tracker.\n\n\`\`\`\n${text}\n\`\`\``;
    setPendingChat({ text: framed, ts: Date.now() });
  };

  const onChatSessionUpdated = async () => {
    // Refresh problems — Curator may have added a new tile.
    try {
      const ps = await listMyProblems();
      setProblems(ps);
    } catch (e) { /* swallow */ }
  };

  const onSaveTarget = async (v) => {
    setDailyTarget(v);
    setShowTarget(false);
    showToast("Daily target set to " + v);
    try { await updateMyDailyTarget(user.userId, v); } catch { /* offline cached */ }
  };

  const onUpdateProblem = async (p) => {
    setProblems((arr) => arr.map((x) => (x.id === p.id ? p : x)));
    try { await updateProblemTags(p.id, p.tags); } catch (e) { console.error(e); }
  };

  const onSaveSolutions = async (id, solutions) => {
    // Optimistic local update so the UI reflects the edit immediately.
    setProblems((arr) => arr.map((p) => (p.id === id ? { ...p, solutions } : p)));
    try {
      await updateProblemSolutions(id, solutions);
      showToast("Solution saved");
    } catch (e) {
      showToast("Save failed: " + e.message);
    }
  };

  const onDeleteProblem = async (id) => {
    const target = problems.find((p) => p.id === id);
    const label = target ? `#${target.number} ${target.title}` : "this problem";
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    try {
      await deleteProblem(id);
      setProblems((arr) => arr.filter((p) => p.id !== id));
      setRoute({ name: "home" });
      showToast(`Deleted ${label}`);
    } catch (e) {
      showToast("Delete failed: " + e.message);
    }
  };

  const onOpenProblem = (id) => {
    setRoute({ name: "detail", id });
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const onBack = () => setRoute({ name: "home" });

  const detailProblem = route.name === "detail" ? problems.find((p) => p.id === route.id) : null;

  if (loading) return <div className="empty-state" style={{ marginTop: 80 }}>Loading…</div>;

  return (
    <div className="layout-shell">
      <div className="layout-main">
        {route.name === "home" && (
          <HomePage
            problems={problems}
            pending={0}
            target={dailyTarget}
            theme={theme}
            user={user}
            onSignOut={signOut}
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
            onSaveSolutions={onSaveSolutions}
            onDelete={onDeleteProblem}
          />
        )}
      </div>
      <ChatDrawer
        pendingMessage={pendingChat}
        onSessionUpdated={onChatSessionUpdated}
        currentProblem={detailProblem}
      />
      {showTarget && (
        <TargetModal value={dailyTarget} onSave={onSaveTarget} onCancel={() => setShowTarget(false)} />
      )}
      {toast && <Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}

export default function App() {
  // null = still checking; false = unauthenticated; object = signed-in user
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const u = await getCurrentUser();
      setUser(u);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // React to OAuth redirect callbacks and sign-out events without a manual reload.
  useEffect(() => {
    const stop = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn" || payload.event === "signInWithRedirect") refresh();
      if (payload.event === "signedOut") setUser(false);
    });
    return () => stop();
  }, [refresh]);

  const signOut = async () => {
    try { await amplifySignOut(); } catch { /* still treat as signed-out locally */ }
    setUser(false);
  };

  if (user === null) return <div className="empty-state" style={{ marginTop: 80 }}>Loading…</div>;
  if (user === false) return <AuthPage onSignedIn={refresh} />;
  return <AppInner user={user} signOut={signOut} />;
}
