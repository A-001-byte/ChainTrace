// Cluster ids are nominal labels, never a status. On the light canvas they take a
// violet-to-slate ramp: separable against white, and clearly distinct from the
// red/green that carry risk meaning.
const RAMP = ["#7132f5", "#2e3350", "#686b82", "#4f24ad", "#484b5e", "#9497a9", "#202333"];

/** Stable tone for a cluster id; hairline grey for unclustered / context. */
export function clusterColor(clusterId) {
  if (clusterId === null || clusterId === undefined) return "#d4d4dc";
  const n = Number(clusterId);
  if (Number.isNaN(n)) return "#d4d4dc";
  // spread ids across the ramp with a multiplicative hash so adjacent ids differ
  return RAMP[((n * 7) + (n >> 3)) % RAMP.length];
}

export { RAMP as CLUSTER_PALETTE };
