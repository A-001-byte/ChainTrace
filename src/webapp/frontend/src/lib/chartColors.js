/** Factory palette for data. Orange and green are the only chromatic values and mean
 *  something: orange = elevated / signal, green = positive / low. Everything else is a
 *  neutral ramp. Kept out of charts.jsx so that file only exports components. */
export const CHART_COLORS = {
  ORANGE: "#ee6018", GREEN: "#a0ca92",
  BONE: "#eeeeee", STONE: "#b8b3b0", GRANITE: "#8a8380", GRAPHITE: "#4d4947", STROKE: "#3d3a39", LIFT: "#1d1a18",
  NEUTRALS: ["#eeeeee", "#b8b3b0", "#8a8380", "#4d4947", "#3d3a39"],
};

/** Risk score -> data colour. High = orange, medium = stone, low = green. */
export const riskColor = (r) => (typeof r !== "number" ? "#4d4947" : r >= 0.6 ? "#ee6018" : r >= 0.4 ? "#b8b3b0" : "#a0ca92");
