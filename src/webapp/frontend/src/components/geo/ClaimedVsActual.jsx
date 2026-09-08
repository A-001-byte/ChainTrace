import { motion, useReducedMotion } from "motion/react";
import { useEntityHours } from "../../hooks/useEntityHours";
import { centroidFor } from "../../lib/countryCentroids";

/**
 * The methodology explainer: shows the mismatch instead of restating the sentence.
 *
 * Left block  — CLAIMED: the country the wallet's GeoIP says it is in, and that country's
 *               expected 09:00–18:00 local working window.
 * Right block — ACTUAL: the wallet's real transaction hours, rendered in that SAME claimed
 *               country's local time, with the working window shaded. When the bars sit
 *               outside the shaded band, the claim doesn't explain the behaviour.
 */
export default function ClaimedVsActual({ nodeId }) {
  const rm = useReducedMotion();
  const { data, error, loading } = useEntityHours(nodeId);

  if (!nodeId) return <p className="note">Select a flagged wallet to see its claimed working window against its real activity hours.</p>;
  if (loading) return <p className="note">Loading activity hours…</p>;
  if (error) return <p className="note down">{error}</p>;
  if (!data) return null;

  const hours = data.local_hours ?? data.utc_hours ?? [];
  const peak = Math.max(1, ...hours);
  const start = data.business_hour_start;
  const end = data.business_hour_end;
  const country = data.claimed_country;
  const countryName = centroidFor(country)?.name ?? country ?? "—";
  const inside = data.claimed_business_fraction === null || data.claimed_business_fraction === undefined
    ? null : Math.round(data.claimed_business_fraction * 100);
  const offset = data.claimed_utc_offset === null || data.claimed_utc_offset === undefined
    ? "—" : `UTC${data.claimed_utc_offset >= 0 ? "+" : ""}${data.claimed_utc_offset}`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 190px) minmax(0, 1fr)", gap: 32, alignItems: "start" }}>
      <div>
        <div className="label">Claimed</div>
        <div style={{ fontSize: "var(--t-36)", fontWeight: 700, letterSpacing: "-0.76px", lineHeight: 1.2, marginTop: 4 }}>{country ?? "—"}</div>
        <div className="meta" style={{ marginTop: 4 }}>{countryName}</div>
        <div className="meta" style={{ marginTop: 16 }}>{offset} · working day {String(start).padStart(2, "0")}:00–{String(end).padStart(2, "0")}:00</div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
          <span className="label">Actual activity, in {country ?? "claimed"} local time</span>
          {inside !== null && <span className="meta"><b>{inside}%</b> inside the claimed working window</span>}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 96, position: "relative" }}>
          <div style={{
            position: "absolute", left: `${(start / 24) * 100}%`, width: `${((end - start) / 24) * 100}%`,
            top: 0, bottom: 0, background: "var(--linen)", borderRadius: 4, pointerEvents: "none",
          }} />
          {hours.map((count, h) => {
            const inWindow = h >= start && h < end;
            return (
              <motion.div key={h} title={`${String(h).padStart(2, "0")}:00 — ${count} transactions`}
                initial={{ scaleY: rm ? 1 : 0 }} animate={{ scaleY: 1 }}
                transition={{ duration: rm ? 0 : 0.2, ease: [0.4, 0, 0.2, 1], delay: rm ? 0 : h * 0.008 }}
                style={{
                  position: "relative", flex: 1, height: `${Math.max(2, (count / peak) * 100)}%`, transformOrigin: "bottom",
                  background: count === 0 ? "var(--hair)" : inWindow ? "var(--ash)" : "var(--violet)", borderRadius: 3,
                }} />
            );
          })}
        </div>

        <div className="meta" style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>

        <p className="note" style={{ marginTop: 16 }}>
          Violet bars are transactions happening while the claimed country is asleep; grey bars fall inside its working day.
          {" "}{data.transaction_count} transactions in total.
        </p>
      </div>
    </div>
  );
}
