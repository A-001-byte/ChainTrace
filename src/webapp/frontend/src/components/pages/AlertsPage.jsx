import { useEffect, useMemo, useState } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { clusterColor } from "../../lib/clusterColors";
import { Panel, RiskTag, Empty, ErrorPanel, Reveal, short } from "../ui";

const PAGE = 15;
const COLS = [
  ["node_id", "node_id"], ["label", "label"], ["cluster_id", "cluster"],
  ["risk_score", "risk"], ["classifier_confidence", "conf"], ["anomaly_score", "anom"],
  ["intent_label", "intent"], ["geo_temporal_flag", "geo"], ["reason", "reason"],
];

function AlertsTable({ title, rows, onOpen, selected }) {
  const [sort, setSort] = useState(["risk_score", -1]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = needle ? rows.filter((r) => String(r.node_id ?? "").toLowerCase().includes(needle)) : rows;
    const [f, d] = sort;
    return [...out].sort((a, b) => {
      const av = a[f] ?? 0, bv = b[f] ?? 0;
      return av > bv ? d : av < bv ? -d : 0;
    });
  }, [rows, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);
  const slice = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const toggle = (f) => setSort(([cf, cd]) => (cf === f ? [f, -cd] : [f, -1]));

  return (
    <Panel
      title={<span>{title} <span className="mute">({rows.length})</span></span>}
      right={<input className="inp" placeholder="filter node_id" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ width: 170 }} />}
      flush
    >
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>{COLS.map(([f, l]) => (
              <th key={f} className={`sortable${sort[0] === f ? " on" : ""}${f === "risk_score" ? " r" : ""}`} onClick={() => toggle(f)}>
                {l}{sort[0] === f ? (sort[1] < 0 ? " ▼" : " ▲") : ""}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {slice.length === 0 ? <tr><td colSpan={COLS.length} className="mute">no matching entities</td></tr> : slice.map((r) => (
              <tr key={r.node_id} className={`row${selected === r.node_id ? " sel" : ""}`} onClick={() => onOpen(r.node_id)}>
                <td className="fg" title={r.node_id}>{short(r.node_id, 26)}</td>
                <td>{r.label ?? "—"}</td>
                <td style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</td>
                <td className="r"><RiskTag score={r.risk_score} /></td>
                <td>{typeof r.classifier_confidence === "number" ? r.classifier_confidence.toFixed(3) : "—"}</td>
                <td>{typeof r.anomaly_score === "number" ? r.anomaly_score.toFixed(3) : "—"}</td>
                <td className="trunc" title={r.intent_label}>{r.intent_label ?? "—"}</td>
                <td>{r.geo_temporal_flag ? <span className="md">MISMATCH</span> : <span className="mute">—</span>}</td>
                <td className="trunc" title={r.reason}>{r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 8px", borderTop: "1px solid var(--rule)", fontSize: "var(--fs-xs)" }}>
        <span className="mute">{filtered.length === 0 ? "0 of 0" : `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, filtered.length)} of ${filtered.length}`}</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>prev</button>
        <span className="mute">{page + 1}/{pages}</span>
        <button className="btn" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>next</button>
      </div>
    </Panel>
  );
}

export default function AlertsPage({ onOpen, selected }) {
  const { data, error, loading } = useAlerts();
  if (loading) return <Empty>loading alerts…</Empty>;
  if (error) return <ErrorPanel error={error} />;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const wallets = rows.filter((r) => (r.node_type || "").toLowerCase() === "wallet");
  const txs = rows.filter((r) => (r.node_type || "").toLowerCase() !== "wallet");
  return (
    <>
      <Reveal><AlertsTable title="wallets" rows={wallets} onOpen={onOpen} selected={selected} /></Reveal>
      <Reveal delay={0.05}><AlertsTable title="transactions" rows={txs} onOpen={onOpen} selected={selected} /></Reveal>
      <div className="note">Wallets and transactions are separate panels so a handful of flagged transactions cannot be lost beneath a long wallet list. Click any row for the full record.</div>
    </>
  );
}
