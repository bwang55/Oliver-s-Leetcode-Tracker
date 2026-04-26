# Leetcode Tracker — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock-data Babel-standalone frontend with a real Amplify Gen 2 backend (Cognito + AppSync + DynamoDB + Lambda + S3) and a Vite-bundled frontend that talks to it.

**Architecture:** PWA (Vite + amplify-js + React) → AppSync GraphQL → DynamoDB direct resolvers (CRUD) and Lambda resolvers (`extractProblem`, `exportData`). AI extraction calls Anthropic API from Lambda using a key in Secrets Manager. Two private S3 buckets for user exports and engineering AI logs.

**Tech Stack:** AWS Amplify Gen 2, Cognito, AppSync, DynamoDB, Lambda (Node 20 ARM64), S3, Secrets Manager, CloudWatch, Anthropic API, Vite 5, React 18, `aws-amplify` v6, `@aws-amplify/ui-react`, `vite-plugin-pwa`, `@anthropic-ai/sdk`, `zod`.

**Spec:** [`docs/superpowers/specs/2026-04-25-backend-design.md`](../specs/2026-04-25-backend-design.md)

---

## Pre-flight Checklist (Manual Setup Required Before Phase 2)

- [ ] AWS account with admin or power-user IAM credentials configured locally (`aws configure` → `~/.aws/credentials` profile `default` or named).
- [ ] Anthropic API key with monthly budget cap set in Anthropic console.
- [ ] Node.js 20+ installed (`node --version`).
- [ ] Project directory pushed to a GitHub repo (needed for Amplify Hosting auto-deploy in Phase 4; not blocking earlier phases).
- [ ] (Optional, can defer to Phase 4) Google OAuth client created in Google Cloud Console with redirect URI `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`.

If any of these are missing when Phase 2 starts, pause and resolve them; don't fake values.

---

## File Structure

After this plan completes:

```
leetcode/
├── amplify/                                     # NEW (Amplify Gen 2 backend)
│   ├── package.json
│   ├── tsconfig.json
│   ├── backend.ts
│   ├── auth/
│   │   ├── resource.ts
│   │   └── post-confirmation/
│   │       ├── resource.ts
│   │       └── handler.ts
│   ├── data/
│   │   └── resource.ts
│   ├── functions/
│   │   ├── extract-problem/
│   │   │   ├── resource.ts
│   │   │   ├── handler.ts
│   │   │   ├── prompt.ts
│   │   │   ├── schema.ts
│   │   │   └── handler.test.ts
│   │   └── export-data/
│   │       ├── resource.ts
│   │       └── handler.ts
│   └── storage/
│       └── resource.ts
├── frontend/                                    # MIGRATED (Babel → Vite)
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── public/                                  # static assets, served as-is
│   │   ├── manifest.webmanifest
│   │   ├── icon.svg
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-512.png
│   │   └── apple-touch-icon.png
│   └── src/
│       ├── main.jsx                              # Vite entry
│       ├── App.jsx                               # NEW (was app.jsx)
│       ├── amplify-config.js
│       ├── pages/
│       │   ├── HomePage.jsx
│       │   └── DetailPage.jsx
│       ├── components/                           # one file per component
│       │   ├── Topbar.jsx
│       │   ├── HeroDate.jsx
│       │   ├── Heatmap.jsx
│       │   ├── ProgressCard.jsx
│       │   ├── Composer.jsx
│       │   ├── Tile.jsx
│       │   ├── SkeletonTile.jsx
│       │   ├── Toast.jsx
│       │   ├── TargetModal.jsx
│       │   ├── CodeBlock.jsx
│       │   ├── TagList.jsx
│       │   ├── Prose.jsx
│       │   └── Icon.jsx
│       ├── lib/
│       │   ├── api.js                            # amplify-js Data client wrapper
│       │   ├── date.js                           # fmtBigDate, fmtDayHeader, fmtTime, isoDayKey
│       │   ├── ripple.js
│       │   └── highlight.js
│       └── styles/
│           └── styles.css
├── amplify.yml                                   # NEW (Amplify Hosting build spec)
├── CLAUDE.md
└── docs/
    └── superpowers/
        ├── specs/2026-04-25-backend-design.md
        └── plans/2026-04-25-backend-implementation.md
```

**Files removed during this plan:**
- `frontend/sw.js` — replaced by `vite-plugin-pwa` generated worker
- `frontend/src/app.jsx`, `frontend/src/components.jsx`, `frontend/src/data.js` — split into the new structure

---

## Phase 1: Frontend Bundler Migration (no backend dependency)

> Goal: Same UI works through Vite + ES modules + npm. Mock data still in place. After this phase, the app looks and behaves identically to today, but is ready for amplify-js installation.

### Task 1.1: Initialize npm project and install Vite

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd frontend && npm init -y
```

- [ ] **Step 2: Replace generated package.json with our config**

```json
{
  "name": "leetcode-tracker-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 8765"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd frontend && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Create vite.config.js**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifestFilename: "manifest.webmanifest",
      manifest: {
        name: "Leetcode Tracker",
        short_name: "LC Tracker",
        description: "Track your daily Leetcode practice with AI-extracted problems and tags.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F5F1EB",
        theme_color: "#F5F1EB",
        categories: ["productivity", "education"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  server: { port: 8765 },
  build: { outDir: "dist", sourcemap: true }
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.DS_Store
.env.local
.env.*.local
```

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/.gitignore
git commit -m "chore(frontend): scaffold Vite + react + pwa plugin"
```

---

### Task 1.2: Move static assets into Vite's `public/` directory

**Files:**
- Move: `frontend/assets/*` → `frontend/public/`
- Move: `frontend/manifest.webmanifest` → `frontend/public/manifest.webmanifest` (source of truth becomes vite.config.js, but keep file for Apple/iOS fallback)
- Delete: `frontend/sw.js` (replaced by vite-plugin-pwa)
- Delete: `frontend/assets/` (now empty)

- [ ] **Step 1: Move assets**

```bash
cd frontend
mkdir -p public
mv assets/* public/
rmdir assets
```

- [ ] **Step 2: Move manifest into public/ (so Vite serves it at /manifest.webmanifest)**

```bash
mv manifest.webmanifest public/manifest.webmanifest
```

Note: vite-plugin-pwa will overwrite this at build time with the manifest defined in vite.config.js. Keeping a static fallback so the dev server still serves it before the plugin is wired up.

- [ ] **Step 3: Delete the hand-written service worker**

```bash
rm sw.js
```

- [ ] **Step 4: Verify final layout**

```bash
ls -la frontend/public/
```

Expected output:
```
manifest.webmanifest
apple-touch-icon.png
icon-192.png
icon-512.png
icon-maskable-512.png
icon.svg
```

- [ ] **Step 5: Commit**

```bash
git add -A frontend/
git commit -m "chore(frontend): relocate static assets to public/, remove hand-written sw.js"
```

---

### Task 1.3: Move styles into `src/styles/`

**Files:**
- Move: `frontend/styles/styles.css` → `frontend/src/styles/styles.css`

- [ ] **Step 1: Move CSS**

```bash
cd frontend
mkdir -p src/styles
mv styles/styles.css src/styles/styles.css
rmdir styles
```

- [ ] **Step 2: Commit**

```bash
git add -A frontend/
git commit -m "chore(frontend): move styles into src/styles/"
```

---

### Task 1.4: Extract pure helpers from `data.js` into `src/lib/`

**Files:**
- Create: `frontend/src/lib/date.js`
- Create: `frontend/src/lib/ripple.js`
- Create: `frontend/src/lib/highlight.js`
- Create: `frontend/src/lib/sample-data.js` (kept temporarily for Phase 1 mock data; deleted in Phase 3)

- [ ] **Step 1: Create `src/lib/date.js`**

```js
export function fmtBigDate(d) {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return {
    day: d.getDate(),
    month: months[d.getMonth()],
    year: d.getFullYear(),
    weekday: weekdays[d.getDay()]
  };
}

export function fmtDayHeader(iso) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOnly = new Date(d);
  dayOnly.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - dayOnly) / 86400000);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const main = `${months[d.getMonth()]} ${d.getDate()}`;
  let rel = "";
  if (diffDays === 0) rel = "today";
  else if (diffDays === 1) rel = "yesterday";
  else if (diffDays < 7) rel = `${diffDays} days ago`;
  else if (diffDays < 14) rel = "1 week ago";
  else rel = `${Math.floor(diffDays / 7)} weeks ago`;
  return { main, rel };
}

export function fmtTime(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function isoDayKey(iso) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Create `src/lib/ripple.js`**

```js
export function attachRipple(e) {
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
```

- [ ] **Step 3: Create `src/lib/highlight.js`** (copy verbatim from current `components.jsx` `highlight()` function and `SLOT_OPEN/SLOT_CLOSE` constants, exported)

```js
const SLOT_OPEN = "@@SLOT_";
const SLOT_CLOSE = "_END@@";

export function highlight(code, lang) {
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
    java: ["class","public","private","protected","static","final","void","int","return","if","else","for","while","new","this","import","package","extends","implements","interface","abstract","try","catch","finally","throw","throws","null","true","false","Map","HashMap","List","Integer"]
  };
  const list = kws[lang] || [];
  if (list.length) {
    const re = new RegExp("\\b(" + list.join("|") + ")\\b", "g");
    out = out.replace(re, (m) => slot("tok-kw", m));
  }
  out = out.replace(/(?<![\w@])([A-Z][A-Za-z0-9_]*)\b/g, (m) => slot("tok-cls", m));
  out = out.replace(/([a-z_][A-Za-z0-9_]*)(?=\()/g, (m) => slot("tok-fn", m));

  const restoreRe = new RegExp(SLOT_OPEN + "(\\d+)" + SLOT_CLOSE, "g");
  out = out.replace(restoreRe, (_, i) => {
    const s = slots[+i];
    return '<span class="' + s.cls + '">' + s.content + '</span>';
  });
  return out;
}
```

- [ ] **Step 4: Create `src/lib/sample-data.js`** — copy `SAMPLE_PROBLEMS`, `FAKE_BANK`, `buildHeatmap` from current `frontend/src/data.js` and convert each to a named ES export. (Verbatim move — no logic changes. Deleted in Phase 3 once API is wired.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/
git commit -m "chore(frontend): extract pure helpers (date, ripple, highlight) and sample data into src/lib/"
```

---

### Task 1.5: Split `components.jsx` into per-component files

**Files:**
- Create: `frontend/src/components/{Icon,Topbar,HeroDate,Heatmap,ProgressCard,Composer,Tile,SkeletonTile,Toast,TargetModal,CodeBlock,TagList,Prose}.jsx`

Each component file imports React + helpers from `src/lib/*` and exports the component. The component bodies are *verbatim copies* from the existing `frontend/src/components.jsx` — no logic changes.

- [ ] **Step 1: Create `src/components/Icon.jsx`**

```jsx
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
  )
};

export default Icon;
```

- [ ] **Step 2: Create remaining component files**

For each of `Topbar`, `HeroDate`, `Heatmap`, `ProgressCard`, `Composer`, `Tile`, `SkeletonTile`, `Toast`, `TargetModal`, `CodeBlock`, `TagList`, `Prose`:

- Copy the function body verbatim from `frontend/src/components.jsx`.
- Add ES module imports at top: `import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";` (only the hooks used by that component).
- For files using helpers, add: `import { fmtTime, fmtBigDate /* etc */ } from "../lib/date.js";`, `import Icon from "./Icon.jsx";`, `import { attachRipple } from "../lib/ripple.js";`, `import { highlight } from "../lib/highlight.js";`.
- End with `export default ComponentName;`.

Example — `src/components/Tile.jsx`:

```jsx
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
```

- [ ] **Step 3: Delete the old `frontend/src/components.jsx`**

```bash
rm frontend/src/components.jsx
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git rm frontend/src/components.jsx
git commit -m "refactor(frontend): split components.jsx into one-component-per-file ES modules"
```

---

### Task 1.6: Create `src/pages/HomePage.jsx` and `src/pages/DetailPage.jsx`

**Files:**
- Create: `frontend/src/pages/HomePage.jsx`
- Create: `frontend/src/pages/DetailPage.jsx`

The page bodies come from current `frontend/src/app.jsx` (the `HomePage` and `DetailPage` functions, verbatim), with imports updated to point at `../components/*.jsx` and `../lib/date.js`.

- [ ] **Step 1: Create `src/pages/HomePage.jsx`**

```jsx
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
    onAdjustTarget, onComposerSubmit, onOpenProblem, onToggleTheme, showToast
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
```

- [ ] **Step 2: Create `src/pages/DetailPage.jsx`**

```jsx
import React from "react";
import Icon from "../components/Icon.jsx";
import TagList from "../components/TagList.jsx";
import Prose from "../components/Prose.jsx";
import CodeBlock from "../components/CodeBlock.jsx";
import { fmtDayHeader, fmtTime } from "../lib/date.js";

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

export default DetailPage;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/
git commit -m "refactor(frontend): extract HomePage and DetailPage into src/pages/"
```

---

### Task 1.7: Create `src/App.jsx` and `src/main.jsx`, replace old `app.jsx`

**Files:**
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Delete: `frontend/src/app.jsx`
- Delete: `frontend/src/data.js` (its content already exported from `src/lib/sample-data.js` and `src/lib/date.js`)

- [ ] **Step 1: Create `src/main.jsx`**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: Create `src/App.jsx`** — body is the current `App` function from `frontend/src/app.jsx`, but using ES imports for `SAMPLE_PROBLEMS`, `FAKE_BANK`, `buildHeatmap` from `./lib/sample-data.js`, and the page components from `./pages/`.

```jsx
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
```

- [ ] **Step 3: Delete obsolete files**

```bash
rm frontend/src/app.jsx
rm frontend/src/data.js
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.jsx frontend/src/App.jsx
git rm frontend/src/app.jsx frontend/src/data.js
git commit -m "refactor(frontend): convert app entrypoint to ES modules (App.jsx + main.jsx)"
```

---

### Task 1.8: Update `index.html` for Vite

**Files:**
- Modify: `frontend/index.html`

The Vite-style `index.html` references `/src/main.jsx` instead of CDN scripts.

- [ ] **Step 1: Replace `frontend/index.html` with**

```html
<!doctype html>
<html lang="en" data-theme="light" data-accent="terracotta">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Leetcode Tracker</title>

  <link rel="icon" type="image/svg+xml" href="/icon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="LC Tracker" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#F5F1EB" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#1F1C1A" media="(prefers-color-scheme: dark)" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;1,400;1,500&family=JetBrains+Mono:wght@400;500&display=swap"
    rel="stylesheet"
  />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

Note: vite-plugin-pwa injects the `<link rel="manifest">` and SW registration at build time; the dev server emits a virtual SW. We no longer hand-write any of that here.

- [ ] **Step 2: Run dev server**

```bash
cd frontend && npm run dev
```

Expected: Vite logs "VITE v5.x.x ready in N ms" and prints `Local: http://localhost:8765/`.

- [ ] **Step 3: Manually verify in browser**

Open `http://localhost:8765/`. Verify:
- Page renders identically to before (hero date, heatmap, progress card, composer, sample tiles).
- Pasting text into the composer creates a skeleton tile that resolves to a fake problem after ~3s.
- Clicking a tile opens the detail page; back button returns to home.
- Theme toggle (avatar dropdown) flips light/dark.

- [ ] **Step 4: Build production bundle**

```bash
cd frontend && npm run build
```

Expected: `dist/` directory created with `index.html`, `assets/` (hashed JS/CSS), `manifest.webmanifest`, generated `sw.js`, `registerSW.js`.

- [ ] **Step 5: Preview production build**

```bash
cd frontend && npm run preview
```

Verify same UI at `http://localhost:8765/`, plus DevTools → Application → Service Workers shows the generated worker is registered.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html
git commit -m "feat(frontend): switch index.html to Vite ES-module entry; vite-plugin-pwa generates manifest+sw"
```

---

## Phase 2: Backend Infrastructure (Amplify Gen 2)

> Goal: Deploy a working Amplify sandbox with auth, data, functions, and storage. No frontend wiring yet — verification is via AWS console + sandbox URL.

### Task 2.1: Initialize Amplify Gen 2 backend skeleton

**Files:**
- Create: `amplify/package.json`
- Create: `amplify/tsconfig.json`
- Create: `amplify/backend.ts`
- Modify: root `.gitignore` to ignore `amplify/.amplify/`, `amplify_outputs.json`

- [ ] **Step 1: Initialize Amplify in repo root**

```bash
cd /Users/boyangwang/leetcode
npm create amplify@latest -- --yes
```

Expected: `amplify/` directory scaffolded with `auth/resource.ts`, `data/resource.ts`, `backend.ts`. `package.json` updated. `amplify_outputs.json` will be generated on first sandbox deploy.

- [ ] **Step 2: Inspect generated files**

```bash
ls amplify/
cat amplify/backend.ts
```

Expected: `backend.ts` looks like:

```ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';

defineBackend({ auth, data });
```

- [ ] **Step 3: Update root `.gitignore`**

Add to root `.gitignore`:

```
.amplify/
amplify_outputs.json
node_modules/
```

- [ ] **Step 4: Commit**

```bash
git add amplify/ package.json package-lock.json .gitignore
git commit -m "chore(amplify): scaffold Gen 2 backend skeleton"
```

---

### Task 2.2: Configure Cognito auth (email/password + Google federation)

**Files:**
- Modify: `amplify/auth/resource.ts`

- [ ] **Step 1: Replace `amplify/auth/resource.ts` with**

```ts
import { defineAuth, secret } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret("GOOGLE_CLIENT_ID"),
        clientSecret: secret("GOOGLE_CLIENT_SECRET"),
        scopes: ["email", "profile", "openid"]
      },
      callbackUrls: ["http://localhost:8765/", "https://main.<APP_ID>.amplifyapp.com/"],
      logoutUrls: ["http://localhost:8765/", "https://main.<APP_ID>.amplifyapp.com/"]
    }
  },
  userAttributes: {
    email: { required: true, mutable: false }
  }
});
```

Note: `<APP_ID>` will be substituted in Phase 4 once the Amplify app is created. For sandbox deploys, only `localhost:8765` is needed.

- [ ] **Step 2: Set Google OAuth secrets in sandbox** (skip if not doing Google now; the backend will deploy without it as long as we comment out the `externalProviders.google` block temporarily)

```bash
npx ampx sandbox secret set GOOGLE_CLIENT_ID
# paste the client ID from Google Cloud Console
npx ampx sandbox secret set GOOGLE_CLIENT_SECRET
# paste the client secret
```

- [ ] **Step 3: Commit**

```bash
git add amplify/auth/resource.ts
git commit -m "feat(amplify/auth): configure Cognito with email + Google OAuth"
```

---

### Task 2.3: Define `User`, `Problem`, `RateLimit` data models

**Files:**
- Modify: `amplify/data/resource.ts`

- [ ] **Step 1: Replace `amplify/data/resource.ts` with**

```ts
import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  Difficulty: a.enum(["EASY", "MEDIUM", "HARD"]),

  User: a
    .model({
      userId: a.id().required(),
      email: a.email().required(),
      displayName: a.string(),
      dailyTarget: a.integer().required().default(3),
      createdAt: a.datetime().required()
    })
    .identifier(["userId"])
    .authorization((allow) => [allow.ownerDefinedIn("userId")]),

  Problem: a
    .model({
      id: a.id().required(),
      userId: a.id().required(),
      number: a.integer().required(),
      title: a.string().required(),
      difficulty: a.ref("Difficulty").required(),
      tags: a.string().array().required(),
      solvedAt: a.datetime().required(),
      description: a.string(),
      constraints: a.string().array(),
      solutions: a.json(),
      note: a.string()
    })
    .identifier(["id"])
    .secondaryIndexes((index) => [index("userId").sortKeys(["solvedAt"]).name("byUserAndDate")])
    .authorization((allow) => [allow.ownerDefinedIn("userId")]),

  RateLimit: a
    .model({
      userId: a.id().required(),
      dayKey: a.string().required(),
      aiCallCount: a.integer().required().default(0),
      ttl: a.timestamp()
    })
    .identifier(["userId", "dayKey"])
    .authorization((allow) => [allow.authenticated().to([])]) // no user-facing access; Lambda uses IAM
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool"
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add amplify/data/resource.ts
git commit -m "feat(amplify/data): define User, Problem (byUserAndDate GSI), RateLimit models"
```

---

### Task 2.4: Add `postConfirmation` Cognito trigger

**Files:**
- Create: `amplify/auth/post-confirmation/resource.ts`
- Create: `amplify/auth/post-confirmation/handler.ts`
- Modify: `amplify/auth/resource.ts` (wire trigger)
- Modify: `amplify/backend.ts` (grant DynamoDB write to trigger)

- [ ] **Step 1: Create `amplify/auth/post-confirmation/resource.ts`**

```ts
import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  name: "postConfirmation",
  entry: "./handler.ts",
  resourceGroupName: "auth"
});
```

- [ ] **Step 2: Create `amplify/auth/post-confirmation/handler.ts`**

```ts
import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "$amplify/env/postConfirmation";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const userId = event.userName;
  const email = event.request.userAttributes.email;
  const tableName = env.AMPLIFY_DATA_USER_TABLE_NAME;

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        userId,
        email,
        displayName: email,
        dailyTarget: 3,
        createdAt: new Date().toISOString()
      },
      ConditionExpression: "attribute_not_exists(userId)"
    })
  ).catch((err) => {
    if (err.name === "ConditionalCheckFailedException") return; // already exists, idempotent
    throw err;
  });

  return event;
};
```

- [ ] **Step 3: Wire the trigger in `amplify/auth/resource.ts`**

Add at top of file:

```ts
import { postConfirmation } from "./post-confirmation/resource";
```

Modify `defineAuth({...})` call to include:

```ts
triggers: { postConfirmation }
```

- [ ] **Step 4: Grant DynamoDB write in `amplify/backend.ts`**

Replace `amplify/backend.ts` with:

```ts
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";

const backend = defineBackend({ auth, data });

const userTable = backend.data.resources.tables["User"];
backend.auth.resources.cfnResources.cfnUserPool
  .addPropertyOverride("LambdaConfig", {});

const postConfirmFn = backend.auth.resources.cfnResources.cfnUserPool;

// Grant the postConfirmation Lambda role permission to PutItem on User table.
backend.auth.resources.userPool.node
  .findChild("postConfirmation") /* placeholder: in Gen 2, the simpler way is via env() in defineFunction */;

// Pass the table name as an env var to the trigger and grant access.
backend.data.resources.tables["User"].grantWriteData(
  backend.auth.resources.userPool.node.findChild("postConfirmation") as never
);

backend.auth.resources.userPool
  .node.findChild("postConfirmation").addEnvironment(
    "AMPLIFY_DATA_USER_TABLE_NAME",
    backend.data.resources.tables["User"].tableName
  );
```

> **Note for the implementing engineer:** The Amplify Gen 2 API for granting Lambda triggers cross-resource access is in flux. As of late 2025, the canonical pattern is `backend.<resource>.resources.<sub>.grant<X>(<lambda>)` paired with `addEnvironment(...)`. If the above doesn't compile, consult `https://docs.amplify.aws/react/build-a-backend/auth/connect-your-frontend/sign-up/` and `https://docs.amplify.aws/react/build-a-backend/functions/grant-access-to-other-resources/` and adjust the wiring (the *intent* — write access to User table + table-name env var — is what matters).

- [ ] **Step 5: Commit**

```bash
git add amplify/
git commit -m "feat(amplify/auth): add post-confirmation trigger to seed User row"
```

---

### Task 2.5: Add `extractProblem` Lambda + custom mutation

**Files:**
- Create: `amplify/functions/extract-problem/resource.ts`
- Create: `amplify/functions/extract-problem/handler.ts`
- Create: `amplify/functions/extract-problem/prompt.ts`
- Create: `amplify/functions/extract-problem/schema.ts`
- Create: `amplify/functions/extract-problem/handler.test.ts`
- Modify: `amplify/data/resource.ts` (add custom mutation)
- Modify: `amplify/backend.ts` (grant DynamoDB + S3 + Secrets Manager access)

- [ ] **Step 1: Create `amplify/functions/extract-problem/resource.ts`**

```ts
import { defineFunction, secret } from "@aws-amplify/backend";

export const extractProblem = defineFunction({
  name: "extractProblem",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  runtime: 20,
  environment: {
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
    AI_DAILY_RATE_LIMIT: "50",
    ANTHROPIC_MODEL: "claude-sonnet-4-6"
  }
});
```

- [ ] **Step 2: Create `amplify/functions/extract-problem/prompt.ts`**

```ts
export const SYSTEM_PROMPT = `You are a Leetcode problem identifier. Given a code solution, identify:

1. The Leetcode problem number and exact title.
2. Difficulty (EASY, MEDIUM, or HARD).
3. Algorithmic tags (e.g. "array", "hash-map", "dp", "two-pointer", "graph", "dfs", "bfs", "sliding-window"). Use kebab-case, lowercase. 1–5 tags typical.
4. A brief problem description (2-4 sentences, in the user's likely native intent).
5. Key constraints (3-6 short bullets, e.g. "1 <= n <= 10^5").
6. The programming language of the solution (one of: python, cpp, java, other).

Use the record_extraction tool to return your answer. If you cannot identify the problem with high confidence, set confidence to "low" and provide your best guess.`;

export const TOOL_DEFINITION = {
  name: "record_extraction",
  description: "Record the extracted Leetcode problem metadata.",
  input_schema: {
    type: "object" as const,
    properties: {
      number: { type: "integer", description: "Leetcode problem number" },
      title: { type: "string", description: "Exact problem title" },
      difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Lowercase kebab-case algorithmic tags"
      },
      description: { type: "string", description: "Brief problem description" },
      constraints: { type: "array", items: { type: "string" }, description: "Key constraints" },
      language: { type: "string", enum: ["python", "cpp", "java", "other"] },
      confidence: { type: "string", enum: ["high", "low"] }
    },
    required: ["number", "title", "difficulty", "tags", "description", "language", "confidence"]
  }
};
```

- [ ] **Step 3: Create `amplify/functions/extract-problem/schema.ts`**

```ts
import { z } from "zod";

export const ExtractionSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  tags: z.array(z.string().min(1)).min(1).max(8),
  description: z.string().min(1),
  constraints: z.array(z.string()).optional().default([]),
  language: z.enum(["python", "cpp", "java", "other"]),
  confidence: z.enum(["high", "low"])
});

export type Extraction = z.infer<typeof ExtractionSchema>;
```

- [ ] **Step 4: Write the failing test (`amplify/functions/extract-problem/handler.test.ts`)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We will mock these modules; the test verifies the handler's logic without hitting AWS or Anthropic.
vi.mock("@aws-sdk/client-dynamodb");
vi.mock("@aws-sdk/lib-dynamodb");
vi.mock("@aws-sdk/client-s3");
vi.mock("@anthropic-ai/sdk");

describe("extractProblem handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AMPLIFY_DATA_PROBLEM_TABLE_NAME = "ProblemTable";
    process.env.AMPLIFY_DATA_RATELIMIT_TABLE_NAME = "RateLimitTable";
    process.env.AI_LOGS_BUCKET_NAME = "ai-logs";
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.AI_DAILY_RATE_LIMIT = "50";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
  });

  it("returns RATE_LIMIT_EXCEEDED when the user is at the cap", async () => {
    const { handler } = await import("./handler");
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    (DynamoDBDocumentClient.from as any) = vi.fn().mockReturnValue({
      send: vi.fn().mockRejectedValue(Object.assign(new Error("over"), { name: "ConditionalCheckFailedException" }))
    });

    const event = {
      identity: { sub: "user-1" },
      arguments: { solutionText: "def two_sum(): pass" }
    };

    await expect(handler(event as any)).rejects.toThrow(/RATE_LIMIT_EXCEEDED/);
  });

  it("persists a Problem with language-routed solutions slot on success", async () => {
    // Test wiring: rate-limit OK, Anthropic returns valid tool result, DynamoDB PutItem succeeds.
    // Assert: returned Problem.solutions.cpp === input solutionText when language === 'cpp'.
    // (Stub Anthropic SDK to return tool_use block with language: "cpp".)
    // Implementation: see TDD step in next task.
    expect(true).toBe(true); // scaffold only; replaced by Step 6.
  });
});
```

- [ ] **Step 5: Run the test to see it fail**

```bash
cd amplify/functions/extract-problem && npx vitest run --reporter=verbose handler.test.ts
```

Expected: at least the "RATE_LIMIT_EXCEEDED" test fails because `handler.ts` doesn't exist yet.

- [ ] **Step 6: Implement `amplify/functions/extract-problem/handler.ts`**

```ts
import type { AppSyncResolverHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { SYSTEM_PROMPT, TOOL_DEFINITION } from "./prompt";
import { ExtractionSchema } from "./schema";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const PROBLEM_TABLE = process.env.AMPLIFY_DATA_PROBLEM_TABLE_NAME!;
const RATELIMIT_TABLE = process.env.AMPLIFY_DATA_RATELIMIT_TABLE_NAME!;
const AI_LOGS_BUCKET = process.env.AI_LOGS_BUCKET_NAME!;
const RATE_LIMIT = parseInt(process.env.AI_DAILY_RATE_LIMIT || "50", 10);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

type Args = { solutionText: string };
type Result = { problem: any };

export const handler: AppSyncResolverHandler<Args, Result> = async (event) => {
  const userId = (event.identity as any)?.sub;
  if (!userId) throw new Error("Unauthorized");

  const dayKey = new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  // 1. Rate limit (atomic increment with conditional)
  try {
    await ddb.send(new UpdateCommand({
      TableName: RATELIMIT_TABLE,
      Key: { userId, dayKey },
      UpdateExpression: "ADD aiCallCount :one SET #ttl = :ttl",
      ConditionExpression: "attribute_not_exists(aiCallCount) OR aiCallCount < :max",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": ttl, ":max": RATE_LIMIT }
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
    throw err;
  }

  // 2. Call Anthropic
  let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
  let extraction: ReturnType<typeof ExtractionSchema.parse>;
  const requestId = randomUUID();
  const requestPayload = {
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } }],
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" as const } }],
    tool_choice: { type: "tool" as const, name: "record_extraction" },
    messages: [{ role: "user" as const, content: event.arguments.solutionText }]
  };

  try {
    response = await anthropic.messages.create(requestPayload as any, { timeout: 15000 });
    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("AI_INVALID_RESPONSE");
    extraction = ExtractionSchema.parse(toolUse.input);
  } catch (err: any) {
    // Roll back rate limit on AI infrastructure failure (not on parse failure — that user-spent a token call).
    const isInfra = err?.status >= 500 || err?.status === 429 || err?.name === "TimeoutError";
    if (isInfra) {
      await ddb.send(new UpdateCommand({
        TableName: RATELIMIT_TABLE,
        Key: { userId, dayKey },
        UpdateExpression: "ADD aiCallCount :neg",
        ExpressionAttributeValues: { ":neg": -1 }
      })).catch(() => {});
      throw new Error("AI_SERVICE_UNAVAILABLE");
    }
    if (err.message === "AI_INVALID_RESPONSE" || err.name === "ZodError") {
      throw new Error("AI_INVALID_RESPONSE");
    }
    throw err;
  }

  // 3. Persist Problem
  const id = randomUUID();
  const lang = extraction.language === "other" ? "python" : extraction.language;
  const solutions: Record<string, string> = { python: "", cpp: "", java: "" };
  solutions[lang] = event.arguments.solutionText;
  const now = new Date().toISOString();

  const problemItem = {
    id,
    userId,
    number: extraction.number,
    title: extraction.title,
    difficulty: extraction.difficulty,
    tags: extraction.tags,
    solvedAt: now,
    description: extraction.description,
    constraints: extraction.constraints,
    solutions,
    note: "",
    createdAt: now,
    updatedAt: now,
    __typename: "Problem",
    owner: userId
  };

  try {
    await ddb.send(new PutCommand({
      TableName: PROBLEM_TABLE,
      Item: problemItem,
      ConditionExpression: "attribute_not_exists(id)"
    }));
  } catch (err) {
    throw new Error("PERSIST_FAILED");
  }

  // 4. Fire-and-forget AI log to S3 (don't block on failure)
  s3.send(new PutObjectCommand({
    Bucket: AI_LOGS_BUCKET,
    Key: `${dayKey.replace(/-/g, "/")}/${userId}/${requestId}.json`,
    Body: JSON.stringify({ requestId, userId, request: requestPayload, response, extraction }),
    ContentType: "application/json"
  })).catch((e) => console.error("ai-log put failed", e));

  return { problem: problemItem };
};
```

- [ ] **Step 7: Replace the second test in `handler.test.ts` with a real assertion**

```ts
it("persists a Problem with language-routed solutions slot on success", async () => {
  const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
  const sendMock = vi.fn()
    .mockResolvedValueOnce({}) // rate-limit update succeeds
    .mockResolvedValueOnce({}); // PutItem succeeds
  (DynamoDBDocumentClient.from as any) = vi.fn().mockReturnValue({ send: sendMock });

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  (Anthropic as any).prototype = {};
  (Anthropic as any) = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: "tool_use",
          name: "record_extraction",
          input: {
            number: 1, title: "Two Sum", difficulty: "EASY",
            tags: ["array", "hash-map"], description: "find two indices",
            constraints: ["1 <= n"], language: "cpp", confidence: "high"
          }
        }]
      })
    }
  }));

  const { handler } = await import("./handler");
  const event = {
    identity: { sub: "user-1" },
    arguments: { solutionText: "vector<int> twoSum(...) {}" }
  };
  const result = await handler(event as any);
  expect(result.problem.solutions.cpp).toBe("vector<int> twoSum(...) {}");
  expect(result.problem.solutions.python).toBe("");
  expect(result.problem.title).toBe("Two Sum");
});
```

- [ ] **Step 8: Run all tests; expect both to pass**

```bash
cd amplify/functions/extract-problem && npx vitest run handler.test.ts
```

Expected: 2 passed.

- [ ] **Step 9: Add the custom mutation to `amplify/data/resource.ts`**

Modify `amplify/data/resource.ts` — add inside the schema (top-level imports at file top):

```ts
import { extractProblem } from "../functions/extract-problem/resource";
```

Inside `a.schema({ ... })`, add:

```ts
extractProblem: a
  .mutation()
  .arguments({ solutionText: a.string().required() })
  .returns(a.ref("Problem"))
  .handler(a.handler.function(extractProblem))
  .authorization((allow) => [allow.authenticated()])
```

- [ ] **Step 10: Wire DynamoDB + S3 + secret access in `amplify/backend.ts`**

Append to `backend.ts`:

```ts
import { extractProblem } from "./functions/extract-problem/resource";

backend.data.resources.tables["Problem"].grantWriteData(extractProblem);
backend.data.resources.tables["RateLimit"].grantReadWriteData(extractProblem);

extractProblem.addEnvironment("AMPLIFY_DATA_PROBLEM_TABLE_NAME",
  backend.data.resources.tables["Problem"].tableName);
extractProblem.addEnvironment("AMPLIFY_DATA_RATELIMIT_TABLE_NAME",
  backend.data.resources.tables["RateLimit"].tableName);
```

S3 access added in Task 2.7 once the bucket exists.

- [ ] **Step 11: Set Anthropic API key secret**

```bash
npx ampx sandbox secret set ANTHROPIC_API_KEY
# paste the Anthropic API key from the dashboard
```

- [ ] **Step 12: Commit**

```bash
git add amplify/functions/extract-problem/ amplify/data/resource.ts amplify/backend.ts
git commit -m "feat(amplify/functions): add extractProblem Lambda with rate limiting and prompt caching"
```

---

### Task 2.6: Add `exportData` Lambda + custom mutation

**Files:**
- Create: `amplify/functions/export-data/resource.ts`
- Create: `amplify/functions/export-data/handler.ts`
- Modify: `amplify/data/resource.ts` (add `exportMyData` mutation)
- Modify: `amplify/backend.ts`

- [ ] **Step 1: Create `amplify/functions/export-data/resource.ts`**

```ts
import { defineFunction } from "@aws-amplify/backend";

export const exportData = defineFunction({
  name: "exportData",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 256,
  runtime: 20
});
```

- [ ] **Step 2: Create `amplify/functions/export-data/handler.ts`**

```ts
import type { AppSyncResolverHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const PROBLEM_TABLE = process.env.AMPLIFY_DATA_PROBLEM_TABLE_NAME!;
const EXPORTS_BUCKET = process.env.EXPORTS_BUCKET_NAME!;

type Result = { url: string; expiresAt: string };

export const handler: AppSyncResolverHandler<{}, Result> = async (event) => {
  const userId = (event.identity as any)?.sub;
  if (!userId) throw new Error("Unauthorized");

  // Page-scan all the user's problems via the byUserAndDate GSI
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const out = await ddb.send(new QueryCommand({
      TableName: PROBLEM_TABLE,
      IndexName: "byUserAndDate",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(out.Items || []));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  const ts = new Date().toISOString();
  const key = `${userId}/exports/${ts}.json`;
  await s3.send(new PutObjectCommand({
    Bucket: EXPORTS_BUCKET,
    Key: key,
    Body: JSON.stringify({ exportedAt: ts, userId, problems: items }, null, 2),
    ContentType: "application/json"
  }));

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: EXPORTS_BUCKET, Key: key }), { expiresIn: 300 });
  return { url, expiresAt: new Date(Date.now() + 300_000).toISOString() };
};
```

- [ ] **Step 3: Add `exportMyData` to `amplify/data/resource.ts`**

```ts
import { exportData } from "../functions/export-data/resource";
```

Inside the schema:

```ts
ExportLink: a.customType({
  url: a.url().required(),
  expiresAt: a.datetime().required()
}),

exportMyData: a
  .mutation()
  .arguments({})
  .returns(a.ref("ExportLink"))
  .handler(a.handler.function(exportData))
  .authorization((allow) => [allow.authenticated()])
```

- [ ] **Step 4: Wire access in `amplify/backend.ts`**

Append:

```ts
import { exportData } from "./functions/export-data/resource";

backend.data.resources.tables["Problem"].grantReadData(exportData);
exportData.addEnvironment("AMPLIFY_DATA_PROBLEM_TABLE_NAME",
  backend.data.resources.tables["Problem"].tableName);
```

- [ ] **Step 5: Commit**

```bash
git add amplify/functions/export-data/ amplify/data/resource.ts amplify/backend.ts
git commit -m "feat(amplify/functions): add exportData Lambda + exportMyData mutation"
```

---

### Task 2.7: Define S3 storage (exports + ai-logs buckets)

**Files:**
- Create: `amplify/storage/resource.ts`
- Modify: `amplify/backend.ts`

- [ ] **Step 1: Create `amplify/storage/resource.ts`**

```ts
import { defineStorage } from "@aws-amplify/backend";

export const exportsBucket = defineStorage({
  name: "exports",
  access: (allow) => ({
    "{userId}/exports/*": [allow.entity("identity").to(["read"])] // user reads via signed URL only
  })
});

export const aiLogsBucket = defineStorage({
  name: "aiLogs",
  isDefault: false,
  access: () => ({}) // private; only Lambda execution roles, not granted via Amplify access patterns
});
```

- [ ] **Step 2: Wire buckets in `amplify/backend.ts`**

```ts
import { exportsBucket, aiLogsBucket } from "./storage/resource";

const backend = defineBackend({
  auth, data,
  exportsBucket, aiLogsBucket,
  postConfirmation, extractProblem, exportData
});

// Grant access:
backend.exportsBucket.resources.bucket.grantReadWrite(exportData);
backend.aiLogsBucket.resources.bucket.grantWrite(extractProblem);

extractProblem.addEnvironment("AI_LOGS_BUCKET_NAME",
  backend.aiLogsBucket.resources.bucket.bucketName);
exportData.addEnvironment("EXPORTS_BUCKET_NAME",
  backend.exportsBucket.resources.bucket.bucketName);

// Lifecycle: ai-logs Standard → IA at 30d, delete at 90d
backend.aiLogsBucket.resources.bucket.addLifecycleRule({
  id: "expire-ai-logs",
  enabled: true,
  transitions: [{ storageClass: "STANDARD_IA" as any, transitionAfter: { days: 30 } as any }],
  expiration: { days: 90 } as any
});

// Lifecycle: exports delete at 30d
backend.exportsBucket.resources.bucket.addLifecycleRule({
  id: "expire-exports",
  enabled: true,
  expiration: { days: 30 } as any
});
```

> **Note:** The exact lifecycle rule API depends on the CDK version Amplify Gen 2 ships. If `addLifecycleRule` complains, drop into the underlying L1 construct via `.cfnBucket.lifecycleConfiguration = { rules: [...] }`. Intent: 30-day expiry for exports, 90-day expiry for ai-logs with IA transition at 30 days.

- [ ] **Step 3: Commit**

```bash
git add amplify/storage/ amplify/backend.ts
git commit -m "feat(amplify/storage): add exports + ai-logs S3 buckets with lifecycle policies"
```

---

### Task 2.8: Sandbox deploy and smoke-test

- [ ] **Step 1: Start sandbox**

```bash
cd /Users/boyangwang/leetcode
npx ampx sandbox
```

Expected: Amplify deploys all resources to AWS (a personalized stack named `amplify-<project>-<dev>-sandbox-<id>`). Logs end with "Watching for file changes...". `amplify_outputs.json` is generated at the project root.

- [ ] **Step 2: Inspect generated `amplify_outputs.json`**

```bash
cat amplify_outputs.json | head -40
```

Expected: contains `auth` (User Pool ID, client ID, domain), `data` (AppSync URL, region, default authorization mode), `storage` (bucket names).

- [ ] **Step 3: Smoke-test auth via AWS Console**

Open AWS Console → Cognito → User Pools → the new pool. Click "Create user", set email + password (manually-confirmed). Verify a row appears in DynamoDB → `User-<env>` table.

- [ ] **Step 4: Smoke-test extractProblem via the AppSync console**

Open AWS Console → AppSync → the new API → Queries. Authenticate as the user you just created (use the "Use Cognito User Pool" auth tab, sign in). Run:

```graphql
mutation {
  extractProblem(solutionText: "def twoSum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen: return [seen[target-n], i]\n        seen[n] = i") {
    id title number difficulty tags solutions
  }
}
```

Expected: returns a `Problem` with `title: "Two Sum"`, `number: 1`, `difficulty: "EASY"`, `tags` containing "array" and "hash-map", `solutions.python` populated. Check DynamoDB `Problem-<env>` table — row exists. Check S3 `aiLogs-<env>` bucket — JSON file present.

- [ ] **Step 5: Stop sandbox**

```
# Ctrl-C in the sandbox terminal
```

(Sandbox stack stays deployed; only the watcher stops.)

- [ ] **Step 6: Commit no changes (verification step), but mark phase complete in task tracker.**

---

## Phase 3: Frontend ↔ Backend Integration

> Goal: Replace the in-memory mock data with calls to the live AppSync API. Authenticator UI gates the app.

### Task 3.1: Install amplify-js and configure client

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/amplify-config.js`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Install dependencies**

```bash
cd frontend
npm install aws-amplify @aws-amplify/ui-react
```

- [ ] **Step 2: Symlink `amplify_outputs.json` into the frontend so Vite can import it during dev**

```bash
cd frontend && ln -sf ../amplify_outputs.json src/amplify_outputs.json
```

- [ ] **Step 3: Create `frontend/src/amplify-config.js`**

```js
import { Amplify } from "aws-amplify";
import outputs from "./amplify_outputs.json";

Amplify.configure(outputs);
```

- [ ] **Step 4: Wire it into `frontend/src/main.jsx`**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "@aws-amplify/ui-react/styles.css";
import "./styles/styles.css";
import "./amplify-config.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/amplify-config.js frontend/src/main.jsx frontend/src/amplify_outputs.json
git commit -m "feat(frontend): install aws-amplify, configure client from amplify_outputs.json"
```

---

### Task 3.2: Wrap App with `<Authenticator>`

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Wrap the App body with Authenticator**

At the top of `App.jsx`:

```jsx
import { Authenticator } from "@aws-amplify/ui-react";
```

Replace the App function's return statement:

```jsx
return (
  <Authenticator socialProviders={["google"]}>
    {({ signOut, user }) => (
      <>
        {route.name === "home" && (
          <HomePage
            problems={problems}
            pending={pending}
            heatmap={heatmap}
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
          <DetailPage problem={detailProblem} onBack={onBack} onUpdate={onUpdateProblem} />
        )}
        {showTarget && (
          <TargetModal
            value={dailyTarget}
            onSave={(v) => { setDailyTarget(v); setShowTarget(false); showToast("Daily target set to " + v); }}
            onCancel={() => setShowTarget(false)}
          />
        )}
        {toast && (<Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} />)}
      </>
    )}
  </Authenticator>
);
```

- [ ] **Step 2: Update `Topbar.jsx`** to accept and use `user` and `signOut`:

In `frontend/src/components/Topbar.jsx`, update the dropdown sign-out item:

```jsx
<button className="dropdown-item" onClick={props.onSignOut}>Sign out</button>
```

(Already structured this way; verify the prop name matches what `App.jsx` passes — adjust `onSignOut={signOut}` accordingly.)

- [ ] **Step 3: Run dev server and test sign-up flow**

```bash
cd frontend && npm run dev
```

Open `http://localhost:8765/`. Verify:
- Authenticator UI appears.
- Sign up with email + password works (Cognito sends confirmation code; enter from email).
- Confirmed user lands on the app home page.
- DynamoDB `User-<env>` table has a row for this user (post-confirmation trigger fired).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Topbar.jsx
git commit -m "feat(frontend): gate app behind Cognito Authenticator with Google social provider"
```

---

### Task 3.3: Create `lib/api.js` Amplify Data client wrapper

**Files:**
- Create: `frontend/src/lib/api.js`

- [ ] **Step 1: Create `frontend/src/lib/api.js`**

```js
import { generateClient } from "aws-amplify/data";

export const client = generateClient({ authMode: "userPool" });

export async function listMyProblems() {
  const out = await client.models.Problem.list({
    filter: undefined, // owner-scoped automatically by @auth
    limit: 1000
  });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return (out.data || []).sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
}

export async function getMyUserRow(userId) {
  const out = await client.models.User.get({ userId });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return out.data;
}

export async function updateMyDailyTarget(userId, dailyTarget) {
  const out = await client.models.User.update({ userId, dailyTarget });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return out.data;
}

export async function updateProblemTags(id, tags) {
  const out = await client.models.Problem.update({ id, tags });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return out.data;
}

export async function extractProblem(solutionText) {
  const out = await client.mutations.extractProblem({ solutionText });
  if (out.errors?.length) {
    const errType = out.errors[0].errorType || out.errors[0].message;
    throw new Error(errType);
  }
  return out.data;
}

export async function exportMyData() {
  const out = await client.mutations.exportMyData();
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return out.data;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat(frontend): add lib/api.js wrapper around amplify-js Data client"
```

---

### Task 3.4: Replace mock data with API calls in `App.jsx`

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Composer.jsx` (no logic change; verifying)
- Delete: `frontend/src/lib/sample-data.js` (mock data no longer used; `FAKE_BANK` and `SAMPLE_PROBLEMS` go away. `buildHeatmap` is replaced by deriving from API problems.)

- [ ] **Step 1: Add a helper to derive heatmap from real problems**

Append to `frontend/src/lib/date.js`:

```js
export function buildHeatmapFromProblems(problems) {
  const cells = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map();
  for (const p of problems) {
    const k = isoDayKey(p.solvedAt);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (let i = 111; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ count: counts.get(key) || 0, dateIso: d.toISOString() });
  }
  return cells;
}
```

- [ ] **Step 2: Replace the entire `App.jsx` data layer with API calls**

```jsx
import React, { useState, useEffect } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import HomePage from "./pages/HomePage.jsx";
import DetailPage from "./pages/DetailPage.jsx";
import TargetModal from "./components/TargetModal.jsx";
import Toast from "./components/Toast.jsx";
import {
  listMyProblems, getMyUserRow, updateMyDailyTarget,
  extractProblem, updateProblemTags, exportMyData
} from "./lib/api.js";
import { buildHeatmapFromProblems } from "./lib/date.js";

const STORAGE_KEY = "lc-tracker:v1";

function loadLocalPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveLocalPrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

function AppInner({ user, signOut }) {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [route, setRoute] = useState({ name: "home" });
  const [toast, setToast] = useState(null);
  const [showTarget, setShowTarget] = useState(false);

  const cached = loadLocalPrefs();
  const [theme, setTheme] = useState(cached.theme || "light");
  const [dailyTarget, setDailyTarget] = useState(cached.dailyTarget || 3);

  // Sync theme to <html data-theme>
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = "terracotta";
    saveLocalPrefs({ theme, dailyTarget });
  }, [theme, dailyTarget]);

  // Initial load: fetch problems and user row
  useEffect(() => {
    (async () => {
      try {
        const [ps, urow] = await Promise.all([
          listMyProblems(),
          getMyUserRow(user.userId)
        ]);
        setProblems(ps);
        if (urow?.dailyTarget) setDailyTarget(urow.dailyTarget);
      } catch (e) {
        console.error(e);
        showToast("Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, [user.userId]);

  const showToast = (msg) => setToast({ msg, key: Date.now() });
  const onToggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const onComposerSubmit = async (text) => {
    setPending((n) => n + 1);
    try {
      const res = await extractProblem(text);
      const newProblem = res.problem || res;
      setProblems((arr) => [newProblem, ...arr]);
    } catch (err) {
      const code = err.message;
      if (code === "RATE_LIMIT_EXCEEDED") showToast("Today's AI quota is used up — try again tomorrow");
      else if (code === "AI_SERVICE_UNAVAILABLE") showToast("AI is temporarily unavailable, please retry");
      else if (code === "AI_INVALID_RESPONSE") showToast("Couldn't extract this one — try a clearer paste");
      else if (code === "Unauthorized") { signOut(); return; }
      else showToast("Save failed, please retry");
    } finally {
      setPending((n) => Math.max(0, n - 1));
    }
  };

  const onSaveTarget = async (v) => {
    setDailyTarget(v);
    setShowTarget(false);
    showToast("Daily target set to " + v);
    try { await updateMyDailyTarget(user.userId, v); } catch { /* localStorage already cached */ }
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
          pending={pending}
          heatmap={heatmap}
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
        <DetailPage problem={detailProblem} onBack={onBack} onUpdate={onUpdateProblem} />
      )}
      {showTarget && (
        <TargetModal value={dailyTarget} onSave={onSaveTarget} onCancel={() => setShowTarget(false)} />
      )}
      {toast && <Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} />}
    </>
  );
}

export default function App() {
  return (
    <Authenticator socialProviders={["google"]}>
      {({ signOut, user }) => <AppInner user={user} signOut={signOut} />}
    </Authenticator>
  );
}
```

- [ ] **Step 3: Delete `frontend/src/lib/sample-data.js`**

```bash
rm frontend/src/lib/sample-data.js
```

- [ ] **Step 4: End-to-end test**

```bash
# Terminal 1: sandbox
npx ampx sandbox

# Terminal 2: frontend
cd frontend && npm run dev
```

Open `http://localhost:8765/`. Sign in. Verify:
- App shows "Loading…" briefly, then empty state ("No problems yet…").
- Paste a real solution into the composer; skeleton tile appears, then a real `Problem` tile populates with title, number, difficulty, tags.
- DynamoDB `Problem-<env>` shows the row with the right `userId`.
- Click a tile → detail page shows the AI-extracted description, constraints, code in the right language tab.
- Adjust target → saved (refresh: still shows new target).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/lib/date.js
git rm frontend/src/lib/sample-data.js
git commit -m "feat(frontend): replace mock data with live amplify-js API calls"
```

---

### Task 3.5: Wire export-data flow into the topbar dropdown

**Files:**
- Modify: `frontend/src/components/Topbar.jsx`
- Modify: `frontend/src/App.jsx` (pass onExport handler)

- [ ] **Step 1: Add an "Export my data" item to the dropdown in `Topbar.jsx`**

In `Topbar.jsx`, add inside the dropdown (above Sign out):

```jsx
<button className="dropdown-item" onClick={props.onExport}>Export my data</button>
```

- [ ] **Step 2: Add the handler in `App.jsx`**

In `AppInner`, add:

```jsx
const onExport = async () => {
  showToast("Preparing export…");
  try {
    const link = await exportMyData();
    window.open(link.url, "_blank");
  } catch (e) {
    showToast("Export failed");
  }
};
```

Pass to HomePage:

```jsx
<HomePage ... onExport={onExport} ... />
```

In `HomePage.jsx`, accept and pass through to `Topbar`:

```jsx
<Topbar ... onExport={props.onExport} />
```

- [ ] **Step 3: Test**

In dev mode, sign in, click avatar → "Export my data". Expected: a new tab opens with a JSON file download (or inline view) containing the user's problems.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Topbar.jsx frontend/src/App.jsx frontend/src/pages/HomePage.jsx
git commit -m "feat(frontend): add export-my-data action to topbar dropdown"
```

---

## Phase 4: Deployment & Monitoring

> Goal: `main` branch deploys automatically to a public Amplify Hosting URL, with CloudWatch alarms and budget alerts wired.

### Task 4.1: Create `amplify.yml` build spec

**Files:**
- Create: `amplify.yml` (root)

- [ ] **Step 1: Create `amplify.yml`**

```yaml
version: 1
applications:
  - frontend:
      phases:
        preBuild:
          commands:
            - cd frontend && npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: frontend/dist
        files:
          - '**/*'
      cache:
        paths:
          - frontend/node_modules/**/*
      appRoot: frontend
    backend:
      phases:
        build:
          commands:
            - npm ci --cache .npm --prefer-offline
            - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
```

- [ ] **Step 2: Commit**

```bash
git add amplify.yml
git commit -m "feat: add Amplify Hosting build spec"
```

---

### Task 4.2: Connect repo to Amplify Hosting and deploy

This is a manual step done in the AWS console:

- [ ] **Step 1: AWS Console → Amplify → "Create new app" → "Host web app"**
- [ ] **Step 2: Connect GitHub repo, select `main` branch**
- [ ] **Step 3: Amplify auto-detects `amplify.yml`. Confirm build settings.**
- [ ] **Step 4: Deploy. Initial deploy creates the prod backend stack.**
- [ ] **Step 5: After deploy, copy the `https://main.<APP_ID>.amplifyapp.com/` URL.**
- [ ] **Step 6: Add this URL to Cognito callback URLs in `amplify/auth/resource.ts`** (replacing the `<APP_ID>` placeholder), commit, and push to trigger a redeploy.

```bash
git add amplify/auth/resource.ts
git commit -m "chore(amplify/auth): add prod hosting URL to Cognito callbacks"
git push
```

- [ ] **Step 7: Set prod-environment Anthropic API key**

In Amplify Hosting console → app → "Secrets" tab → set `ANTHROPIC_API_KEY` for the `main` branch. (And `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if using Google.)

- [ ] **Step 8: Smoke-test prod**

Open `https://main.<APP_ID>.amplifyapp.com/`. Sign up, paste a solution, verify end-to-end flow works.

---

### Task 4.3: CloudWatch alarms

**Files:**
- Create: `amplify/monitoring/resource.ts`
- Modify: `amplify/backend.ts`

- [ ] **Step 1: Create `amplify/monitoring/resource.ts`**

```ts
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

const ALARM_EMAIL = process.env.OPS_ALARM_EMAIL || "ops@example.com"; // override per env

export function defineMonitoring(scope: Construct, opts: {
  extractFunctionName: string;
  appsyncApiId: string;
}) {
  const topic = new sns.Topic(scope, "OpsAlarmTopic");
  topic.addSubscription(new snsSubs.EmailSubscription(ALARM_EMAIL));

  // 1. Lambda errors > 5 in 5 min
  new cloudwatch.Alarm(scope, "ExtractProblemErrorsAlarm", {
    metric: new cloudwatch.Metric({
      namespace: "AWS/Lambda",
      metricName: "Errors",
      dimensionsMap: { FunctionName: opts.extractFunctionName },
      statistic: "Sum",
      period: cloudwatch.Duration.minutes(5)
    } as any),
    threshold: 5,
    evaluationPeriods: 1
  }).addAlarmAction({ bind: () => ({ alarmActionArn: topic.topicArn }) } as any);

  // 2. Lambda invocations > 1000 in 1 hour (anomaly detection)
  new cloudwatch.Alarm(scope, "ExtractProblemVolumeAlarm", {
    metric: new cloudwatch.Metric({
      namespace: "AWS/Lambda",
      metricName: "Invocations",
      dimensionsMap: { FunctionName: opts.extractFunctionName },
      statistic: "Sum",
      period: cloudwatch.Duration.hours(1)
    } as any),
    threshold: 1000,
    evaluationPeriods: 1
  }).addAlarmAction({ bind: () => ({ alarmActionArn: topic.topicArn }) } as any);

  // 3. AppSync 5xx errors
  new cloudwatch.Alarm(scope, "AppSyncErrorsAlarm", {
    metric: new cloudwatch.Metric({
      namespace: "AWS/AppSync",
      metricName: "5XXError",
      dimensionsMap: { GraphQLAPIId: opts.appsyncApiId },
      statistic: "Sum",
      period: cloudwatch.Duration.minutes(5)
    } as any),
    threshold: 5,
    evaluationPeriods: 1
  }).addAlarmAction({ bind: () => ({ alarmActionArn: topic.topicArn }) } as any);

  return topic;
}
```

- [ ] **Step 2: Wire into `amplify/backend.ts`**

```ts
import { defineMonitoring } from "./monitoring/resource";

defineMonitoring(backend.createStack("Monitoring"), {
  extractFunctionName: backend.functions.extractProblem.resources.lambda.functionName,
  appsyncApiId: backend.data.resources.cfnResources.cfnGraphqlApi.attrApiId
});
```

- [ ] **Step 3: Set OPS_ALARM_EMAIL env in Amplify Hosting console** (per branch)

- [ ] **Step 4: Commit**

```bash
git add amplify/monitoring/ amplify/backend.ts
git commit -m "feat(amplify/monitoring): CloudWatch alarms for Lambda errors, volume, AppSync 5xx"
```

---

### Task 4.4: AWS Budgets

This is a manual one-time setup in the AWS console:

- [ ] **Step 1: AWS Console → Billing → Budgets → "Create budget"**
- [ ] **Step 2: "Cost budget" → name "lc-tracker-monthly" → $20/month**
- [ ] **Step 3: Add 2 email alerts: at 80% and 100% actual spend**
- [ ] **Step 4: Verify by setting `Threshold: $0.01` temporarily, refresh, see "Alert State: Active", then revert.**

---

### Task 4.5: Anthropic budget cap

- [ ] **Step 1: Anthropic Console → Workspaces → Settings → set monthly budget cap to $10/month**
- [ ] **Step 2: Configure email alerts for 80% and 100%**

---

### Task 4.6: Final end-to-end smoke test

- [ ] **Step 1: From a fresh browser (incognito), open the prod URL.**
- [ ] **Step 2: Sign up with a fresh email; verify email confirmation flow.**
- [ ] **Step 3: Paste 3 different solutions (Python, C++, Java). Verify each lands in the correct language slot.**
- [ ] **Step 4: Verify heatmap renders with new entries.**
- [ ] **Step 5: Hit `extractProblem` 50+ times rapidly to trigger rate limit; verify the toast appears.**
- [ ] **Step 6: Click "Export my data"; verify JSON downloads with the right items.**
- [ ] **Step 7: Sign out, refresh; verify Authenticator UI gates the page.**

---

## Self-Review Notes

(Filled in during plan author's self-review, before handoff.)

- **Spec coverage:** Every section of the spec maps to one or more tasks. Auth (§3) → 2.2, 2.4. Data model (§4) → 2.3. API surface (§5) → 2.5, 2.6, 3.3. AI Lambda (§6) → 2.5. S3 buckets (§7) → 2.7. Frontend bundler migration (§8) → Phase 1. Deployment (§9) → Phase 4. Guardrails (§10) → 4.3, 4.4, 4.5. Error contract (§11) → 3.4 step 2 (composer error mapping). Testing (§12) → 2.5 step 4–8 (Lambda unit tests).
- **Placeholders:** Verified — no `TBD` / `TODO`. The two flagged uncertainties (`<APP_ID>` in Cognito callbacks, the precise Amplify Gen 2 cross-resource grant API, the lifecycle-rule API shape) are explicitly called out as "filled in later" with intent specified, not as placeholders to be resolved later by guess.
- **Type consistency:** `Problem.solutions` is `AWSJSON` in the GraphQL schema and `Record<string, string>` in the Lambda handler — consistent. `RateLimit` partition key is `userId` + sort key `dayKey` in §4 of the spec, the data resource, and the Lambda — consistent.
