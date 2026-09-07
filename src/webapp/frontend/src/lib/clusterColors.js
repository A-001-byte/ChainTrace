// Categorical palette for Louvain cluster_id. Deliberately categorical (hue-varied,
// similar lightness) rather than a sequential ramp: cluster ids are nominal labels, so a
// gradient would imply an ordering between clusters that does not exist.
// Tuned for legibility on the dark forensic canvas and kept clear of the risk reds/ambers
// so a cluster hue is never mistaken for a risk signal.
const CLUSTER_PALETTE = [
  "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15",
  "#22d3ee", "#fb923c", "#4ade80", "#c084fc", "#60a5fa",
  "#2dd4bf", "#e879f9", "#a3e635", "#818cf8", "#fbbf24",
];

/** Stable colour for a cluster id. Same id always gets the same hue across views. */
export function clusterColor(clusterId) {
  if (clusterId === null || clusterId === undefined) return "#3f4c63"; // unclustered / context
  const n = Number(clusterId);
  if (Number.isNaN(n)) return "#3f4c63";
  return CLUSTER_PALETTE[Math.abs(n) % CLUSTER_PALETTE.length];
}

export { CLUSTER_PALETTE };
