import { useState } from "react";

/**
 * Entity lookup by node_id.
 *
 * This is a SEARCH box over already-computed pipeline output (ranked_alerts.csv and
 * unified_dataset.csv) via /api/entity-lookup. It is not a data-upload or ingestion
 * control: nothing here re-runs the pipeline or processes new raw data.
 *
 * Unlike the alert tables, it resolves any node_id in the scored dataset, not just the
 * top-N ranked alerts.
 */
export default function EntitySearch({ onSubmit }) {
  const [value, setValue] = useState("");

  function submit(e) {
    e.preventDefault();
    const id = value.trim();
    if (id) onSubmit?.(id);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
      <input
        className="input mono"
        placeholder="Look up any wallet_… / tx_… id"
        aria-label="Look up an entity by node id"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: "290px", fontSize: "var(--text-xs)" }}
      />
      <button type="submit" className="btn btn-accent" disabled={!value.trim()}>
        Look up
      </button>
    </form>
  );
}
