/**
 * Static country-code -> approximate centroid lookup. Plain data, no API calls.
 *
 * RESOLUTION IS COUNTRY-LEVEL, DELIBERATELY. Each entry is a single representative
 * point for the whole country (roughly its geographic/population centre), NOT a
 * located position for any wallet. A dot on the map means "this wallet CLAIMS this
 * country", never "this wallet is here". The map caption states this to the viewer;
 * this comment states it to whoever edits the code next.
 *
 * Covers every country in src/data_pipeline/config.py's COUNTRY_UTC_OFFSET (the only
 * countries the geo-temporal detector can produce a claim for), plus a null fallback.
 */
export const COUNTRY_CENTROIDS = {
  AU: { lat: -25.3, lon: 133.8, name: "Australia" },
  CA: { lat: 56.1, lon: -106.3, name: "Canada" },
  CN: { lat: 35.9, lon: 104.2, name: "China" },
  DE: { lat: 51.2, lon: 10.4, name: "Germany" },
  EG: { lat: 26.8, lon: 30.8, name: "Egypt" },
  FR: { lat: 46.2, lon: 2.2, name: "France" },
  GB: { lat: 54.0, lon: -2.0, name: "United Kingdom" },
  IT: { lat: 41.9, lon: 12.6, name: "Italy" },
  JP: { lat: 36.2, lon: 138.3, name: "Japan" },
  NL: { lat: 52.1, lon: 5.3, name: "Netherlands" },
  RO: { lat: 45.9, lon: 25.0, name: "Romania" },
  RU: { lat: 61.5, lon: 105.3, name: "Russia" },
  SG: { lat: 1.35, lon: 103.8, name: "Singapore" },
  US: { lat: 39.8, lon: -98.6, name: "United States" },
};

export function centroidFor(code) {
  return COUNTRY_CENTROIDS[code] ?? null;
}

/**
 * Deterministic small pixel jitter so wallets sharing a country don't stack into one
 * dot. Seeded from the wallet id, so a given wallet always lands in the same spot
 * across renders — a jitter that moved every repaint would look like real movement.
 */
export function jitterFor(seedStr, radiusPx = 9) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (h * 31 + seedStr.charCodeAt(i)) | 0;
  }
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const dist = (((h >>> 8) >>> 0) % 100) / 100 * radiusPx;
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
}
