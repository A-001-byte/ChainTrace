// Single source of truth for how a risk score is described and coloured.
//
// Risk severity keeps semantic colour and is held strictly SEPARATE from the action
// accent: Acid Lime (#e4f222) means "interactive", never "dangerous". Amber is
// desaturated (#d99a4e) so it sits at the same visual weight as Coral Red and Pulse
// Green rather than reading as a bright orange against the muted palette.
//
// Thresholds mirror the backend's risk_tier_thresholds (high 0.8, medium 0.6).

export const RISK_TIERS = [
  { key: "critical", label: "Critical", min: 0.8, color: "var(--risk-high)",   tint: "var(--risk-high-tint)",   line: "var(--risk-high-line)" },
  { key: "high",     label: "High",     min: 0.6, color: "var(--risk-high)",   tint: "var(--risk-high-tint)",   line: "var(--risk-high-line)" },
  { key: "medium",   label: "Medium",   min: 0.4, color: "var(--risk-medium)", tint: "var(--risk-medium-tint)", line: "var(--risk-medium-line)" },
  { key: "low",      label: "Low",      min: 0.0, color: "var(--risk-low)",    tint: "var(--risk-low-tint)",    line: "var(--risk-low-line)" },
];

export function riskTier(score) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return { key: "none", label: "Unscored", min: 0, color: "var(--risk-none)", tint: "transparent", line: "var(--color-graphite)" };
  }
  return RISK_TIERS.find((t) => score >= t.min) ?? RISK_TIERS[RISK_TIERS.length - 1];
}

/** Raw hex for canvas contexts (vis-network) that can't resolve CSS variables. */
export function riskHex(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "#62666d"; // ash
  if (score >= 0.6) return "#eb5757"; // coral red
  if (score >= 0.4) return "#d99a4e"; // muted amber
  return "#27a644";                   // pulse green
}
