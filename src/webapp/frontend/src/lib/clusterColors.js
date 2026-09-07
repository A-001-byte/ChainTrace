// Categorical palette for Louvain cluster_id — nominal labels, so the palette varies hue
// at roughly constant weight rather than running a gradient (a ramp would imply an
// ordering between clusters that doesn't exist).
//
// Drawn from the system's chromatic set (Iris Violet, Lavender, Signal Teal) plus
// same-weight neighbours. Two colours are deliberately EXCLUDED:
//   - Acid Lime  — reserved exclusively for action/interactive.
//   - Coral Red / Pulse Green / amber — reserved for risk severity.
// So a cluster hue can never be misread as either "clickable" or "dangerous".
const CLUSTER_PALETTE = [
  "#6366f1", // iris violet
  "#02b8cc", // signal teal
  "#8b5cf6", // lavender
  "#4b8bf5", // muted blue
  "#a78bfa", // light lavender
  "#3fa9c9", // desaturated cyan
  "#7c6ff0", // periwinkle
  "#5aa9e6", // steel blue
  "#9d7cf0", // orchid
  "#3d9bd1", // slate cyan
  "#8896f2", // haze blue
  "#6ec1d4", // pale teal
];

/** Stable colour for a cluster id. Same id always gets the same hue across views. */
export function clusterColor(clusterId) {
  if (clusterId === null || clusterId === undefined) return "#383b3f"; // smoke: unclustered / context
  const n = Number(clusterId);
  if (Number.isNaN(n)) return "#383b3f";
  return CLUSTER_PALETTE[Math.abs(n) % CLUSTER_PALETTE.length];
}

export { CLUSTER_PALETTE };
