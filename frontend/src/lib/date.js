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
