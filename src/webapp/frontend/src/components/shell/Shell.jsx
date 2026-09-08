import { useState } from "react";
import { useStats } from "../../hooks/useStats";
import { SECTIONS } from "../../lib/sections";

/** Entity lookup — a SEARCH over already-computed output via /api/entity-lookup.
 *  Not an ingestion control; nothing here re-runs the pipeline. */
function Lookup({ onSubmit }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); const id = v.trim(); if (id) onSubmit?.(id); }} style={{ display: "flex", gap: 8 }}>
      <input className="inp mono" aria-label="Look up an entity by node id" placeholder="wallet_… / tx_…" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 260, fontSize: 12 }} />
      <button type="submit" className="btn light" disabled={!v.trim()}>Look up</button>
    </form>
  );
}

export function TopNav({ active, onSelect, onLookup }) {
  const { data, error } = useStats();
  const mock = data?.data_source_label?.toLowerCase().includes("mock");
  return (
    <header className="topnav">
      <span className="wordmark">ChainTrace</span>
      <nav>{SECTIONS.map((s) => <button key={s.id} className={active === s.id ? "on" : ""} onClick={() => onSelect(s.id)} title={s.key}>{s.label}</button>)}</nav>
      <Lookup onSubmit={onLookup} />
      <span className="status"><i className={error || mock ? "warn" : ""} />{error ? "offline" : mock ? "mock data" : "live"}</span>
    </header>
  );
}

export function FootBar() {
  const { data } = useStats();
  return (
    <footer className="footbar">
      <span>source <b>{data?.data_source_label ?? "…"}</b></span>
      <span>transactions <b>{data?.total_transactions?.toLocaleString() ?? "…"}</b></span>
      <span>flagged <b>{data?.total_flagged ?? "…"}</b></span>
      <span>clusters <b>{data?.distinct_clusters ?? "…"}</b></span>
      <span style={{ marginLeft: "auto" }}>offline · no external calls at runtime · not a real-world identity claim</span>
    </footer>
  );
}
