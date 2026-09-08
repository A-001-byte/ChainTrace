/** Chart palette. Semantic, matching the CSS tokens: cyan = structure/interactive,
 *  red/amber/green = risk tiers, amber = geo-temporal & fragility signal,
 *  violet/teal = categorical (intent). Kept out of charts.jsx so that file only
 *  exports components (Fast Refresh requirement). */
export const CHART_COLORS = {
  CYAN: "#00e5ff", BLUE: "#3d8bff", AMBER: "#ffb347", RED: "#ff3b5c", GREEN: "#3ddc84",
  VIOLET: "#a78bfa", TEAL: "#2dd4bf", MUTE: "#5e7a92",
};
