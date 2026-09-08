import { useEffect, useMemo, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { centroidFor, jitterFor } from "../../lib/countryCentroids";
import { activityBandFrom, bandLonRange } from "../../lib/regionAnchors";
import { CHART_COLORS as C } from "../../lib/chartColors";

const W = 1000, H = 500;
const K_MIN = 1, K_MAX = 9;
const MONO = "Geist Mono Variable, ui-monospace, monospace";
const LINE = "rgba(238,238,238,0.05)";

const project = (lon, lat) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];

function ringsToPath(coordinates) {
  let d = "";
  for (const polygon of coordinates) for (const ring of polygon) {
    ring.forEach(([lon, lat], i) => { const [x, y] = project(lon, lat); d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; });
    d += "Z";
  }
  return d;
}

/** Quadratic arc between two projected points, bowed toward the pole. */
function arcPath([x1, y1], [x2, y2]) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const lift = Math.min(90, len * 0.28);
  return `M${x1},${y1} Q${mx - (dy / len) * lift},${my + (dx / len) * lift} ${x2},${y2}`;
}

/**
 * Interactive country-centroid map — flat, no filters.
 *
 * One view state {k, tx, ty} drives EVERYTHING — the group transform, dot radii, stroke
 * widths and font sizes are all computed from the same tweened k, so nothing pops while a
 * focus animation is in flight. Wheel = zoom about cursor, drag = pan, selecting a wallet
 * animates a focus, double-click resets.
 */
export default function GeoTemporalMap({ points, selectedId, onSelect }) {
  const rm = useReducedMotion();
  const svgRef = useRef(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [dragging, setDragging] = useState(false);
  // Latest view for handlers that need a starting point (focus tween). Synced in an
  // effect, never assigned during render.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const drag = useRef(null);
  const anim = useRef(null);

  const landPath = useMemo(() => {
    const geo = feature(landTopo, landTopo.objects.land);
    const geoms = geo.type === "FeatureCollection" ? geo.features.map((f) => f.geometry) : [geo.geometry];
    return geoms.map((g) => (g.type === "MultiPolygon" ? ringsToPath(g.coordinates) : ringsToPath([g.coordinates]))).join("");
  }, []);

  const plotted = useMemo(() => (points ?? []).map((p) => {
    const c = centroidFor(p.claimedCountry);
    if (!c) return null;
    const [x, y] = project(c.lon, c.lat);
    const { dx, dy } = jitterFor(p.nodeId, 11);
    const band = activityBandFrom(p.reason);
    const bandXY = band ? project(band.lon, band.lat) : null;
    return { ...p, x: x + dx, y: y + dy, cx: x, cy: y, countryName: c.name, band, bandXY };
  }).filter(Boolean), [points]);

  const byCountry = useMemo(() => {
    const m = new Map();
    for (const p of plotted) { const e = m.get(p.claimedCountry) ?? { code: p.claimedCountry, x: p.cx, y: p.cy, n: 0 }; e.n += 1; m.set(p.claimedCountry, e); }
    return [...m.values()];
  }, [plotted]);

  const selected = plotted.find((p) => p.nodeId === selectedId) ?? null;

  // --- focus animation: tween the whole view as one object -----------------------
  const goTo = (target) => {
    anim.current?.stop();
    const from = { ...viewRef.current };
    // Always tween (duration 0 under reduced motion) so the state update happens in the
    // animation callback rather than synchronously inside an effect body.
    anim.current = animate(0, 1, {
      duration: rm ? 0 : 0.2, ease: [0.4, 0, 0.2, 1],
      onUpdate: (t) => setView({ k: from.k + (target.k - from.k) * t, tx: from.tx + (target.tx - from.tx) * t, ty: from.ty + (target.ty - from.ty) * t }),
    });
  };
  useEffect(() => {
    if (!selected) return;
    // frame both the claimed point and the activity band, if present
    const pts = [[selected.x, selected.y], ...(selected.bandXY ? [selected.bandXY] : [])];
    const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
    const spanX = Math.max(maxX - minX, 60), spanY = Math.max(maxY - minY, 30);
    const k = Math.max(K_MIN, Math.min(K_MAX, Math.min((W * 0.55) / spanX, (H * 0.55) / spanY)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    goTo({ k, tx: W / 2 - cx * k, ty: H / 2 - cy * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // --- wheel zoom about the cursor, drag pan, dblclick reset -----------------------
  const svgPoint = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const onWheel = (e) => {
    e.preventDefault(); anim.current?.stop();
    const [px, py] = svgPoint(e);
    const f = Math.exp(-e.deltaY * 0.0012);
    // functional update: correct even when several wheel events land before a commit
    setView((v) => { const k = Math.max(K_MIN, Math.min(K_MAX, v.k * f)); const s = k / v.k; return { k, tx: px - (px - v.tx) * s, ty: py - (py - v.ty) * s }; });
  };
  const onDown = (e) => { anim.current?.stop(); drag.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false }; setDragging(true); };
  const onMove = (e) => {
    if (!drag.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / r.width) * W, dy = ((e.clientY - drag.current.y) / r.height) * H;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
    setView((v) => ({ ...v, tx: drag.current.tx + dx, ty: drag.current.ty + dy }));
  };
  const onUp = () => { drag.current = null; setDragging(false); };
  const reset = () => { onSelect?.(null); goTo({ k: 1, tx: 0, ty: 0 }); };
  const zoomBy = (s) => { const v = viewRef.current; const k = Math.max(K_MIN, Math.min(K_MAX, v.k * s)); const r = k / v.k; goTo({ k, tx: W / 2 - (W / 2 - v.tx) * r, ty: H / 2 - (H / 2 - v.ty) * r }); };
  // non-passive listener so preventDefault can stop the page from scrolling under the map
  useEffect(() => {
    const el = svgRef.current;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { k, tx, ty } = view;
  const inv = 1 / k;
  const band = selected?.band ?? null;
  const bandX = band ? bandLonRange(band.offset).map((lon) => ((lon + 180) / 360) * W) : null;

  return (
    <div style={{ position: "relative", width: "100%", background: "#101010", overflow: "hidden" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map of wallets by claimed country"
           style={{ width: "100%", height: "auto", display: "block", cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
           onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onDoubleClick={reset}>
        <rect width={W} height={H} fill="#101010" />
        <g transform={`translate(${tx},${ty}) scale(${k})`}>
          {/* graticule */}
          {Array.from({ length: 11 }, (_, i) => (i + 1) * 30 - 180).map((lon) => (
            <line key={`m${lon}`} x1={((lon + 180) / 360) * W} x2={((lon + 180) / 360) * W} y1={0} y2={H} stroke={LINE} strokeWidth={inv} />
          ))}
          {[-60, -30, 0, 30, 60].map((lat) => (
            <line key={`p${lat}`} x1={0} x2={W} y1={((90 - lat) / 180) * H} y2={((90 - lat) / 180) * H} stroke={lat === 0 ? "rgba(238,238,238,0.1)" : LINE} strokeWidth={inv} />
          ))}
          {/* the timezone band the detector says the activity fits */}
          {bandX && (
            <g>
              <rect x={bandX[0]} y={0} width={bandX[1] - bandX[0]} height={H} fill="rgba(238,96,24,0.06)" stroke={C.ORANGE} strokeOpacity={0.4} strokeWidth={inv} strokeDasharray={`${4 * inv} ${4 * inv}`} />
              <text x={(bandX[0] + bandX[1]) / 2} y={16 * inv} textAnchor="middle" fill={C.ORANGE} fontSize={10 * inv} fontFamily={MONO}>
                UTC{band.offset >= 0 ? "+" : ""}{band.offset} · {band.name.toUpperCase()}
              </text>
            </g>
          )}
          <path d={landPath} fill={C.LIFT} stroke={C.STROKE} strokeWidth={0.7 * inv} />

          {/* arcs: claimed country -> activity band */}
          {plotted.map((p) => p.bandXY && (
            <path key={`a${p.nodeId}`} d={arcPath([p.x, p.y], p.bandXY)} fill="none"
                  stroke={C.ORANGE} strokeWidth={(selected?.nodeId === p.nodeId ? 1.4 : 0.6) * inv}
                  strokeOpacity={selected ? (selected.nodeId === p.nodeId ? 0.95 : 0.12) : 0.4}
                  strokeDasharray={`${3 * inv} ${3 * inv}`} />
          ))}
          {selected?.bandXY && (
            <g>
              <circle cx={selected.bandXY[0]} cy={selected.bandXY[1]} r={3.2 * inv} fill="none" stroke={C.ORANGE} strokeWidth={1 * inv} />
              <circle cx={selected.bandXY[0]} cy={selected.bandXY[1]} r={1.2 * inv} fill={C.ORANGE} />
            </g>
          )}

          {/* per-country labels */}
          {byCountry.map((c) => (
            <text key={c.code} x={c.x + 9 * inv} y={c.y - 8 * inv} fill={C.BONE} fontSize={9.5 * inv} fontFamily={MONO} opacity={selected && selected.claimedCountry !== c.code ? 0.35 : 0.9} style={{ pointerEvents: "none" }}>
              {c.code}<tspan fill={C.GRANITE}> ×{c.n}</tspan>
            </text>
          ))}

          {/* wallets */}
          {plotted.map((p) => {
            const on = selected?.nodeId === p.nodeId;
            const dim = selected && !on;
            return (
              <g key={p.nodeId} opacity={dim ? 0.3 : 1} style={{ cursor: "pointer" }}
                 onClick={(e) => { e.stopPropagation(); if (!drag.current?.moved) onSelect?.(on ? null : p.nodeId); }}>
                {on && !rm && (
                  <circle key={`pulse-${selectedId}`} cx={p.x} cy={p.y} r={4 * inv} fill="none" stroke={C.ORANGE} strokeWidth={1 * inv}>
                    <animate attributeName="r" from={4 * inv} to={14 * inv} dur="0.6s" fill="freeze" />
                    <animate attributeName="opacity" from="0.8" to="0" dur="0.6s" fill="freeze" />
                  </circle>
                )}
                <circle cx={p.x} cy={p.y} r={(on ? 5 : 3.4) * inv} fill={C.ORANGE} fillOpacity={on ? 1 : 0.85} stroke="#101010" strokeWidth={0.8 * inv} />
                <title>{`${p.nodeId}\nclaims ${p.claimedCountry} (${p.countryName})\n${p.reason ?? ""}`}</title>
              </g>
            );
          })}
        </g>
      </svg>

      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
        <button className="btn sm" onClick={() => zoomBy(1.5)} aria-label="zoom in">+</button>
        <button className="btn sm" onClick={() => zoomBy(1 / 1.5)} aria-label="zoom out">−</button>
        <button className="btn sm" onClick={reset}>Reset</button>
      </div>
      <div className="eyebrow" style={{ position: "absolute", left: 16, bottom: 12, pointerEvents: "none", color: "var(--granite)" }}>
        <span style={{ color: C.ORANGE }}>●</span> claimed country &nbsp;<span style={{ color: C.ORANGE }}>- - -</span> arc to activity band &nbsp;· wheel zoom · drag pan · dbl-click reset
      </div>
    </div>
  );
}
