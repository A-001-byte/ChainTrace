/**
 * The geo-temporal detector names the timezone band where a wallet's activity actually
 * fits ("…falls in Western Europe business hours"). These are the detector's own region
 * names (src/graph_ml/geo_temporal.py::_OFFSET_REGION_NAMES) mapped to a UTC offset and
 * a representative anchor for drawing.
 *
 * A band is a TIMEZONE, not a place. The anchor is only where the arc lands and the label
 * sits; the shaded band on the map is the honest object — the longitudes that share that
 * offset. No wallet is being placed inside it.
 */
export const REGION_BANDS = {
  "North America":                 { offset: -5, lon: -85,  lat: 40 },
  "UK / West Africa":              { offset: 0,  lon: -2,   lat: 30 },
  "Western Europe":                { offset: 1,  lon: 8,    lat: 48 },
  "Eastern Europe / North Africa": { offset: 2,  lon: 25,   lat: 40 },
  "Russia / East Africa":          { offset: 3,  lon: 40,   lat: 45 },
  "Asia-Pacific":                  { offset: 8,  lon: 110,  lat: 25 },
  "Japan":                         { offset: 9,  lon: 138,  lat: 36 },
  "Australia":                     { offset: 10, lon: 145,  lat: -30 },
};

/** "claims US, but 57% of activity falls in Western Europe business hours" -> region + share */
export function activityBandFrom(reason) {
  const m = /(\d+)%\s+of activity falls in (.+?) business hours/.exec(String(reason ?? ""));
  if (!m) return null;
  const name = m[2].trim();
  const band = REGION_BANDS[name];
  return band ? { name, pct: Number(m[1]), ...band } : null;
}

/** Longitude span (degrees) covered by a UTC offset band: offset*15 ± 7.5. */
export function bandLonRange(offset) {
  const c = offset * 15;
  return [c - 7.5, c + 7.5];
}
