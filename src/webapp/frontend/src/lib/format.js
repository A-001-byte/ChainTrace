export const pct = (x, d = 1) => `${(Number(x) * 100).toFixed(d)}%`;
export const num = (x) => (x === null || x === undefined ? "—" : Number(x).toLocaleString());
export const short = (s, n = 22) => (String(s ?? "").length > n ? String(s).slice(0, n) + "…" : String(s ?? "—"));
export const f3 = (v) => (typeof v === "number" ? v.toFixed(3) : "—");

/** Tag/text tone for a risk score: "hi" (red) / "lo" (green) / "" (neutral). */
export function tone(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "";
  return score >= 0.6 ? "hi" : score < 0.4 ? "lo" : "";
}

/** Counts of a categorical field -> [{k, n}], biggest first. */
export function tally(rows, pick, limit = 12) {
  const m = new Map();
  for (const r of rows) {
    const k = typeof pick === "function" ? pick(r) : r[pick];
    if (k === null || k === undefined || k === "") continue;
    m.set(String(k), (m.get(String(k)) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, limit);
}

/** Equal-width buckets over a numeric field -> [{k, n, x}] for a distribution chart. */
export function buckets(rows, field, { min = 0, max = 1, count = 10 } = {}) {
  const w = (max - min) / count;
  const out = Array.from({ length: count }, (_, i) => ({ k: (min + i * w).toFixed(1), x: min + i * w, n: 0 }));
  for (const r of rows) {
    const v = r[field];
    if (typeof v !== "number" || Number.isNaN(v)) continue;
    out[Math.min(count - 1, Math.max(0, Math.floor((v - min) / w)))].n += 1;
  }
  return out;
}
