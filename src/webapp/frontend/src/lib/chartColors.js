/** Kraken palette for data marks. Violet is the single brand accent; green and red
 *  carry risk semantics only. Everything structural is a neutral slate.
 *  Kept out of charts.jsx so that file only exports components. */
export const CHART_COLORS = {
  VIOLET: "#7132f5", VIOLET_DEEP: "#4f24ad", LILAC: "#e4dcf9",
  INK: "#101114", GRAPHITE: "#484b5e", SLATE: "#686b82", ASH: "#9497a9",
  LINE: "#d4d4dc", HAIR: "#ececf1", LINEN: "#f6f5f9",
  UP: "#08844f", DOWN: "#d11d45",
};

/** Risk score -> data colour. High = red, medium = slate, low = green. */
export const riskColor = (r) =>
  (typeof r !== "number" || Number.isNaN(r) ? "#9497a9" : r >= 0.6 ? "#d11d45" : r >= 0.4 ? "#686b82" : "#08844f");
