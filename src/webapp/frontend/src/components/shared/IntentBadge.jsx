// Intent archetypes are CATEGORICAL, not severity — so they take the Iris Violet /
// Lavender / Signal Teal tag family rather than any risk colour. A "Ransomware-shaped"
// badge must not read as "high risk"; it reads as "this shape, not that shape".
const ARCHETYPE_COLORS = {
  "Ransomware-shaped": "var(--color-iris-violet)",
  "Darknet-market-shaped": "var(--color-lavender)",
  "Sanctions-evasion-shaped": "var(--color-signal-teal)",
  "Pattern unclear": "var(--color-ash)",
  "Insufficient signal": "var(--color-ash)",
};

const ARCHETYPE_TINTS = {
  "Ransomware-shaped": "rgba(99, 102, 241, 0.05)",
  "Darknet-market-shaped": "rgba(139, 92, 246, 0.05)",
  "Sanctions-evasion-shaped": "rgba(2, 184, 204, 0.05)",
  "Pattern unclear": "rgba(98, 102, 109, 0.05)",
  "Insufficient signal": "rgba(98, 102, 109, 0.05)",
};

const ARCHETYPE_LINES = {
  "Ransomware-shaped": "rgba(99, 102, 241, 0.28)",
  "Darknet-market-shaped": "rgba(139, 92, 246, 0.28)",
  "Sanctions-evasion-shaped": "rgba(2, 184, 204, 0.28)",
  "Pattern unclear": "rgba(98, 102, 109, 0.28)",
  "Insufficient signal": "rgba(98, 102, 109, 0.28)",
};

export function intentColor(label) {
  return ARCHETYPE_COLORS[label] ?? "var(--color-ash)";
}

export default function IntentBadge({ label }) {
  if (!label) return null;
  return (
    <span
      className="badge"
      style={{
        color: intentColor(label),
        background: ARCHETYPE_TINTS[label] ?? "rgba(98, 102, 109, 0.05)",
        boxShadow: `${ARCHETYPE_LINES[label] ?? "rgba(98, 102, 109, 0.28)"} 0px 0px 0px 1px inset`,
      }}
    >
      {label}
    </span>
  );
}
