// Single source of truth for how a risk score is described and coloured, so the KPI
// cards, the alert tables, the risk distribution bar and the graph all agree.
// Thresholds mirror the backend's risk_tier_thresholds (high 0.8, medium 0.6).

export const RISK_TIERS = [
  { key: "critical", label: "Critical", min: 0.8, color: "var(--risk-critical)", dim: "var(--risk-critical-dim)" },
  { key: "high",     label: "High",     min: 0.6, color: "var(--risk-high)",     dim: "var(--risk-high-dim)" },
  { key: "medium",   label: "Medium",   min: 0.4, color: "var(--risk-medium)",   dim: "var(--risk-medium-dim)" },
  { key: "low",      label: "Low",      min: 0.0, color: "var(--risk-low)",      dim: "var(--risk-low-dim)" },
];

export function riskTier(score) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return { key: "none", label: "Unscored", min: 0, color: "var(--risk-none)", dim: "transparent" };
  }
  return RISK_TIERS.find((t) => score >= t.min) ?? RISK_TIERS[RISK_TIERS.length - 1];
}

/** Raw hex for canvas/WebGL contexts (vis-network) that can't resolve CSS variables. */
export function riskHex(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "#64748b";
  if (score >= 0.8) return "#ff2d55";
  if (score >= 0.6) return "#ff6b35";
  if (score >= 0.4) return "#ffb020";
  return "#22c55e";
}
