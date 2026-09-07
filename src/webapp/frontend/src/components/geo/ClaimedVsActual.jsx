import { motion, useReducedMotion } from "motion/react";
import { useEntityHours } from "../../hooks/useEntityHours";
import { centroidFor } from "../../lib/countryCentroids";
import { motionTokens } from "../../lib/motionTokens";

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
  const reduceMotion = useReducedMotion();
  const { data, error, loading } = useEntityHours(nodeId);

  if (!nodeId) {
    return (
      <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)" }}>
        Select a flagged wallet to see its claimed working window against its real activity hours.
      </p>
    );
  }
  if (loading) return <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)" }}>Loading activity hours…</p>;
  if (error) return <p style={{ color: "var(--signal)", fontSize: "var(--text-caption)" }}>{error}</p>;
  if (!data) return null;

  const hours = data.local_hours ?? data.utc_hours ?? [];
  const peak = Math.max(1, ...hours);
  const start = data.business_hour_start;
  const end = data.business_hour_end;
  const country = data.claimed_country;
  const countryName = centroidFor(country)?.name ?? country ?? "—";
  const insidePct = data.claimed_business_fraction !== null && data.claimed_business_fraction !== undefined
    ? Math.round(data.claimed_business_fraction * 100)
    : null;

  const offsetLabel = data.claimed_utc_offset === null || data.claimed_utc_offset === undefined
    ? "—"
    : `UTC${data.claimed_utc_offset >= 0 ? "+" : ""}${data.claimed_utc_offset}`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 200px) 1fr", gap: "var(--spacing-24)", alignItems: "start" }}>
      {/* CLAIMED */}
      <div>
        <span className="eyebrow" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Claimed</span>
        <div className="mono" style={{
          fontSize: "var(--text-subheading)", lineHeight: "var(--leading-subheading)",
          letterSpacing: "var(--tracking-subheading)", fontWeight: "var(--weight-medium)",
          color: "var(--color-bone)",
        }}>
          {country ?? "—"}
        </div>
        <div style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", marginTop: "var(--spacing-4)" }}>
          {countryName}
        </div>
        <div className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)", marginTop: "var(--spacing-12)" }}>
          {offsetLabel}
        </div>
        <div className="badge" style={{
          marginTop: "var(--spacing-8)",
          color: "var(--color-mist)", background: "rgba(255,255,255,0.02)",
          boxShadow: "var(--color-graphite) 0px 0px 0px 1px inset",
        }}>
          <span className="mono">{String(start).padStart(2, "0")}:00–{String(end).padStart(2, "0")}:00</span>&nbsp;local
        </div>
      </div>

      {/* ACTUAL */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--spacing-8)" }}>
          <span className="eyebrow">Actual activity, in {country ?? "claimed"} local time</span>
          {insidePct !== null && (
            <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--signal)" }}>
              {insidePct}% inside the claimed working window
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 84, position: "relative" }}>
          {/* Shaded working window behind the bars */}
          <div style={{
            position: "absolute", left: `${(start / 24) * 100}%`, width: `${((end - start) / 24) * 100}%`,
            top: 0, bottom: 0, background: "rgba(255,255,255,0.035)",
            borderLeft: "1px solid var(--color-graphite)", borderRight: "1px solid var(--color-graphite)",
            pointerEvents: "none",
          }} />
          {hours.map((count, h) => {
            const inWindow = h >= start && h < end;
            return (
              <motion.div
                key={h}
                initial={{ scaleY: reduceMotion ? 1 : 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : motionTokens.duration.normal,
                  ease: motionTokens.easing.smooth,
                  delay: reduceMotion ? 0 : h * 0.012,
                }}
                title={`${String(h).padStart(2, "0")}:00 — ${count} tx`}
                style={{
                  flex: 1,
                  height: `${Math.max(2, (count / peak) * 100)}%`,
                  transformOrigin: "bottom",
                  background: count === 0
                    ? "var(--color-graphite)"
                    : inWindow ? "var(--color-mist)" : "var(--signal)",
                  borderRadius: "var(--radius-small)",
                }}
              />
            );
          })}
        </div>

        <div className="mono" style={{
          display: "flex", justifyContent: "space-between",
          fontSize: "var(--text-caption)", color: "var(--color-ash)", marginTop: "var(--spacing-4)",
        }}>
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>

        <p style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", marginTop: "var(--spacing-12)", lineHeight: 1.5 }}>
          Bars outside the shaded band are transactions happening when the claimed country
          is asleep. Amber bars are that out-of-window activity; {data.transaction_count} transactions total.
        </p>
      </div>
    </div>
  );
}
