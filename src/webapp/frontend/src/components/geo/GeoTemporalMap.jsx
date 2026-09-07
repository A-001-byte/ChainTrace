import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { centroidFor, jitterFor } from "../../lib/countryCentroids";
import { motionTokens } from "../../lib/motionTokens";

const W = 900;
const H = 450;

/** Equirectangular projection. Deliberately trivial: no projection library needed
 *  when the only job is placing country-level dots on a flat reference map. */
function project(lon, lat) {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

/** GeoJSON ring -> SVG path, projected. */
function ringsToPath(coordinates) {
  let d = "";
  for (const polygon of coordinates) {
    for (const ring of polygon) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      });
      d += "Z";
    }
  }
  return d;
}

export default function GeoTemporalMap({ points, selectedId, onSelect }) {
  const reduceMotion = useReducedMotion();

  const landPath = useMemo(() => {
    const geo = feature(landTopo, landTopo.objects.land);
    const geoms = geo.type === "FeatureCollection" ? geo.features.map((f) => f.geometry) : [geo.geometry];
    return geoms
      .map((g) => (g.type === "MultiPolygon" ? ringsToPath(g.coordinates) : ringsToPath([g.coordinates])))
      .join("");
  }, []);

  const plotted = useMemo(() => {
    return (points ?? [])
      .map((p) => {
        const c = centroidFor(p.claimedCountry);
        if (!c) return null;
        const [x, y] = project(c.lon, c.lat);
        const { dx, dy } = jitterFor(p.nodeId);
        return { ...p, x: x + dx, y: y + dy, countryName: c.name };
      })
      .filter(Boolean);
  }, [points]);

  const selected = plotted.find((p) => p.nodeId === selectedId) ?? null;

  // Zoom to the selected point by transforming the whole plot group -- a transform,
  // never a viewBox/width animation.
  const scale = selected ? 2.4 : 1;
  const tx = selected ? W / 2 - selected.x * scale : 0;
  const ty = selected ? H / 2 - selected.y * scale : 0;

  return (
    <div style={{ width: "100%", background: "var(--color-void)", borderRadius: "var(--radius-cards)", overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
           aria-label="World map of wallets by claimed country">
        <rect width={W} height={H} fill="var(--color-void)" />

        <motion.g
          initial={false}
          animate={{ x: tx, y: ty, scale }}
          transition={reduceMotion
            ? { duration: 0 }
            : { duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth }}
          style={{ transformOrigin: "0px 0px" }}
        >
          {/* Landmass silhouette: reference only, no country borders drawn, because the
              resolution of this view is one point per country anyway. */}
          <path d={landPath} fill="#12141a" stroke="#23252a" strokeWidth={0.5} />

          {plotted.map((p) => {
            const isSelected = selected && p.nodeId === selectedId;
            const dimmed = selected && !isSelected;
            const r = isSelected ? 6 : 4.5;
            return (
              <g key={p.nodeId} opacity={dimmed ? 0.28 : 1} style={{ cursor: "pointer" }}
                 onClick={() => onSelect?.(p.nodeId)}>
                {/* Same amber geo-temporal treatment used by the entity drawer's mismatch
                    card and the Forensic Graph's node ring -- one visual language for one
                    concept, not a third style. */}
                {isSelected && !reduceMotion && (
                  <motion.circle
                    // Keyed on the selected id so the pulse re-fires on each new
                    // selection, then settles -- finite, no repeat, exactly like the
                    // entity drawer's one-time mismatch pulse. The selected dot stays
                    // larger and solid amber, so the affordance survives the settle.
                    key={`pulse-${selectedId}`}
                    cx={p.x} cy={p.y}
                    initial={{ r: r, opacity: 0.6 }}
                    animate={{ r: r * 3.4, opacity: 0 }}
                    transition={{ duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth }}
                    fill="none" stroke="#d99a4e" strokeWidth={1.4 / scale}
                  />
                )}
                <circle
                  cx={p.x} cy={p.y} r={r / (isSelected ? scale * 0.55 : 1)}
                  fill={isSelected ? "#d99a4e" : "rgba(217,154,78,0.55)"}
                  stroke="#d99a4e"
                  strokeWidth={(isSelected ? 2 : 1) / scale}
                />
                <title>{`${p.nodeId}\nclaims ${p.claimedCountry} (${p.countryName})\n${p.reason ?? ""}`}</title>
              </g>
            );
          })}
        </motion.g>
      </svg>
    </div>
  );
}
