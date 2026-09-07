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

export function getGeo() {
  return fetchJson("/api/geo");
}