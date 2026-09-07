async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error || `Request to ${url} failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export function getStats() {
  return fetchJson("/api/stats");
}

export function getAlerts() {
  return fetchJson("/api/alerts");
}

export function getEntity(nodeId) {
  return fetchJson(`/api/entity/${encodeURIComponent(nodeId)}`);
}

export function getKickDownDoors(nodeId) {
  return fetchJson(`/api/entity/${encodeURIComponent(nodeId)}/kick-down-doors`);
}

export function getGeo() {
  return fetchJson("/api/geo");
}
export function getGraphData() {
  return fetchJson("/api/graph-data");
}

// Superset of getEntity(): resolves any node_id, not just the top-N ranked alerts.
export function lookupEntity(nodeId) {
  return fetchJson(`/api/entity-lookup/${encodeURIComponent(nodeId)}`);
}

export function getEntityHours(nodeId) {
  return fetchJson(`/api/entity-hours/${encodeURIComponent(nodeId)}`);
}
