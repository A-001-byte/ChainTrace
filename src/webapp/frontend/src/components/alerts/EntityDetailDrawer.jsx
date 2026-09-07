import { useEntity } from "../../hooks/useEntity";
import RiskPill from "../shared/RiskPill";

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: "0.7rem" }}>
      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h4 style={{
      fontSize: "0.72rem", color: "var(--accent-cyan)", textTransform: "uppercase",
      letterSpacing: "0.06em", marginTop: "1.4rem", marginBottom: "0.6rem",
      borderBottom: "1px solid var(--border-color)", paddingBottom: "0.4rem",
    }}>
      {children}
    </h4>
  );
}

export default function EntityDetailDrawer({ nodeId, onClose }) {
  const { data, error, loading } = useEntity(nodeId);

  if (!nodeId) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", justifyContent: "flex-end", zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "420px", height: "100%", background: "var(--bg-card)",
          borderLeft: "1px solid var(--border-color)", padding: "1.5rem",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1rem", wordBreak: "break-all", paddingRight: "1rem" }}>{nodeId}</h3>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "1.2rem", cursor: "pointer", flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {loading && <p style={{ color: "var(--text-muted)" }}>Loading entity…</p>}

        {error && (
          <div style={{ color: "var(--warning)", fontSize: "0.85rem" }}>
            Could not load this entity: {error}
          </div>
        )}

        {data && (
          <>
            <SectionTitle>Entity</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <Field label="Node Type" value={data.alert.node_type} />
              <Field label="Label" value={data.alert.label} />
              <Field label="Cluster" value={data.alert.cluster_id} />
              <Field
                label="Risk Score"
                value={typeof data.alert.risk_score === "number" ? <RiskPill score={data.alert.risk_score} /> : "-"}
              />
              <Field
                label="Classifier Confidence"
                value={typeof data.alert.classifier_confidence === "number" ? data.alert.classifier_confidence.toFixed(3) : "-"}
              />
              <Field
                label="Anomaly Score"
                value={typeof data.alert.anomaly_score === "number" ? data.alert.anomaly_score.toFixed(3) : "-"}
              />
            </div>

            <SectionTitle>Why Flagged</SectionTitle>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {data.alert.reason || "-"}
            </p>

            <SectionTitle>Intent Intelligence</SectionTitle>
            {data.alert.intent_label ? (
              <>
                <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.3rem" }}>
                  {data.alert.intent_label}
                  {typeof data.alert.intent_confidence === "number" && (
                    <span style={{ color: "var(--text-muted)" }}> (confidence {data.alert.intent_confidence.toFixed(2)})</span>
                  )}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  Rule-based structural pattern match — not a trained crime-type classifier.
                </p>
              </>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>-</p>
            )}

            <SectionTitle>Geo-Temporal Intelligence</SectionTitle>
            {data.alert.geo_temporal_flag ? (
              <div style={{
                background: "rgba(255,145,0,0.08)", border: "1px solid var(--warning)",
                borderRadius: "6px", padding: "0.7rem",
              }}>
                <div style={{ color: "var(--warning)", fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.3rem" }}>
                  GEO-TEMPORAL MISMATCH
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {data.alert.geo_temporal_reason || "-"}
                </p>
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>-</p>
            )}

            <SectionTitle>Linked Blockchain Transactions</SectionTitle>
            {data.linked_transactions.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No linked transactions found.</p>
            ) : (
              <div style={{ fontSize: "0.78rem" }}>
                {data.linked_transactions.map((tx, i) => (
                  <div key={tx.txid ?? i} style={{
                    padding: "0.5rem 0", borderBottom: "1px solid var(--border-color)",
                    fontFamily: "var(--font-mono)", color: "var(--text-secondary)",
                  }}>
                    {tx.txid ?? "-"}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}