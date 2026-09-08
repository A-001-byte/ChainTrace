// Cluster ids are nominal labels. The Factory system allows no accent beyond signal orange
// and metric green (both reserved for data state), so clusters take a NEUTRAL luminance
// ramp: distinct enough to separate neighbours in a graph, never mistaken for a status.
const RAMP = ["#4d4947", "#6b6663", "#8a8380", "#a29c98", "#b8b3b0", "#d3cfcc", "#eeeeee"];

/** Stable neutral tone for a cluster id; slate for unclustered / context. */
export function clusterColor(clusterId) {
  if (clusterId === null || clusterId === undefined) return "#3d3a39";
  const n = Number(clusterId);
  if (Number.isNaN(n)) return "#3d3a39";
  // spread ids across the ramp with a multiplicative hash so adjacent ids differ
  return RAMP[((n * 7) + (n >> 3)) % RAMP.length];
}

export { RAMP as CLUSTER_PALETTE };
