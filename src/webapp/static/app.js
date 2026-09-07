/* ChainTrace alternative web frontend — vanilla JS, no framework/build step.
 * Fetches from the Flask endpoints and renders into the DOM. Filtering/sorting on the
 * alert table happens client-side against the already-fetched data (except the raw
 * transaction stream, which is paginated server-side since it can be the full ~200k-row
 * dataset).
 */

const state = {
  alerts: [],
  filterNodeType: "",
  filterMinRisk: 0,
  filterClusters: [],   // selected cluster_id values (as strings), empty = all
  filterCountries: [],  // selected geo_country values, empty = all
  filterSearch: "",
  sortField: "risk_score",
  sortDir: "desc",
  selectedEntity: null,
  rawPage: { limit: 25, offset: 0, total: 0 },
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

const INTENT_PILL_CLASS = {
  "Ransomware-shaped": "intent-ransomware",
  "Darknet-market-shaped": "intent-darknet",
  "Sanctions-evasion-shaped": "intent-sanctions",
  "Pattern unclear": "intent-unclear",
  "Insufficient signal": "intent-insufficient",
};

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

/* ---------- Header: data source badge, warnings, system time ---------- */

function renderSourceBadge(sourceLabel) {
  const badge = document.getElementById("source-badge");
  if (!sourceLabel) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = sourceLabel;
  badge.classList.remove("badge-green", "badge-amber", "badge-cyan");
  if (sourceLabel.includes("Live")) {
    badge.classList.add("badge-green");
    badge.textContent = "● " + sourceLabel;
  } else if (sourceLabel.includes("Partial")) {
    badge.classList.add("badge-amber");
    badge.textContent = "▲ " + sourceLabel;
  } else {
    badge.classList.add("badge-cyan");
    badge.textContent = "◆ " + sourceLabel;
  }
}

function renderWarnings(warnings) {
  const el = document.getElementById("warnings-banner");
  if (!warnings || warnings.length === 0) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = warnings.map((w) => `<div class="warning-row">⚠️ ${escapeHtml(w)}</div>`).join("");
}

function startSystemClock() {
  const el = document.getElementById("system-time");
  const tick = () => {
    el.textContent = "System Time: " + new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- Stats ---------- */

async function loadStats() {
  try {
    const stats = await fetchJson("/api/stats");
    renderStats(stats);
    renderSourceBadge(stats.data_source_label);
    renderWarnings(stats.warnings);
  } catch (err) {
    showError("stats-error", `Could not load stats: ${err.message}`);
  }
}

function renderStats(stats) {
  // Matches Streamlit's render_stat_cards() 4 metrics exactly: total transactions,
  // flagged+critical counts, avg confidence among flagged, distinct clusters among flagged.
  const cards = [
    {
      label: "Total Transactions",
      value: stats.total_transactions.toLocaleString(),
      sub: "Unified Elliptic + Network Stream",
    },
    {
      label: "Suspicious Entities Flagged",
      value: stats.flagged_count.toLocaleString(),
      sub: `${stats.high_risk_count} Critical (Score ≥ ${stats.risk_tier_thresholds.high})`,
      accent: "danger",
    },
    {
      label: "Avg ML Confidence",
      value: `${stats.flagged_avg_confidence_pct.toFixed(1)}%`,
      sub: "Random + Isolation Forest Blend",
      accent: "warning",
    },
    {
      label: "Louvain Clusters Detected",
      value: stats.distinct_clusters.toLocaleString(),
      sub: "Entity Community Subgraphs",
      accent: "cyan",
    },
  ];

  const container = document.getElementById("stats-cards");
  container.innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card${c.accent ? " stat-accent-" + c.accent : ""}">
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
    const body = await fetchJson("/api/alerts");
    state.alerts = body.rows;
    populateFilterOptions();
    renderAlertsTable();
  } catch (err) {
    showError("alerts-error", `Could not load alerts: ${err.message}`);
    document.getElementById("alerts-tbody").innerHTML =
      '<tr><td colspan="7" class="empty-row">No alert data available.</td></tr>';
  }
}

function populateFilterOptions() {
  const clusters = [...new Set(state.alerts.map((r) => String(r.cluster_id ?? "")).filter(Boolean))].sort();
  const countries = [...new Set(state.alerts.map((r) => r.geo_country).filter((c) => c && c !== "Unknown"))].sort();

  const clusterSel = document.getElementById("filter-cluster");
  clusterSel.innerHTML = clusters.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  const countrySel = document.getElementById("filter-country");
  countrySel.innerHTML = countries.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

function getFilteredSortedAlerts() {
  let rows = state.alerts;

  if (state.filterNodeType) {
    rows = rows.filter((r) => (r.node_type || "").toLowerCase() === state.filterNodeType);
  }
  if (state.filterMinRisk > 0) {
    rows = rows.filter((r) => (r.risk_score ?? 0) >= state.filterMinRisk);
  }
  if (state.filterClusters.length > 0) {
    rows = rows.filter((r) => state.filterClusters.includes(String(r.cluster_id ?? "")));
  }
  if (state.filterCountries.length > 0) {
    rows = rows.filter((r) => state.filterCountries.includes(r.geo_country));
  }
  if (state.filterSearch) {
    const q = state.filterSearch.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.node_id || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q) ||
        String(r.asn || "").toLowerCase().includes(q)
    );
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
  document.getElementById("alerts-count-caption").textContent = `Showing ${rows.length} of ${state.alerts.length} flagged leads.`;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No alerts match the current filter.</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const risk = typeof row.risk_score === "number" ? row.risk_score : 0;
      const isSelected = state.selectedEntity === row.node_id;
      return `
      <tr class="alert-row${isSelected ? " alert-row-selected" : ""}" data-node-id="${escapeHtml(row.node_id)}">
        <td class="node-id-cell" title="${escapeHtml(row.node_id)}">${escapeHtml(shortenId(row.node_id))}</td>
        <td><span class="type-pill">${escapeHtml(row.node_type || "—")}</span></td>
        <td>${escapeHtml(row.label || "—")}</td>
        <td class="mono">${escapeHtml(row.cluster_id ?? "—")}</td>
        <td><span class="risk-pill ${riskTierClass(risk)}">${risk.toFixed(4)}</span></td>
        <td class="reason-cell">${escapeHtml(row.reason || "")}</td>
        <td class="intent-cell">${renderIntentCell(row)}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("tr.alert-row").forEach((tr) => {
    tr.addEventListener("click", () => selectEntity(tr.dataset.nodeId));
  });
}

function renderIntentCell(row) {
  if (!row.intent_label) return "—";
  const pillClass = INTENT_PILL_CLASS[row.intent_label] || "intent-unclear";
  const confidence = typeof row.intent_confidence === "number" ? row.intent_confidence.toFixed(2) : "—";
  const explanation = row.intent_explanation || "";
  return `
    <span class="intent-pill ${pillClass}" title="${escapeHtml(explanation)}">${escapeHtml(row.intent_label)}</span>
    <div class="intent-confidence">conf ${confidence}</div>
    ${explanation ? `<div class="intent-explanation">${escapeHtml(explanation)}</div>` : ""}
  `;
}

function wireAlertControls() {
  document.getElementById("filter-node-type").addEventListener("change", (e) => {
    state.filterNodeType = e.target.value;
    renderAlertsTable();
  });

  document.getElementById("filter-search").addEventListener("input", (e) => {
    state.filterSearch = e.target.value;
    renderAlertsTable();
  });

  const minRiskInput = document.getElementById("filter-min-risk");
  minRiskInput.addEventListener("input", (e) => {
    state.filterMinRisk = parseFloat(e.target.value);
    document.getElementById("min-risk-value").textContent = state.filterMinRisk.toFixed(2);
    renderAlertsTable();
  });

  document.getElementById("filter-cluster").addEventListener("change", (e) => {
    state.filterClusters = Array.from(e.target.selectedOptions).map((o) => o.value);
    renderAlertsTable();
  });

  document.getElementById("filter-country").addEventListener("change", (e) => {
    state.filterCountries = Array.from(e.target.selectedOptions).map((o) => o.value);
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

  document.getElementById("clear-filters").addEventListener("click", () => {
    state.filterNodeType = "";
    state.filterMinRisk = 0;
    state.filterClusters = [];
    state.filterCountries = [];
    state.filterSearch = "";
    document.getElementById("filter-node-type").value = "";
    document.getElementById("filter-search").value = "";
    document.getElementById("filter-min-risk").value = 0;
    document.getElementById("min-risk-value").textContent = "0.00";
    document.getElementById("filter-cluster").selectedIndex = -1;
    document.getElementById("filter-country").selectedIndex = -1;
    renderAlertsTable();
  });
}

/* ---------- Entity drill-down (matches Streamlit's render_entity_drilldown) ---------- */

async function selectEntity(nodeId) {
  state.selectedEntity = nodeId;
  renderAlertsTable(); // re-render to highlight the selected row

  const panel = document.getElementById("drilldown-panel");
  panel.hidden = false;
  panel.innerHTML = '<p class="loading-row">Loading entity details…</p>';
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  // Focus the same entity in the graph iframe — a full reload with ?focus=, same
  // one-shot re-render behavior Streamlit itself uses (each rerun rebuilds the whole
  // graph HTML with the new selected_entity too, not an incremental update).
  document.getElementById("graph-frame").src = "/api/graph?focus=" + encodeURIComponent(nodeId);
  document.getElementById("graph-caption").textContent = `🎯 Currently focusing graph node: ${nodeId}`;

  try {
    const data = await fetchJson(`/api/entity/${encodeURIComponent(nodeId)}`);
    renderDrilldown(data);
  } catch (err) {
    panel.innerHTML = `<p class="error-banner">Could not load entity details: ${escapeHtml(err.message)}</p>`;
  }
}

function riskBadge(score) {
  if (score >= 0.8) return { cls: "risk-high", label: "HIGH RISK / CRITICAL ILLICIT" };
  if (score >= 0.6) return { cls: "risk-medium", label: "MEDIUM RISK / SUSPICIOUS" };
  return { cls: "risk-low", label: "LOW RISK / MONITORING" };
}

function renderDrilldown(data) {
  const a = data.alert;
  const panel = document.getElementById("drilldown-panel");
  const score = a.risk_score ?? 0;
  const badge = riskBadge(score);

  const reasons = String(a.reason || "")
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);

  const linkedRows = (data.linked_transactions || [])
    .map(
      (tx) => `
      <tr>
        <td class="mono">${escapeHtml(tx.txid)}</td>
        <td>${escapeHtml(tx.timestamp)}</td>
        <td class="mono">${escapeHtml(tx.src_ip)}</td>
        <td class="mono">${escapeHtml(tx.dst_ip)}</td>
        <td>${escapeHtml(tx.script_type)}</td>
        <td>${escapeHtml(tx.fee)}</td>
        <td>${escapeHtml(tx.geo_country)}</td>
        <td>${escapeHtml(tx.asn)}</td>
      </tr>`
    )
    .join("");

  panel.innerHTML = `
    <div class="drilldown-header ${badge.cls}">
      <div>
        <span class="drilldown-label">Entity Forensic Record</span>
        <h3 class="drilldown-id mono">${escapeHtml(a.node_id)}</h3>
      </div>
      <div class="drilldown-risk-badge ${badge.cls}">● ${badge.label} (${(score * 100).toFixed(1)}%)</div>
    </div>

    <div class="drilldown-grid">
      <div class="drilldown-col">
        <h4>📊 Risk Breakdown</h4>
        <p><strong>Node Type:</strong> <code>${escapeHtml(a.node_type)}</code></p>
        <p><strong>Random Forest Confidence:</strong> <code>${(a.classifier_confidence ?? 0).toFixed(4)}</code></p>
        <p><strong>Isolation Forest Anomaly:</strong> <code>${(a.anomaly_score ?? 0).toFixed(4)}</code></p>
        <p><strong>Louvain Community:</strong> <code>${escapeHtml(a.cluster_id ?? "N/A")}</code></p>
      </div>
      <div class="drilldown-col">
        <h4>🌐 Network Metadata</h4>
        <p><strong>Geo Country:</strong> ${escapeHtml(a.geo_country || "Unknown")}</p>
        <p><strong>ASN Provider:</strong> <code>${escapeHtml(a.asn || "Unknown")}</code></p>
        <p><strong>Ground Truth Label:</strong> <code>${escapeHtml(a.label || "unknown")}</code></p>
      </div>
      <div class="drilldown-col">
        <h4>🎯 Explainability Logic</h4>
        ${reasons.map((r) => `<p>⚠️ ${escapeHtml(r)}</p>`).join("")}
        ${
          a.intent_label
            ? `<hr/>
               <p><strong>Intent pattern:</strong> <code>${escapeHtml(a.intent_label)}</code> (confidence ${(a.intent_confidence ?? 0).toFixed(2)})</p>
               <p class="drilldown-caveat">Rule-based structural match, not a trained crime-type classifier — Elliptic/Elliptic++ has no ground-truth crime-type labels.</p>
               ${a.intent_explanation ? `<p><em>${escapeHtml(a.intent_explanation)}</em></p>` : ""}`
            : ""
        }
      </div>
    </div>

    <h4>🔗 Linked Blockchain Transactions</h4>
    ${
      linkedRows
        ? `<div class="table-wrap"><table><thead><tr><th>TxID</th><th>Timestamp</th><th>Src IP</th><th>Dst IP</th><th>Script</th><th>Fee</th><th>Country</th><th>ASN</th></tr></thead><tbody>${linkedRows}</tbody></table></div>`
        : '<p class="empty-row">No direct linked transaction records found in the current transaction slice.</p>'
    }
  `;
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
  const max = Math.max(...rows.map((r) => r.flagged_count));
  el.innerHTML = rows
    .map(
      (r) => `
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(r[labelKey])}">${escapeHtml(r[labelKey])}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.flagged_count / max) * 100}%"></div></div>
        <div class="bar-count">${r.flagged_count.toLocaleString()}</div>
        <div class="bar-risk">avg ${r.avg_risk_score.toFixed(2)} · max ${r.max_risk_score.toFixed(2)}</div>
      </div>`
    )
    .join("");
}

function renderGeo(geo) {
  renderBarList("geo-country-bars", geo.by_country, "country");
  renderBarList("geo-asn-bars", geo.by_asn, "asn");
}

/* ---------- Raw transaction stream ---------- */

async function loadRawPage() {
  const tbody = document.getElementById("raw-tbody");
  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Loading…</td></tr>';
  try {
    const { limit, offset } = state.rawPage;
    const data = await fetchJson(`/api/transactions?limit=${limit}&offset=${offset}`);
    state.rawPage.total = data.total;
    renderRawTable(data.rows);
    updateRawPagination();
  } catch (err) {
    showError("raw-error", `Could not load transaction stream: ${err.message}`);
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No transaction data available.</td></tr>';
  }
}

function renderRawTable(rows) {
  const tbody = document.getElementById("raw-tbody");
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No transactions on this page.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td class="mono">${escapeHtml(r.txid)}</td>
        <td>${escapeHtml(r.timestamp)}</td>
        <td class="mono">${escapeHtml(r.src_ip)}</td>
        <td class="mono">${escapeHtml(r.dst_ip)}</td>
        <td>${escapeHtml(r.script_type)}</td>
        <td>${escapeHtml(r.fee)}</td>
        <td>${escapeHtml(r.geo_country)}</td>
        <td>${escapeHtml(r.asn)}</td>
      </tr>`
    )
    .join("");
}

function updateRawPagination() {
  const { limit, offset, total } = state.rawPage;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  document.getElementById("raw-page-info").textContent = `Page ${page} of ${totalPages} (${total.toLocaleString()} total)`;
  document.getElementById("raw-prev").disabled = offset <= 0;
  document.getElementById("raw-next").disabled = offset + limit >= total;
}

function wireRawPagination() {
  document.getElementById("raw-prev").addEventListener("click", () => {
    state.rawPage.offset = Math.max(0, state.rawPage.offset - state.rawPage.limit);
    loadRawPage();
  });
  document.getElementById("raw-next").addEventListener("click", () => {
    state.rawPage.offset += state.rawPage.limit;
    loadRawPage();
  });
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", () => {
  startSystemClock();
  wireAlertControls();
  wireRawPagination();
  loadStats();
  loadAlerts();
  loadGeo();
  loadRawPage();
  // /api/graph is embedded directly via the iframe's src in index.html — no fetch needed.
});
