/** Claimed country comes from the detector's own sentence — the authoritative record of
 *  what it judged. The alert row's geo_country is derived differently and disagrees for
 *  some wallets, which would place dots on the wrong country. */
export function claimedCountryFrom(reason) {
  const m = /^claims\s+([A-Z]{2})/.exec(String(reason ?? ""));
  return m ? m[1] : null;
}
