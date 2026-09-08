import { riskTier } from "./risk";

export const pct = (x, d = 1) => `${(Number(x) * 100).toFixed(d)}%`;
export const num = (x) => (x === null || x === undefined ? "—" : Number(x).toLocaleString());
export const short = (s, n = 22) => (String(s ?? "").length > n ? String(s).slice(0, n) + "…" : String(s ?? "—"));
export const f3 = (v) => (typeof v === "number" ? v.toFixed(3) : "—");

/** Tag tone for a risk score: "hi" (orange) / "lo" (green) / "" (neutral). */
export function tone(score) {
  const t = riskTier(score).key;
  return t === "critical" || t === "high" ? "hi" : t === "low" ? "lo" : "";
}
