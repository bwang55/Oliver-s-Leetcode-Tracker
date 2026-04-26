import React, { useState, useEffect } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import HomePage from "./pages/HomePage.jsx";
import DetailPage from "./pages/DetailPage.jsx";
import TargetModal from "./components/TargetModal.jsx";
import Toast from "./components/Toast.jsx";
import ChatDrawer from "./components/ChatDrawer.jsx";
import { buildHeatmapFromProblems } from "./lib/date.js";
import {
  ensureUser, listMyProblems, updateMyDailyTarget, updateProblemTags
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
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingChatMessage, setPendingChatMessage] = useState(null);

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
    setPendingChatMessage(framed);
    setChatOpen(true);
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

  const onOpenProblem = (id) => {
    setRoute({ name: "detail", id });
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const onBack = () => setRoute({ name: "home" });

  const detailProblem = route.name === "detail" ? problems.find((p) => p.id === route.id) : null;
  const heatmap = buildHeatmapFromProblems(problems);

  if (loading) return <div className="empty-state" style={{ marginTop: 80 }}>Loading…</div>;

  return (
    <>
      {route.name === "home" && (
        <HomePage
          problems={problems}
          pending={0}
          heatmap={heatmap}
          target={dailyTarget}
          theme={theme}
          user={user}
          onSignOut={signOut}
          onOpenChat={() => { setPendingChatMessage(null); setChatOpen(true); }}
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
        <TargetModal value={dailyTarget} onSave={onSaveTarget} onCancel={() => setShowTarget(false)} />
      )}
      <ChatDrawer
        open={chatOpen}
        onClose={() => { setChatOpen(false); setPendingChatMessage(null); }}
        initialMessage={pendingChatMessage}
        onSessionUpdated={onChatSessionUpdated}
      />
      {toast && <Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} />}
    </>
  );
}

export default function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => <AppInner user={user} signOut={signOut} />}
    </Authenticator>
  );
}
