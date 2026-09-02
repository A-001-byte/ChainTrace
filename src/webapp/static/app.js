/* ChainTrace alternative web frontend — vanilla JS, no framework/build step.
 * Fetches from the four Flask endpoints and renders into the DOM. Sorting/filtering on
 * the alert table happens client-side against the already-fetched data, so switching
 * filters doesn't refetch.
 */

const state = {
  alerts: [],
  filterNodeType: "",
  sortField: "risk_score",
  sortDir: "desc",
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value === null || value === undefined ? "" : String(value);
  return div.innerHTML;
}

function riskTierClass(score) {
  if (score >= 0.8) return "risk-high";
  if (score >= 0.6) return "risk-medium";
  return "risk-low";
}

function shortenId(id, maxLen = 34) {
  if (!id) return "";
  return id.length > maxLen ? `${id.slice(0, maxLen)}…` : id;
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body && body.error ? body.error : `Request to ${url} failed (${res.status})`);
  }
  return body;
}

function showError(elId, message) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

/* ---------- Stats ---------- */

async function loadStats() {
  try {
    const stats = await fetchJson("/api/stats");
    renderStats(stats);
  } catch (err) {
    showError("stats-error", `Could not load stats: ${err.message}`);
  }
}

function renderStats(stats) {
  const walletCount = stats.node_type_breakdown?.wallet ?? 0;
  const txCount = stats.node_type_breakdown?.tx ?? 0;

  const cards = [
    {
      label: "Total Flagged",
      value: stats.total_flagged.toLocaleString(),
      sub: `${stats.risk_tier_counts.high} high · ${stats.risk_tier_counts.medium} medium · ${stats.risk_tier_counts.low} low`,
    },
    {
      label: "Avg Risk Score",
      value: stats.avg_risk_score.toFixed(3),
      sub: stats.avg_classifier_confidence !== null ? `classifier avg: ${stats.avg_classifier_confidence.toFixed(3)}` : "",
    },
    {
      label: "High Risk",
      value: stats.risk_tier_counts.high.toLocaleString(),
      sub: `risk_score ≥ ${stats.risk_tier_thresholds.high}`,
    },
    {
      label: "Wallets vs Tx",
      value: `${walletCount.toLocaleString()} / ${txCount.toLocaleString()}`,
      sub: "flagged wallet nodes / flagged tx nodes",
    },
  ];

  const container = document.getElementById("stats-cards");
  container.innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card">
        <div class="stat-label">${escapeHtml(c.label)}</div>
        <div class="stat-value">${escapeHtml(c.value)}</div>
        <div class="stat-subtext">${escapeHtml(c.sub)}</div>
      </div>`
    )
    .join("");
}

/* ---------- Alerts table ---------- */

async function loadAlerts() {
  try {
    state.alerts = await fetchJson("/api/alerts");
    renderAlertsTable();
  } catch (err) {
    showError("alerts-error", `Could not load alerts: ${err.message}`);
    document.getElementById("alerts-tbody").innerHTML =
      '<tr><td colspan="6" class="empty-row">No alert data available.</td></tr>';
  }
}

function getFilteredSortedAlerts() {
  let rows = state.alerts;
  if (state.filterNodeType) {
    rows = rows.filter((r) => (r.node_type || "").toLowerCase() === state.filterNodeType);
  }
  const field = state.sortField;
  const dir = state.sortDir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const av = a[field] ?? 0;
    const bv = b[field] ?? 0;
    return av > bv ? dir : av < bv ? -dir : 0;
  });
  return rows;
}

function renderAlertsTable() {
  const rows = getFilteredSortedAlerts();
  const tbody = document.getElementById("alerts-tbody");

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No alerts match the current filter.</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const risk = typeof row.risk_score === "number" ? row.risk_score : 0;
      return `
      <tr>
        <td class="node-id-cell" title="${escapeHtml(row.node_id)}">${escapeHtml(shortenId(row.node_id))}</td>
        <td><span class="type-pill">${escapeHtml(row.node_type || "—")}</span></td>
        <td>${escapeHtml(row.label || "—")}</td>
        <td class="mono">${escapeHtml(row.cluster_id ?? "—")}</td>
        <td><span class="risk-pill ${riskTierClass(risk)}">${risk.toFixed(4)}</span></td>
        <td class="reason-cell">${escapeHtml(row.reason || "")}</td>
      </tr>`;
    })
    .join("");
}

function wireAlertControls() {
  document.getElementById("filter-node-type").addEventListener("change", (e) => {
    state.filterNodeType = e.target.value;
    renderAlertsTable();
  });

  document.getElementById("sort-field").addEventListener("change", (e) => {
    state.sortField = e.target.value;
    renderAlertsTable();
  });

  const dirBtn = document.getElementById("sort-direction");
  dirBtn.addEventListener("click", () => {
    state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
    dirBtn.dataset.dir = state.sortDir;
    dirBtn.textContent = state.sortDir === "desc" ? "▼ Desc" : "▲ Asc";
    renderAlertsTable();
  });

  // Clicking a column header also sorts by that column (risk score / cluster only —
  // the other columns are text, sorting by them client-side is available via the
  // dropdown-driven fields above which cover the numeric metrics investigators care about).
  document.querySelectorAll("#alerts-table thead th").forEach((th, index) => {
    const sortableFields = ["node_id", null, "label", "cluster_id", "risk_score", null];
    const field = sortableFields[index];
    if (!field) return;
    th.addEventListener("click", () => {
      state.sortField = field;
      document.getElementById("sort-field").value = ["risk_score", "classifier_confidence", "anomaly_score"].includes(field)
        ? field
        : "risk_score";
      renderAlertsTable();
    });
  });
}

/* ---------- Geo ---------- */

async function loadGeo() {
  try {
    const geo = await fetchJson("/api/geo");
    renderGeo(geo);
  } catch (err) {
    showError("geo-error", `Could not load geo data: ${err.message}`);
  }
}

function renderBarList(elId, rows, labelKey) {
  const el = document.getElementById(elId);
  if (!rows || rows.length === 0) {
    el.innerHTML = '<p class="empty-row">No geo data available.</p>';
    return;
  }
  const max = Math.max(...rows.map((r) => r.count));
  el.innerHTML = rows
    .map(
      (r) => `
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(r[labelKey])}">${escapeHtml(r[labelKey])}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.count / max) * 100}%"></div></div>
        <div class="bar-count">${r.count.toLocaleString()}</div>
      </div>`
    )
    .join("");
}

function renderGeo(geo) {
  renderBarList("geo-country-bars", geo.by_country, "country");
  renderBarList("geo-asn-bars", geo.by_asn, "asn");
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", () => {
  wireAlertControls();
  loadStats();
  loadAlerts();
  loadGeo();
  // /api/graph is embedded directly via the iframe's src in index.html — no fetch needed.
});
