import { useState } from "react";
import { useStats } from "../../hooks/useStats";

export const SECTIONS = [
  { id: "overview", key: "F1", label: "OVERVIEW", grp: "MONITOR" },
  { id: "alerts", key: "F2", label: "ALERTS", grp: "MONITOR" },
  { id: "graph", key: "F3", label: "FORENSIC GRAPH", grp: "INVESTIGATE" },
  { id: "kickdown", key: "F4", label: "KICK DOWN DOORS", grp: "INVESTIGATE" },
  { id: "provenance", key: "F5", label: "PROVENANCE", grp: "INVESTIGATE" },
  { id: "geo", key: "F6", label: "GEO / TEMPORAL", grp: "INTELLIGENCE" },
  { id: "pattern", key: "F7", label: "PATTERN", grp: "INTELLIGENCE" },
  { id: "system", key: "F8", label: "SYSTEM", grp: "INTELLIGENCE" },
];

/**
 * Entity lookup by node_id. A SEARCH over already-computed output
 * (ranked_alerts.csv / unified_dataset.csv via /api/entity-lookup) — not an ingestion
 * control, nothing here re-runs the pipeline.
 */
function Lookup({ onSubmit }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const id = v.trim(); if (id) onSubmit?.(id); }}
      style={{ display: "flex", gap: 4 }}
    >
      <input
        className="inp"
        aria-label="Look up an entity by node id"
        placeholder="lookup wallet_… / tx_…"
        value={v}
        onChange={(e) => setV(e.target.value)}
        style={{ width: 300 }}
      />
      <button type="submit" className="btn acc" disabled={!v.trim()}>go</button>
    </form>
  );
}

export function Topbar({ onLookup }) {
  const { data } = useStats();
  const mock = data?.data_source_label?.toLowerCase().includes("mock");
  return (
    <header className="topbar">
      <div className="brand">CHAINTRACE<span>bitcoin forensics &amp; threat intelligence</span></div>
      <div className="spacer" />
      <Lookup onSubmit={onLookup} />
      <span className={`tag ${mock ? "md" : "lo"}`}>{mock ? "MOCK DATA" : "LIVE DATA"}</span>
    </header>
  );
}

export function Nav({ active, onSelect }) {
  let lastGrp = null;
  return (
    <nav className="nav">
      {SECTIONS.map((s) => {
        const head = s.grp !== lastGrp ? <div className="grp" key={`g-${s.grp}`}>{s.grp}</div> : null;
        lastGrp = s.grp;
        return [
          head,
          <button key={s.id} className={active === s.id ? "on" : ""} onClick={() => onSelect(s.id)}>
            <span className="key">{s.key}</span>{s.label}
          </button>,
        ];
      })}
    </nav>
  );
}

export function Statusbar() {
  const { data, error } = useStats();
  return (
    <footer className="statusbar">
      <span>src <b>{error ? "unavailable" : (data?.data_source_label ?? "…")}</b></span>
      <span>tx <b>{data?.total_transactions?.toLocaleString() ?? "…"}</b></span>
      <span>flagged <b>{data?.total_flagged ?? "…"}</b></span>
      <span>clusters <b>{data?.distinct_clusters ?? "…"}</b></span>
      <span style={{ marginLeft: "auto" }}>offline · no external calls at runtime · not a real-world identity claim</span>
    </footer>
  );
}
