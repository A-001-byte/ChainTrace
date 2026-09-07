import { useState, useMemo, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import RiskPill from "../shared/RiskPill";
import { motionTokens } from "../../lib/motionTokens";
import { clusterColor } from "../../lib/clusterColors";

// Only the first N rows on a page are staggered; the rest share the last delay so a full
// page never feels like it's slowly dealing cards.
const MAX_STAGGERED_ROWS = 10;
const PER_ROW_DELAY = 0.03;

// Same hue as --surface-3, written as rgba so the hover transition interpolates alpha
// directly instead of passing through a grey "transparent".
const ROW_BG_IDLE = "rgba(30, 42, 65, 0)";
const ROW_BG_HOVER = "rgba(30, 42, 65, 1)";

const PAGE_SIZE = 12;

export default function AlertsTable({ title, subtitle, accent, rows, onSelectRow }) {
  const reduceMotion = useReducedMotion();
  const [sortField, setSortField] = useState("risk_score");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const safeRows = Array.isArray(rows) ? rows : [];

  const filtered = useMemo(() => {
    let out = safeRows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => String(r.node_id ?? "").toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      return av > bv ? dir : av < bv ? -dir : 0;
    });
  }, [safeRows, search, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Filtering/sorting can shrink the list under the current page -- snap back rather than
  // stranding the user on an empty page.
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const columns = [
    { key: "node_id", label: "Node ID" },
    { key: "label", label: "Label" },
    { key: "cluster_id", label: "Cluster" },
    { key: "risk_score", label: "Risk" },
    { key: "classifier_confidence", label: "Confidence" },
    { key: "anomaly_score", label: "Anomaly" },
    { key: "reason", label: "Reason" },
  ];

  return (
    <section className="panel" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "var(--space-3)", padding: "var(--space-4)",
        borderBottom: "1px solid var(--border-subtle)", flexWrap: "wrap",
      }}>
        <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: "var(--space-3)" }}>
          <h3 style={{ color: "var(--text-primary)" }}>
            {title}{" "}
            <span className="mono" style={{ color: "var(--text-faint)", fontWeight: 400, fontSize: "var(--text-sm)" }}>
              ({safeRows.length})
            </span>
          </h3>
          {subtitle && (
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        <input
          className="input"
          placeholder="Filter node ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          style={{ width: "190px" }}
        />
      </header>

      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={sortField === c.key ? "is-sorted" : ""}
                >
                  {c.label}{sortField === c.key ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ padding: "var(--space-5)", color: "var(--text-muted)" }}>No matching entities.</td></tr>
            ) : pageRows.map((row, i) => (
              <motion.tr
                key={row.node_id ?? i}
                initial={{ opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm, backgroundColor: ROW_BG_IDLE }}
                animate={{ opacity: 1, y: 0, backgroundColor: ROW_BG_IDLE }}
                transition={{
                  duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
                  ease: motionTokens.easing.smooth,
                  delay: Math.min(i, MAX_STAGGERED_ROWS) * PER_ROW_DELAY,
                }}
                whileHover={{
                  backgroundColor: ROW_BG_HOVER,
                  transition: { duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp },
                }}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectRow?.(row.node_id)}
              >
                <td className="mono" style={{ color: "var(--text-primary)" }} title={row.node_id}>
                  {String(row.node_id ?? "-").length > 26 ? String(row.node_id).slice(0, 26) + "…" : (row.node_id ?? "-")}
                </td>
                <td>{row.label ?? "-"}</td>
                <td className="mono">
                  {row.cluster_id !== null && row.cluster_id !== undefined ? (
                    <span style={{ color: clusterColor(row.cluster_id) }}>c{row.cluster_id}</span>
                  ) : "-"}
                </td>
                <td><RiskPill score={row.risk_score} /></td>
                <td className="mono">
                  {typeof row.classifier_confidence === "number" ? row.classifier_confidence.toFixed(3) : "-"}
                </td>
                <td className="mono">
                  {typeof row.anomaly_score === "number" ? row.anomaly_score.toFixed(3) : "-"}
                </td>
                <td style={{ maxWidth: "260px", fontSize: "var(--text-xs)" }} title={row.reason}>
                  {row.reason ?? "-"}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "var(--space-3) var(--space-4)", borderTop: "1px solid var(--border-subtle)",
        gap: "var(--space-3)",
      }}>
        <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)" }}>
          {filtered.length === 0
            ? "0 of 0"
            : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        </span>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <button className="btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹ Prev</button>
          <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", minWidth: "4.5rem", textAlign: "center" }}>
            Page {page + 1} / {pageCount}
          </span>
          <button className="btn" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next ›</button>
        </div>
      </footer>
    </section>
  );
}
